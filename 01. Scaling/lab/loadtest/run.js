// Load generator. Runs inside the compose network (see lab.sh load).
// Human-readable summary goes to stderr; one JSON line goes to stdout so lab.sh can append it to results.jsonl.
const autocannon = require('autocannon');

const POSTS = 5000;
const WORKLOADS = ['read', 'read-cold', 'write', 'mixed', 'mixed-cold'];

function parseArgs(argv) {
  const args = { workload: 'read', connections: 64, duration: 15, stage: '?', target: null };
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i].replace(/^--/, '');
    if (!(key in args)) throw new Error(`unknown option ${argv[i]}`);
    args[key] = ['connections', 'duration'].includes(key) ? Number(argv[i + 1]) : argv[i + 1];
  }
  if (!args.target) throw new Error('--target is required');
  if (!WORKLOADS.includes(args.workload)) throw new Error(`--workload must be one of ${WORKLOADS.join(', ')}`);
  return args;
}

// Skewed towards low ids: a few posts are hot, most are rarely read. Like real traffic, and what makes caching useful.
const hotId = () => 1 + Math.floor(POSTS * Math.random() ** 3);

async function login(target) {
  const response = await fetch(`${target}/api/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'loadtest' }),
  });
  if (!response.ok) throw new Error(`login failed with ${response.status}`);
  return response.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
}

function buildRequests(workload, cookie) {
  // read-cold sends `Cache-Control: no-cache`, so every read goes through to the database: a cold cache,
  // or traffic the cache cannot absorb (personalized feeds, long tail).
  const cold = workload.endsWith('-cold');
  const headers = cold ? { 'cache-control': 'no-cache' } : {};
  const byId = { method: 'GET', headers, setupRequest: (req) => ({ ...req, path: `/api/posts/${hotId()}` }) };
  const list = { method: 'GET', headers, path: '/api/posts' };
  const write = {
    method: 'POST',
    path: '/api/posts',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ title: 'load test post', body: 'written by the load generator' }),
  };
  if (workload === 'write') return [write];
  const kind = workload.replace('-cold', '');
  // Reads: 70% post detail, 30% feed. Mixed: 10% writes.
  const reads = Array.from({ length: 10 }, (_, i) => (i < 3 ? list : byId));
  if (kind === 'read') return reads;
  return [write, ...reads.slice(0, 9)];
}

const tally = (map, key) => map.set(key, (map.get(key) ?? 0) + 1);
const percentile = (sorted, p) => (sorted.length === 0 ? null : Number(sorted[Math.max(0, Math.ceil((p / 100) * sorted.length) - 1)].toFixed(2)));

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const cookie = args.workload.startsWith('read') ? '' : await login(args.target);
  const statuses = new Map();
  const headerTallies = { instance: new Map(), appCache: new Map(), edgeCache: new Map(), dbSource: new Map() };
  const latencies = [];
  const writeLatencies = [];

  const requests = buildRequests(args.workload, cookie).map((request) => ({
    ...request,
    onResponse: (status, _body, _context, headers) => {
      tally(statuses, status);
      const get = (name) => Object.entries(headers).find(([key]) => key.toLowerCase() === name)?.[1];
      tally(headerTallies.instance, get('x-instance') ?? '-');
      tally(headerTallies.appCache, get('x-app-cache') ?? '-');
      tally(headerTallies.edgeCache, get('x-edge-cache') ?? '-');
      tally(headerTallies.dbSource, get('x-db-source') ?? '-');
    },
  }));

  const instance = autocannon({ url: args.target, connections: args.connections, duration: args.duration, requests });
  // Writes are the only requests that answer 201, which lets us report their latency separately.
  instance.on('response', (_client, status, _bytes, responseTime) => {
    latencies.push(responseTime);
    if (status === 201) writeLatencies.push(responseTime);
  });
  process.stderr.write(`stage ${args.stage} | ${args.workload} | ${args.connections} connections | ${args.duration}s -> ${args.target}\n`);
  const result = await new Promise((resolve, reject) => {
    instance.on('done', resolve);
    instance.on('error', reject);
  });

  latencies.sort((a, b) => a - b);
  writeLatencies.sort((a, b) => a - b);
  const total = [...statuses.values()].reduce((sum, n) => sum + n, 0);
  const ok = [...statuses].filter(([status]) => status >= 200 && status < 400).reduce((sum, [, n]) => sum + n, 0);
  const asObject = (map) => Object.fromEntries([...map].sort());
  const summary = {
    ts: new Date().toISOString(),
    stage: args.stage,
    workload: args.workload,
    connections: args.connections,
    durationSeconds: args.duration,
    requests: total,
    rps: Math.round(total / args.duration),
    p50: percentile(latencies, 50),
    p95: percentile(latencies, 95),
    p99: percentile(latencies, 99),
    writeP95: percentile(writeLatencies, 95),
    errorRate: total === 0 ? 1 : Number(((total - ok + result.errors + result.timeouts) / (total + result.errors + result.timeouts)).toFixed(4)),
    statuses: asObject(statuses),
    connectionErrors: result.errors,
    timeouts: result.timeouts,
    instances: asObject(headerTallies.instance),
    appCache: asObject(headerTallies.appCache),
    edgeCache: asObject(headerTallies.edgeCache),
    dbSource: asObject(headerTallies.dbSource),
  };

  const line = (label, value) => process.stderr.write(`  ${label.padEnd(14)}${value}\n`);
  line('requests', `${summary.requests} (${summary.rps}/s)`);
  line('latency ms', `all p50 ${summary.p50}  p95 ${summary.p95}  p99 ${summary.p99}  | writes p95 ${summary.writeP95}`);
  line('error rate', `${(summary.errorRate * 100).toFixed(1)}%  statuses ${JSON.stringify(summary.statuses)}`);
  line('instances', JSON.stringify(summary.instances));
  line('app cache', JSON.stringify(summary.appCache));
  line('edge cache', JSON.stringify(summary.edgeCache));
  line('db source', JSON.stringify(summary.dbSource));
  process.stdout.write(`${JSON.stringify(summary)}\n`);
}

main().catch((error) => {
  process.stderr.write(`load test failed: ${error.message}\n`);
  process.exit(1);
});
