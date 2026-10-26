const test = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../server');
const { Cache } = require('../cache');
const { Metrics } = require('../metrics');
const { PostRepository } = require('../posts');
const { MemorySessionStore, RedisSessionStore } = require('../sessions');
const { FakeRedis, FakePool, listen } = require('./helpers');

const baseConfig = { instanceId: 'app1', sessionTtlSeconds: 60, readAfterWriteSeconds: 0, edgeMaxAgeSeconds: 0, replicaFillTtlSeconds: 2 };

// A tiny in-memory "database" so the whole stack runs without Postgres.
function fakeDatabase() {
  const rows = new Map();
  let nextId = 1;
  const db = new FakePool((sql, params) => {
    if (sql.startsWith('INSERT')) {
      const id = nextId++;
      rows.set(id, { id, author: params[0], title: params[1], body: params[2], commentCount: 0 });
      return [{ id }];
    }
    if (sql.startsWith('UPDATE')) {
      Object.assign(rows.get(Number(params[0])), { title: params[1], body: params[2] });
      return [];
    }
    if (sql.startsWith('SELECT author')) return rows.has(Number(params[0])) ? [{ author: rows.get(Number(params[0])).author }] : [];
    if (sql.includes('WHERE p.id')) return rows.has(Number(params[0])) ? [rows.get(Number(params[0]))] : [];
    return [...rows.values()].reverse().slice(0, 20);
  });
  return db;
}

async function start({ config = {}, redis = null, sessions, primary = fakeDatabase(), replica = null } = {}) {
  const metrics = new Metrics();
  const merged = { ...baseConfig, ...config };
  const app = createApp({
    posts: new PostRepository({ primary, replica, metrics }),
    sessions: sessions ?? new MemorySessionStore({ ttlSeconds: 60 }),
    cache: redis ? new Cache(redis, { ttlSeconds: 30, metrics }) : null,
    metrics,
    config: merged,
  });
  const { server, url } = await listen(app);
  return { url, metrics, primary, replica, close: () => server.close() };
}

const json = (body, extra = {}) => ({ method: 'POST', headers: { 'content-type': 'application/json', ...extra.headers }, body: JSON.stringify(body) });
const cookieOf = (response) => response.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');

async function login(url, username = 'alice') {
  const response = await fetch(`${url}/api/login`, json({ username }));
  assert.equal(response.status, 200);
  return cookieOf(response);
}

test('login creates a session that /api/me accepts; without it /api/me is 401', async (t) => {
  const { url, close } = await start();
  t.after(close);
  assert.equal((await fetch(`${url}/api/me`)).status, 401);
  const cookie = await login(url);
  const me = await fetch(`${url}/api/me`, { headers: { cookie } });
  assert.deepEqual(await me.json(), { user: 'alice' });
});

test('rejects invalid usernames and invalid posts', async (t) => {
  const { url, close } = await start();
  t.after(close);
  assert.equal((await fetch(`${url}/api/login`, json({ username: 'bad name!' }))).status, 400);
  const cookie = await login(url);
  assert.equal((await fetch(`${url}/api/posts`, json({ title: '', body: 'x' }, { headers: { cookie } }))).status, 400);
  assert.equal((await fetch(`${url}/api/posts`, json({ title: 't', body: 'x' }))).status, 401);
  assert.equal((await fetch(`${url}/api/posts/abc`)).status, 400);
  assert.equal((await fetch(`${url}/api/posts/999`)).status, 404);
});

test('memory sessions are per instance: a session made on one instance is unknown to another', async (t) => {
  const a = await start();
  const b = await start({ config: { instanceId: 'app2' } });
  t.after(() => { a.close(); b.close(); });
  const cookie = await login(a.url);
  assert.equal((await fetch(`${a.url}/api/me`, { headers: { cookie } })).status, 200);
  assert.equal((await fetch(`${b.url}/api/me`, { headers: { cookie } })).status, 401);
});

test('redis sessions work across instances and a store outage returns 503, not a crash', async (t) => {
  const redis = new FakeRedis();
  const make = (instanceId) => start({ config: { instanceId }, sessions: new RedisSessionStore(redis, { ttlSeconds: 60 }) });
  const a = await make('app1');
  const b = await make('app2');
  t.after(() => { a.close(); b.close(); });
  const cookie = await login(a.url);
  assert.equal((await fetch(`${b.url}/api/me`, { headers: { cookie } })).status, 200);

  redis.down = true;
  assert.equal((await fetch(`${b.url}/api/me`, { headers: { cookie } })).status, 503);
  assert.equal((await fetch(`${b.url}/api/login`, json({ username: 'bob' }))).status, 503);
  assert.equal((await fetch(`${b.url}/api/posts`)).status, 200, 'anonymous reads do not need the session store');
});

test('cache-aside: second read is a HIT; update invalidates the post and the list', async (t) => {
  const redis = new FakeRedis();
  const { url, primary, close } = await start({ redis });
  t.after(close);
  const cookie = await login(url);
  const created = await (await fetch(`${url}/api/posts`, json({ title: 'first', body: 'hello' }, { headers: { cookie } }))).json();

  const first = await fetch(`${url}/api/posts/${created.id}`);
  assert.equal(first.headers.get('x-app-cache'), 'MISS');
  assert.equal(first.headers.get('x-db-source'), 'primary');
  const second = await fetch(`${url}/api/posts/${created.id}`);
  assert.equal(second.headers.get('x-app-cache'), 'HIT');
  assert.equal(second.headers.get('x-db-source'), 'cache');

  await fetch(`${url}/api/posts`);
  const queriesBefore = primary.queries.length;
  await fetch(`${url}/api/posts`);
  assert.equal(primary.queries.length, queriesBefore, 'cached list does not touch the database');

  const put = await fetch(`${url}/api/posts/${created.id}`, { ...json({ title: 'edited', body: 'hello' }, { headers: { cookie } }), method: 'PUT' });
  assert.equal(put.status, 200);
  const after = await fetch(`${url}/api/posts/${created.id}`);
  assert.equal(after.headers.get('x-app-cache'), 'MISS');
  assert.equal((await after.json()).title, 'edited');
});

