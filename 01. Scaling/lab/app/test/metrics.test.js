const test = require('node:test');
const assert = require('node:assert/strict');
const { Metrics } = require('../metrics');

test('percentiles use nearest-rank over observed samples', () => {
  const metrics = new Metrics();
  for (let ms = 1; ms <= 100; ms += 1) metrics.observe(ms);
  assert.deepEqual(metrics.snapshot().latencyMs, { samples: 100, p50: 50, p95: 95, p99: 99 });
});

test('ring buffer keeps only the most recent window', () => {
  const metrics = new Metrics({ windowSize: 3 });
  [1, 2, 3, 100, 200, 300].forEach((ms) => metrics.observe(ms));
  assert.equal(metrics.snapshot().latencyMs.p50, 200);
  assert.equal(metrics.snapshot().latencyMs.samples, 3);
});

test('empty metrics report null instead of zeros', () => {
  const snapshot = new Metrics().snapshot();
  assert.equal(snapshot.latencyMs.p95, null);
  assert.equal(snapshot.cacheHitRatio, null);
});

test('reset clears counters and samples', () => {
  const metrics = new Metrics();
  metrics.count('requests', 5);
  metrics.observe(10);
  metrics.reset();
  assert.equal(metrics.snapshot().requests, 0);
  assert.equal(metrics.snapshot().latencyMs.samples, 0);
});
