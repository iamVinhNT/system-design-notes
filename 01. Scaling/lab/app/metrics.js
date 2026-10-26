// Per-instance, in-memory metrics. Latency uses a fixed ring buffer of the most recent requests,
// so percentiles describe recent behavior and memory stays bounded.
class Metrics {
  constructor({ windowSize = 5000, now = () => Date.now() } = {}) {
    this.now = now;
    this.samples = new Float64Array(windowSize);
    this.startedAt = now();
    this.reset();
  }

  reset() {
    this.next = 0;
    this.filled = 0;
    this.counters = new Map();
  }

  count(name, amount = 1) {
    this.counters.set(name, (this.counters.get(name) ?? 0) + amount);
  }

  observe(durationMs) {
    this.samples[this.next] = durationMs;
    this.next = (this.next + 1) % this.samples.length;
    this.filled = Math.min(this.filled + 1, this.samples.length);
  }

  percentile(sorted, p) {
    if (sorted.length === 0) return null;
    const rank = Math.max(1, Math.ceil((p / 100) * sorted.length));
    return Number(sorted[rank - 1].toFixed(2));
  }

  snapshot() {
    const sorted = Array.from(this.samples.subarray(0, this.filled)).sort((a, b) => a - b);
    const counters = Object.fromEntries([...this.counters].sort());
    const hits = counters.cache_hit ?? 0;
    const lookups = hits + (counters.cache_miss ?? 0) + (counters.cache_error ?? 0);
    return {
      uptimeSeconds: Math.floor((this.now() - this.startedAt) / 1000),
      requests: counters.requests ?? 0,
      latencyMs: { samples: sorted.length, p50: this.percentile(sorted, 50), p95: this.percentile(sorted, 95), p99: this.percentile(sorted, 99) },
      cacheHitRatio: lookups === 0 ? null : Number((hits / lookups).toFixed(3)),
      counters,
    };
  }
}

module.exports = { Metrics };
