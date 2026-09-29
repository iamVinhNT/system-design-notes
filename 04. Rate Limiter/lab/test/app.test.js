const test = require('node:test');
const assert = require('node:assert/strict');
const {
  createFixedWindowLimiter,
  createTokenBucketLimiter,
  createSlidingWindowLogLimiter,
  createSlidingWindowCounterLimiter,
  createLeakyBucketLimiter,
} = require('../app');

function response() {
  return {
    headers: {},
    statusCode: 200,
    set(name, value) { this.headers[name.toLowerCase()] = String(value); return this; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

function call(limiter, clientId, now) {
  const req = { clientId };
  const res = response();
  let nextCalled = false;
  limiter({ ...req, now }, res, () => { nextCalled = true; });
  return { res, nextCalled };
}

test('fixed window allows quota, rejects overflow, and resets at boundary', () => {
  let now = 0;
  const limit = createFixedWindowLimiter({ limit: 2, windowMs: 60_000, now: () => now, key: req => req.clientId });

  assert.equal(call(limit, 'a').nextCalled, true);
  assert.equal(call(limit, 'a').nextCalled, true);
  const blocked = call(limit, 'a');
  assert.equal(blocked.nextCalled, false);
  assert.equal(blocked.res.statusCode, 429);
  assert.equal(blocked.res.headers['retry-after'], '60');
  assert.equal(blocked.res.headers['ratelimit-remaining'], '0');

  assert.equal(call(limit, 'b').nextCalled, true);
  now = 60_000;
  assert.equal(call(limit, 'a').nextCalled, true);
});

test('token bucket allows configured burst then refills over time', () => {
  let now = 0;
  const limit = createTokenBucketLimiter({ capacity: 2, refillPerSecond: 1, now: () => now, key: req => req.clientId });

  assert.equal(call(limit, 'a').nextCalled, true);
  assert.equal(call(limit, 'a').nextCalled, true);
  assert.equal(call(limit, 'a').nextCalled, false);
  now = 1_000;
  assert.equal(call(limit, 'a').nextCalled, true);
  assert.equal(call(limit, 'b').nextCalled, true);
});

test('sliding window log enforces rolling quota across fixed-window boundary', () => {
  let now = 0;
  const limit = createSlidingWindowLogLimiter({ limit: 2, windowMs: 60_000, now: () => now, key: req => req.clientId });

  assert.equal(call(limit, 'a').nextCalled, true);
  now = 1_000;
  assert.equal(call(limit, 'a').nextCalled, true);
  now = 59_000;
  assert.equal(call(limit, 'a').nextCalled, false);
  now = 60_000;
  assert.equal(call(limit, 'a').nextCalled, true);
});

test('sliding window counter estimates rolling quota without boundary double burst', () => {
  let now = 0;
  const limit = createSlidingWindowCounterLimiter({ limit: 2, windowMs: 60_000, now: () => now, key: req => req.clientId });

  assert.equal(call(limit, 'a').nextCalled, true);
  assert.equal(call(limit, 'a').nextCalled, true);
  now = 59_000;
  assert.equal(call(limit, 'a').nextCalled, false);
  now = 60_000;
  assert.equal(call(limit, 'a').nextCalled, false);
  now = 90_000;
  assert.equal(call(limit, 'a').nextCalled, true);
});

test('leaky bucket shapes accepted traffic at configured drain rate', () => {
  let now = 0;
  const limit = createLeakyBucketLimiter({ capacity: 2, leakPerSecond: 1, key: req => req.clientId, now: () => now });

  assert.equal(call(limit, 'a').nextCalled, true);
  assert.equal(call(limit, 'a').nextCalled, true);
  assert.equal(call(limit, 'a').nextCalled, false);
  now = 1_000;
  assert.equal(call(limit, 'a').nextCalled, true);
});

test('limiter emits standard quota headers on allowed requests', () => {
  const limit = createFixedWindowLimiter({ limit: 2, windowMs: 60_000, now: () => 10_000, key: req => req.clientId });
  const allowed = call(limit, 'a');

  assert.equal(allowed.res.headers['ratelimit-limit'], '2');
  assert.equal(allowed.res.headers['ratelimit-remaining'], '1');
  assert.equal(allowed.res.headers['ratelimit-reset'], '50');
});
