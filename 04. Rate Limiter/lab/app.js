function setHeaders(res, limit, remaining, resetSeconds) {
  res.set('RateLimit-Limit', limit);
  res.set('RateLimit-Remaining', Math.max(0, remaining));
  res.set('RateLimit-Reset', resetSeconds);
}

function createFixedWindowLimiter({ limit, windowMs, key, now = Date.now }) {
  const counters = new Map();

  return (req, res, next) => {
    const current = now();
    const windowStart = Math.floor(current / windowMs) * windowMs;
    const resetAt = windowStart + windowMs;
    const id = key(req);
    const previous = counters.get(id);
    const count = (previous?.windowStart === windowStart ? previous.count : 0) + 1;
    counters.set(id, { windowStart, count });
    const remaining = Math.max(0, limit - count);
    const retryAfter = Math.max(1, Math.ceil((resetAt - current) / 1000));

    setHeaders(res, limit, remaining, retryAfter);
    if (count > limit) {
      res.set('Retry-After', retryAfter).status(429).json({ error: 'Too many requests' });
      return;
    }
    next();
  };
}

function createTokenBucketLimiter({ capacity, refillPerSecond, key, now = Date.now }) {
  const buckets = new Map();

  return (req, res, next) => {
    const current = now();
    const id = key(req);
    const previous = buckets.get(id) ?? { tokens: capacity, updatedAt: current };
    const tokens = Math.min(capacity, previous.tokens + (current - previous.updatedAt) * refillPerSecond / 1000);
    const allowed = tokens >= 1;
    const remaining = allowed ? tokens - 1 : tokens;
    const retryAfter = allowed ? 0 : Math.max(1, Math.ceil((1 - tokens) / refillPerSecond));
    buckets.set(id, { tokens: remaining, updatedAt: current });

    setHeaders(res, capacity, Math.floor(remaining), retryAfter);
    if (!allowed) {
      res.set('Retry-After', retryAfter).status(429).json({ error: 'Too many requests' });
      return;
    }
    next();
  };
}

function createSlidingWindowLogLimiter({ limit, windowMs, key, now = Date.now }) {
  const requests = new Map();

  return (req, res, next) => {
    const current = now();
    const id = key(req);
    const timestamps = (requests.get(id) ?? []).filter(timestamp => timestamp > current - windowMs);
    const allowed = timestamps.length < limit;
    if (allowed) timestamps.push(current);
    requests.set(id, timestamps);

    const oldest = timestamps[0] ?? current;
    const retryAfter = allowed ? 0 : Math.max(1, Math.ceil((oldest + windowMs - current) / 1000));
    setHeaders(res, limit, limit - timestamps.length, retryAfter);
    if (!allowed) {
      res.set('Retry-After', retryAfter).status(429).json({ error: 'Too many requests' });
      return;
    }
    next();
  };
}

function createSlidingWindowCounterLimiter({ limit, windowMs, key, now = Date.now }) {
  const counters = new Map();

  return (req, res, next) => {
    const current = now();
    const windowStart = Math.floor(current / windowMs) * windowMs;
    const elapsed = current - windowStart;
    const id = key(req);
    let state = counters.get(id);
    if (!state || state.windowStart !== windowStart) {
      state = state?.windowStart === windowStart - windowMs
        ? { windowStart, previous: state.current, current: 0 }
        : { windowStart, previous: 0, current: 0 };
    }

    const weight = 1 - elapsed / windowMs;
    const estimated = state.previous * weight + state.current;
    const allowed = estimated < limit;
    if (allowed) state.current++;
    counters.set(id, state);

    const retryAfter = allowed ? 0 : Math.max(1, Math.ceil((windowMs - elapsed) / 1000));
    setHeaders(res, limit, Math.floor(Math.max(0, limit - estimated - (allowed ? 1 : 0))), retryAfter);
    if (!allowed) {
      res.set('Retry-After', retryAfter).status(429).json({ error: 'Too many requests' });
      return;
    }
    next();
  };
}

function createLeakyBucketLimiter({ capacity, leakPerSecond, key, now = Date.now }) {
  const buckets = new Map();

  return (req, res, next) => {
    const current = now();
    const id = key(req);
    const previous = buckets.get(id) ?? { water: 0, updatedAt: current };
    const water = Math.max(0, previous.water - (current - previous.updatedAt) * leakPerSecond / 1000);
    const allowed = water + 1 <= capacity;
    const nextWater = allowed ? water + 1 : water;
    const retryAfter = allowed ? 0 : Math.max(1, Math.ceil((water + 1 - capacity) / leakPerSecond));
    buckets.set(id, { water: nextWater, updatedAt: current });

    setHeaders(res, capacity, Math.floor(capacity - nextWater), retryAfter);
    if (!allowed) {
      res.set('Retry-After', retryAfter).status(429).json({ error: 'Too many requests' });
      return;
    }
    next();
  };
}

function clientKey(req) {
  return req.user?.id ?? req.socket.remoteAddress ?? 'unknown';
}

if (require.main === module) {
  const express = require('express');
  const app = express();
  const minute = 60_000;
  const profileLimit = createFixedWindowLimiter({ limit: 60, windowMs: minute, key: clientKey });
  const loginLimit = createTokenBucketLimiter({ capacity: 5, refillPerSecond: 5 / 60, key: req => req.socket.remoteAddress ?? 'unknown' });

  app.set('trust proxy', false);
  app.get('/api/users/:id', profileLimit, (req, res) => res.json({ id: req.params.id }));
  app.post('/api/login', loginLimit, (req, res) => res.json({ ok: true }));
  app.listen(3000, () => process.stdout.write('Listening on http://localhost:3000\n'));
}

module.exports = {
  createFixedWindowLimiter,
  createTokenBucketLimiter,
  createSlidingWindowLogLimiter,
  createSlidingWindowCounterLimiter,
  createLeakyBucketLimiter,
};
