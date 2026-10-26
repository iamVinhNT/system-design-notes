// Integration check for one stage on the real Compose topology. Run through `./lab.sh smoke <stage>`.
// Failure injection goes through `./lab.sh chaos`, so the same commands a learner types are the ones verified here.
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const LAB_DIR = path.resolve(__dirname, '..');
const stage = Number(process.argv[2]);
if (!Number.isInteger(stage) || stage < 0 || stage > 5) throw new Error('usage: node smoke/smoke.js <0-5>');

const ENTRY = 'http://127.0.0.1:8080';
// App1 stays reachable on its own port: stage 0 serves there directly, later stages keep 8081 for debugging.
const DIRECT = stage === 0 ? ENTRY : 'http://127.0.0.1:8081';

const lab = (...args) => execFileSync(path.join(LAB_DIR, 'lab.sh'), args, { cwd: LAB_DIR, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function psql(service, sql) {
  return execFileSync('docker', ['compose', '-p', 'scaling-lab', 'exec', '-T', service, 'psql', '-U', 'lab', '-d', 'lab', '-tAc', sql], { cwd: LAB_DIR, encoding: 'utf8' }).trim();
}

// Minimal cookie-jar HTTP client: lets us behave like one browser (login, then reuse the session).
class Client {
  constructor(base) {
    this.base = base;
    this.cookies = new Map();
  }

  async request(pathname, { method = 'GET', json, headers = {} } = {}) {
    const cookie = [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; ');
    const response = await fetch(this.base + pathname, {
      method,
      headers: { ...(json ? { 'content-type': 'application/json' } : {}), ...(cookie ? { cookie } : {}), ...headers },
      body: json ? JSON.stringify(json) : undefined,
    });
    for (const setCookie of response.headers.getSetCookie()) {
      const [pair] = setCookie.split(';');
      const index = pair.indexOf('=');
      this.cookies.set(pair.slice(0, index), pair.slice(index + 1));
    }
    const text = await response.text();
    let body = null;
    try { body = JSON.parse(text); } catch { body = text; }
    return { status: response.status, headers: response.headers, body };
  }

  async login(username) {
    const response = await this.request('/api/login', { method: 'POST', json: { username } });
    assert.equal(response.status, 200, `login failed: ${JSON.stringify(response.body)}`);
  }
}

const results = [];
async function step(acs, name, fn) {
  try {
    await fn();
    results.push({ ok: true });
    process.stdout.write(`  PASS ${acs.padEnd(10)} ${name}\n`);
  } catch (error) {
    results.push({ ok: false });
    process.stdout.write(`  FAIL ${acs.padEnd(10)} ${name}\n         ${String(error.message).split('\n').join('\n         ')}\n`);
  }
}

async function eventually(fn, { timeoutMs = 20_000, intervalMs = 500, label = 'condition' } = {}) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const value = await fn();
      if (value !== false) return value;
    } catch (error) {
      lastError = error;
    }
    await sleep(intervalMs);
  }
  throw new Error(`timed out waiting for ${label}${lastError ? `: ${lastError.message}` : ''}`);
}

const instancesSeen = async (client, requests = 30) => {
  const seen = new Set();
  for (let i = 0; i < requests; i += 1) seen.add((await client.request('/api/posts')).headers.get('x-instance'));
  return seen;
};

const appMetrics = () => lab('metrics').split('\n').filter((line) => line.startsWith('{')).map((line) => JSON.parse(line));

// Wait until the load balancer sees every instance again after a restart (passive health check window is 5s).
const waitForAllInstances = (client) => eventually(async () => (await instancesSeen(client, 12)).size === 3, { label: 'all 3 app instances behind the load balancer' });

