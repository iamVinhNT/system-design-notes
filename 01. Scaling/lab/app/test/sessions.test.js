const test = require('node:test');
const assert = require('node:assert/strict');
const { MemorySessionStore, RedisSessionStore, newSessionId } = require('../sessions');
const { FakeRedis } = require('./helpers');

test('memory store expires sessions after the TTL', async () => {
  let clock = 0;
  const store = new MemorySessionStore({ ttlSeconds: 10, now: () => clock });
  await store.set('a', { user: 'alice' });
  assert.deepEqual(await store.get('a'), { user: 'alice' });
  clock = 10_000;
  assert.equal(await store.get('a'), null);
});

test('memory stores of two instances do not share sessions', async () => {
  const instanceA = new MemorySessionStore({ ttlSeconds: 60 });
  const instanceB = new MemorySessionStore({ ttlSeconds: 60 });
  await instanceA.set('sid', { user: 'alice' });
  assert.equal(await instanceB.get('sid'), null);
});

test('redis stores of two instances share sessions through the same server', async () => {
  const redis = new FakeRedis();
  const instanceA = new RedisSessionStore(redis, { ttlSeconds: 60 });
  const instanceB = new RedisSessionStore(redis, { ttlSeconds: 60 });
  await instanceA.set('sid', { user: 'alice' });
  assert.deepEqual(await instanceB.get('sid'), { user: 'alice' });
  assert.deepEqual(redis.calls.find(([op]) => op === 'set').slice(-2), ['EX', 60]);
});

test('session ids are unguessable and unique', () => {
  const ids = new Set(Array.from({ length: 100 }, newSessionId));
  assert.equal(ids.size, 100);
  assert.ok([...ids].every((id) => id.length >= 24));
});
