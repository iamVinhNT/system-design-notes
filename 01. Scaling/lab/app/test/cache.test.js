const test = require('node:test');
const assert = require('node:assert/strict');
const { Cache } = require('../cache');
const { Metrics } = require('../metrics');
const { FakeRedis } = require('./helpers');

const make = (redis = new FakeRedis(), metrics = new Metrics()) => ({ redis, metrics, cache: new Cache(redis, { ttlSeconds: 30, timeoutMs: 50, metrics }) });

test('miss loads from the source, stores with TTL, then hits', async () => {
  const { cache, redis, metrics } = make();
  let loads = 0;
  const loader = async () => ({ value: { id: 1, loads: ++loads } });

  assert.deepEqual(await cache.getOrLoad('post:1', loader), { value: { id: 1, loads: 1 }, state: 'MISS' });
  assert.deepEqual(await cache.getOrLoad('post:1', loader), { value: { id: 1, loads: 1 }, state: 'HIT' });
  assert.equal(loads, 1);
  assert.deepEqual(redis.calls.find(([op]) => op === 'set'), ['set', 'cache:post:1', '{"id":1,"loads":1}', 'EX', 30]);
  assert.equal(metrics.snapshot().cacheHitRatio, 0.5);
});

test('does not cache a missing value', async () => {
  const { cache, redis } = make();
  assert.deepEqual(await cache.getOrLoad('post:9', async () => ({ value: null })), { value: null, state: 'MISS' });
  assert.equal(redis.data.size, 0);
});

test('invalidate removes the entry so the next read reloads', async () => {
  const { cache } = make();
  let version = 0;
  const loader = async () => ({ value: { version: ++version } });
  await cache.getOrLoad('k', loader);
  await cache.invalidate('k');
  assert.deepEqual(await cache.getOrLoad('k', loader), { value: { version: 2 }, state: 'MISS' });
});

test('bypass skips the cache entirely', async () => {
  const { cache, redis } = make();
  const result = await cache.getOrLoad('k', async () => ({ value: 'fresh' }), { bypass: true });
  assert.deepEqual(result, { value: 'fresh', state: 'BYPASS' });
  assert.equal(redis.calls.length, 0);
});

test('redis failure degrades to the loader instead of failing the read', async () => {
  const { cache, redis, metrics } = make();
  redis.down = true;
  assert.deepEqual(await cache.getOrLoad('k', async () => ({ value: 'from-db' })), { value: 'from-db', state: 'ERROR' });
  await cache.invalidate('k');
  assert.equal(metrics.snapshot().counters.cache_error, 1);
  assert.equal(metrics.snapshot().counters.cache_invalidate_error, 1);
});

test('a slow redis is treated as a failure after the timeout', async () => {
  const slow = { get: () => new Promise(() => {}), set: async () => 'OK', del: async () => 1 };
  const cache = new Cache(slow, { ttlSeconds: 30, timeoutMs: 20 });
  assert.deepEqual(await cache.getOrLoad('k', async () => ({ value: 'from-db' })), { value: 'from-db', state: 'ERROR' });
});

test('concurrent misses share one load per key', async () => {
  const { cache } = make();
  let loads = 0;
  const loader = async () => {
    loads += 1;
    await new Promise((resolve) => setTimeout(resolve, 10));
    return { value: 'value', meta: 'primary' };
  };
  const results = await Promise.all([cache.getOrLoad('k', loader), cache.getOrLoad('k', loader), cache.getOrLoad('k', loader)]);
  assert.equal(loads, 1);
  assert.deepEqual(results.map((r) => r.meta), ['primary', 'primary', 'primary'], 'joiners report where the value really came from');
});

test('without a client every read is a plain load', async () => {
  const cache = new Cache(null, { ttlSeconds: 30 });
  assert.deepEqual(await cache.getOrLoad('k', async () => ({ value: 1 })), { value: 1, state: 'OFF' });
});

test('a loader can shorten the TTL of its own fill', async () => {
  const { cache, redis } = make();
  await cache.getOrLoad('k', async () => ({ value: 'from-replica', ttlSeconds: 2 }));
  assert.deepEqual(redis.calls.find(([op]) => op === 'set').slice(-2), ['EX', 2]);
});

test('a zero TTL skips the cache write instead of sending an invalid EX 0', async () => {
  const { cache, redis } = make();
  await cache.getOrLoad('k', async () => ({ value: 'v', ttlSeconds: 0 }));
  assert.equal(redis.calls.some(([op]) => op === 'set'), false);
});