async function coreFunctions() {
  const client = new Client(DIRECT);
  await step('AC2', 'health, login, /me, create, read, list, update', async () => {
    assert.equal((await client.request('/healthz')).status, 200);
    await client.login('smoke');
    assert.equal((await client.request('/api/me')).body.user, 'smoke');
    const created = await client.request('/api/posts', { method: 'POST', json: { title: 'smoke post', body: 'created by smoke test' } });
    assert.equal(created.status, 201);
    const id = created.body.id;
    assert.equal((await client.request(`/api/posts/${id}`)).body.title, 'smoke post');
    assert.ok((await client.request('/api/posts')).body.items.some((post) => post.id === id), 'new post missing from list');
    const updated = await client.request(`/api/posts/${id}`, { method: 'PUT', json: { title: 'smoke post v2', body: 'edited' } });
    assert.equal(updated.status, 200);
    assert.equal((await client.request(`/api/posts/${id}`)).body.title, 'smoke post v2');
    assert.equal((await new Client(DIRECT).request('/api/posts', { method: 'POST', json: { title: 'x', body: 'y' } })).status, 401);
  });

  await step('AC11', '/metrics exposes requests, latency percentiles, cache counters and instance id', async () => {
    const metrics = (await client.request('/metrics')).body;
    assert.equal(metrics.instance, 'app1');
    assert.ok(metrics.requests > 0);
    assert.ok(metrics.latencyMs.p95 !== null && metrics.latencyMs.p99 !== null);
    assert.equal(typeof metrics.counters, 'object');
  });

  await step('AC14', 'every published port is bound to 127.0.0.1 only', async () => {
    const ports = execFileSync('docker', ['ps', '--filter', 'label=com.docker.compose.project=scaling-lab', '--format', '{{.Ports}}'], { encoding: 'utf8' });
    assert.ok(ports.includes('127.0.0.1:'), 'expected at least one published port');
    assert.ok(!/0\.0\.0\.0:|\[::\]:/.test(ports), `found a public bind:\n${ports}`);
  });
}

async function stage0() {
  await step('AC3', 'single app saturates its CPU quota under read load and p95 degrades', async () => {
    const load = new Promise((resolve) => {
      const output = [];
      const child = require('node:child_process').spawn(path.join(LAB_DIR, 'lab.sh'), ['load', 'read', '64', '12'], { cwd: LAB_DIR });
      child.stderr.on('data', (chunk) => output.push(chunk));
      child.on('close', () => resolve(Buffer.concat(output).toString()));
    });
    await sleep(7000);
    const cpu = Number(execFileSync('docker', ['stats', '--no-stream', '--format', '{{.CPUPerc}}', 'scaling-lab-app1-1'], { encoding: 'utf8' }).replace('%', ''));
    const summary = await load;
    const p95 = Number(/p95 ([\d.]+)/.exec(summary)?.[1]);
    process.stdout.write(`         app1 CPU ${cpu.toFixed(0)}% (quota 50%), p95 ${p95} ms\n`);
    assert.ok(cpu >= 40, `app1 CPU only ${cpu}% of a core; quota is 50%`);
    assert.ok(p95 > 50, `p95 ${p95} ms is not degraded`);
  });
}

async function stage1() {
  const client = new Client(ENTRY);
  await step('AC4', 'load balancer spreads requests over 3 instances', async () => {
    assert.equal((await instancesSeen(client)).size, 3);
  });

  await step('AC4', 'in-memory sessions break behind the load balancer (401 on other instances)', async () => {
    await client.login('smoke');
    let unauthorized = 0;
    for (let i = 0; i < 20; i += 1) if ((await client.request('/api/me')).status === 401) unauthorized += 1;
    process.stdout.write(`         ${unauthorized}/20 calls to /api/me returned 401\n`);
    assert.ok(unauthorized >= 1, 'expected stateful sessions to fail on some instance');
  });

  await step('AC4', 'read throughput is higher than stage 0 with the same workload', async () => {
    const baseline = latestResult(0, 'read');
    if (!baseline) throw new Error('no stage 0 read result in results.jsonl: run ./lab.sh smoke 0 first');
    lab('load', 'read', '64', '12');
    const current = latestResult(1, 'read');
    process.stdout.write(`         stage 0: ${baseline.rps} rps, stage 1: ${current.rps} rps\n`);
    assert.ok(current.rps > baseline.rps, 'stage 1 should serve more requests per second than stage 0');
  });

  await step('AC4', 'killing one instance does not fail reads', async () => {
    lab('chaos', 'kill-app', 'app2');
    try {
      for (let i = 0; i < 20; i += 1) assert.equal((await client.request('/api/posts')).status, 200);
    } finally {
      lab('chaos', 'start-app', 'app2');
    }
    await waitForAllInstances(client);
  });
}