test('only the author can edit a post', async (t) => {
  const { url, close } = await start();
  t.after(close);
  const alice = await login(url, 'alice');
  const bob = await login(url, 'bob');
  const created = await (await fetch(`${url}/api/posts`, json({ title: 't', body: 'b' }, { headers: { cookie: alice } }))).json();
  const response = await fetch(`${url}/api/posts/${created.id}`, { ...json({ title: 'x', body: 'y' }, { headers: { cookie: bob } }), method: 'PUT' });
  assert.equal(response.status, 403);
});

test('redis outage on the read path serves from the database', async (t) => {
  const redis = new FakeRedis();
  const { url, close } = await start({ redis });
  t.after(close);
  redis.down = true;
  const response = await fetch(`${url}/api/posts`);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('x-app-cache'), 'ERROR');
  assert.equal(response.headers.get('x-db-source'), 'primary');
});

test('read-your-writes: after a write the author reads the primary and skips the cache', async (t) => {
  const redis = new FakeRedis();
  const primary = fakeDatabase();
  const staleReplica = new FakePool(() => []);
  const { url, close } = await start({ config: { readAfterWriteSeconds: 10 }, redis, primary, replica: staleReplica });
  t.after(close);
  const cookie = await login(url);
  const create = await fetch(`${url}/api/posts`, json({ title: 't', body: 'b' }, { headers: { cookie } }));
  const created = await create.json();
  const writerCookie = `${cookie}; ${cookieOf(create)}`;

  const anonymous = await fetch(`${url}/api/posts/${created.id}`);
  assert.equal(anonymous.status, 404, 'a lagging replica has not seen the post yet');
  assert.equal(anonymous.headers.get('x-db-source'), 'replica');

  const author = await fetch(`${url}/api/posts/${created.id}`, { headers: { cookie: writerCookie } });
  assert.equal(author.status, 200);
  assert.equal(author.headers.get('x-db-source'), 'primary');
  assert.equal(author.headers.get('x-app-cache'), 'BYPASS');
});

test('only anonymous reads are marked shareable for the edge cache', async (t) => {
  const { url, close } = await start({ config: { edgeMaxAgeSeconds: 5 } });
  t.after(close);
  const anonymous = await fetch(`${url}/api/posts`);
  assert.equal(anonymous.headers.get('cache-control'), 'public, max-age=5');
  const cookie = await login(url);
  const authenticated = await fetch(`${url}/api/posts`, { headers: { cookie } });
  assert.equal(authenticated.headers.get('cache-control'), 'no-store');
  assert.equal((await fetch(`${url}/api/posts/999`)).headers.get('cache-control'), 'no-store');
});

test('metrics count requests but not metrics or health probes', async (t) => {
  const { url, close } = await start();
  t.after(close);
  await fetch(`${url}/api/posts`);
  await fetch(`${url}/healthz`);
  const metrics = await (await fetch(`${url}/metrics`)).json();
  assert.equal(metrics.requests, 1);
  assert.equal(metrics.instance, 'app1');
  assert.equal((await fetch(`${url}/metrics/reset`, { method: 'POST' })).status, 204);
  assert.equal((await (await fetch(`${url}/metrics`)).json()).requests, 0);
});

test('a last_write cookie from the future does not pin the reader to the primary', async (t) => {
  const redis = new FakeRedis();
  const { url, close } = await start({ config: { readAfterWriteSeconds: 10 }, redis, replica: fakeDatabase() });
  t.after(close);
  const forged = await fetch(`${url}/api/posts`, { headers: { cookie: `last_write=${Date.now() + 3_600_000}` } });
  assert.equal(forged.headers.get('x-app-cache'), 'MISS', 'forged marker must not bypass the cache');
  assert.equal(forged.headers.get('x-db-source'), 'replica');
});

test('values filled from a replica are cached briefly, so replica lag cannot outlive a short TTL', async (t) => {
  const redis = new FakeRedis();
  const { url, close } = await start({ redis, replica: fakeDatabase() });
  t.after(close);
  await fetch(`${url}/api/posts`);
  assert.deepEqual(redis.calls.find(([op]) => op === 'set').slice(-2), ['EX', 2]);
});

test('X-Db-Source stays truthful when concurrent misses share one load', async (t) => {
  const redis = new FakeRedis();
  const slowDatabase = new FakePool(async () => {
    await new Promise((resolve) => setTimeout(resolve, 50));
    return [];
  });
  const { url, close } = await start({ redis, primary: slowDatabase });
  t.after(close);
  const responses = await Promise.all(Array.from({ length: 5 }, () => fetch(`${url}/api/posts`)));
  assert.equal(slowDatabase.queries.length, 1, 'misses share one query');
  for (const response of responses) {
    assert.equal(response.headers.get('x-app-cache'), 'MISS');
    assert.equal(response.headers.get('x-db-source'), 'primary');
  }
});