async function stage2() {
  const client = new Client(ENTRY);
  await step('AC5', 'sessions work on every instance (20/20 /api/me)', async () => {
    await client.login('smoke');
    for (let i = 0; i < 20; i += 1) assert.equal((await client.request('/api/me')).status, 200, `call ${i + 1}`);
  });

  await step('AC5', 'sessions survive the loss of an app instance', async () => {
    lab('chaos', 'kill-app', 'app2');
    try {
      for (let i = 0; i < 20; i += 1) assert.equal((await client.request('/api/me')).status, 200, `call ${i + 1}`);
    } finally {
      lab('chaos', 'start-app', 'app2');
    }
    await waitForAllInstances(client);
  });
}

async function stage3() {
  const anonymous = new Client(ENTRY);
  const author = new Client(ENTRY);
  await author.login('user7'); // seeded post 7 belongs to user7

  await step('AC6', 'second read of a post is a cache hit served without the database', async () => {
    lab('chaos', 'flush-cache');
    const first = await anonymous.request('/api/posts/7');
    assert.equal(first.headers.get('x-app-cache'), 'MISS');
    const second = await anonymous.request('/api/posts/7');
    assert.equal(second.headers.get('x-app-cache'), 'HIT');
    assert.equal(second.headers.get('x-db-source'), 'cache');
    const hits = appMetrics().reduce((sum, m) => sum + (m.counters.cache_hit ?? 0), 0);
    assert.ok(hits > 0, 'cache_hit counter did not move');
  });

  await step('AC6', 'an update invalidates the cached post immediately', async () => {
    const title = `edited ${Date.now()}`;
    assert.equal((await author.request('/api/posts/7', { method: 'PUT', json: { title, body: 'edited body' } })).status, 200);
    const after = await anonymous.request('/api/posts/7');
    assert.equal(after.body.title, title);
    assert.equal(after.headers.get('x-app-cache'), 'MISS');
  });

  await step('AC6', 'flushing the cache only makes reads slower; sessions are untouched', async () => {
    lab('chaos', 'flush-cache');
    const read = await anonymous.request('/api/posts');
    assert.equal(read.status, 200);
    assert.equal(read.headers.get('x-app-cache'), 'MISS');
    assert.equal((await author.request('/api/me')).status, 200);
  });

  await step('AC7', 'with Redis down, reads fall back to the database (no 5xx)', async () => {
    lab('chaos', 'stop-redis');
    try {
      for (let i = 0; i < 10; i += 1) {
        const read = await anonymous.request('/api/posts/7');
        assert.equal(read.status, 200);
        assert.equal(read.headers.get('x-app-cache'), 'ERROR');
        assert.equal(read.headers.get('x-db-source'), 'primary');
      }
      // Sessions live in the same Redis, so logged-in calls fail loudly with 503 instead of pretending to work.
      assert.equal((await author.request('/api/me')).status, 503);
    } finally {
      lab('chaos', 'start-redis');
    }
    await eventually(async () => (await anonymous.request('/api/posts/7')).headers.get('x-app-cache') !== 'ERROR', { label: 'apps to reconnect to Redis' });
  });
}

async function stage4() {
  const author = new Client(ENTRY);
  const reader = () => new Client(ENTRY);
  const noCache = { 'cache-control': 'no-cache' };
  await author.login('smoke');

  await step('AC8', 'replica is a real streaming standby of the primary', async () => {
    assert.equal(psql('replica', 'select pg_is_in_recovery()'), 't');
    assert.ok(Number(psql('db', "select count(*) from pg_stat_replication where state = 'streaming'")) >= 1);
  });

  await step('AC8', 'a write on the primary appears on the replica and reads are served by it', async () => {
    const created = await author.request('/api/posts', { method: 'POST', json: { title: 'replicated', body: 'row' } });
    assert.equal(created.status, 201);
    await eventually(() => psql('replica', `select count(*) from posts where id = ${created.body.id}`) === '1', { label: 'row to reach the replica' });
    const read = await reader().request(`/api/posts/${created.body.id}`, { headers: noCache });
    assert.equal(read.status, 200);
    assert.equal(read.headers.get('x-db-source'), 'replica');
  });

  await step('AC8/AC9', 'with replication lag the world sees stale data, but the author reads their own write', async () => {
    lab('chaos', 'replica-lag', 'on');
    try {
      const created = await author.request('/api/posts', { method: 'POST', json: { title: 'written during lag', body: 'row' } });
      assert.equal(created.status, 201);
      const id = created.body.id;

      const stale = await reader().request(`/api/posts/${id}`, { headers: noCache });
      assert.equal(stale.status, 404, 'a lagging replica should not have the new post yet');
      assert.equal(stale.headers.get('x-db-source'), 'replica');

      const own = await author.request(`/api/posts/${id}`);
      assert.equal(own.status, 200);
      assert.equal(own.headers.get('x-db-source'), 'primary');
      assert.equal(own.headers.get('x-app-cache'), 'BYPASS');

      lab('chaos', 'replica-lag', 'off');
      await eventually(async () => (await reader().request(`/api/posts/${id}`, { headers: noCache })).status === 200, { label: 'replica to catch up' });
    } finally {
      lab('chaos', 'replica-lag', 'off');
    }
  });

  await step('AC8', 'with the replica stopped, reads fall back to the primary', async () => {
    lab('chaos', 'stop-replica');
    try {
      for (let i = 0; i < 5; i += 1) {
        const read = await reader().request('/api/posts/1', { headers: noCache });
        assert.equal(read.status, 200);
        assert.equal(read.headers.get('x-db-source'), 'primary');
      }
    } finally {
      lab('chaos', 'start-replica');
    }
    await eventually(() => psql('replica', 'select pg_is_in_recovery()') === 't', { label: 'replica to restart', timeoutMs: 60_000 });
  });
}

async function stage5() {
  const anonymous = new Client(ENTRY);
  const member = new Client(ENTRY);
  await member.login('smoke');

  await step('AC10', 'repeated anonymous reads are served by the edge cache without reaching the app', async () => {
    await anonymous.request('/api/posts/3'); // fill (or refresh) the entry
    lab('metrics', 'reset');
    let hits = 0;
    for (let i = 0; i < 10; i += 1) if ((await anonymous.request('/api/posts/3')).headers.get('x-edge-cache') === 'HIT') hits += 1;
    const reachedApp = appMetrics().reduce((sum, m) => sum + m.requests, 0);
    process.stdout.write(`         ${hits}/10 edge hits, ${reachedApp} requests reached the app\n`);
    assert.ok(hits >= 9, 'expected the edge to answer almost every request');
    assert.ok(reachedApp <= 1, 'edge hits must not reach the app');
  });

  await step('AC10', 'requests carrying a session never read from or fill the shared cache', async () => {
    for (let i = 0; i < 3; i += 1) {
      const response = await member.request('/api/posts/3');
      assert.notEqual(response.headers.get('x-edge-cache'), 'HIT');
      assert.equal(response.headers.get('cache-control'), 'no-store');
    }
  });
}

function latestResult(forStage, workload) {
  const file = path.join(LAB_DIR, 'results.jsonl');
  if (!fs.existsSync(file)) return null;
  const rows = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line));
  return rows.filter((row) => Number(row.stage) === forStage && row.workload === workload).pop() ?? null;
}

(async () => {
  process.stdout.write(`smoke stage ${stage}\n`);
  await coreFunctions();
  await [stage0, stage1, stage2, stage3, stage4, stage5][stage]();
  const failed = results.filter((result) => !result.ok).length;
  process.stdout.write(`stage ${stage}: ${results.length - failed}/${results.length} checks passed\n`);
  process.exit(failed === 0 ? 0 : 1);
})().catch((error) => {
  process.stderr.write(`smoke crashed: ${error.stack}\n`);
  process.exit(1);
});
