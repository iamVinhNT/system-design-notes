const withTimeout = (promise, ms) => {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('cache timeout')), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
};

// Cache-aside on top of Redis. The cache is an optimization only: any cache failure falls back to
// the loader (the database), so losing Redis makes reads slower, not broken.
class Cache {
  constructor(client, { ttlSeconds, timeoutMs = 300, metrics, prefix = 'cache:' }) {
    this.client = client;
    this.ttlSeconds = ttlSeconds;
    this.timeoutMs = timeoutMs;
    this.metrics = metrics;
    this.prefix = prefix;
    this.inflight = new Map();
  }

  // The loader resolves to { value, meta?, ttlSeconds? }: `meta` describes where the value came from and
  // `ttlSeconds` overrides the default TTL for this fill. Resolves to { value, meta, state } where state is
  // HIT, MISS, BYPASS, ERROR or OFF; `meta` is undefined on a HIT.
  async getOrLoad(key, loader, { bypass = false } = {}) {
    if (!this.client) return { ...(await loader()), state: 'OFF' };
    if (bypass) {
      this.metrics?.count('cache_bypass');
      return { ...(await loader()), state: 'BYPASS' };
    }
    const fullKey = this.prefix + key;
    let raw;
    try {
      raw = await withTimeout(this.client.get(fullKey), this.timeoutMs);
    } catch {
      this.metrics?.count('cache_error');
      return { ...(await loader()), state: 'ERROR' };
    }
    if (raw !== null) {
      this.metrics?.count('cache_hit');
      return { value: JSON.parse(raw), state: 'HIT' };
    }
    this.metrics?.count('cache_miss');
    return { ...(await this.fill(fullKey, loader)), state: 'MISS' };
  }

  // Concurrent misses for one key share a single database query (and its `meta`) inside this process.
  fill(fullKey, loader) {
    const pending = this.inflight.get(fullKey);
    if (pending) return pending;
    const promise = (async () => {
      const loaded = await loader();
      const ttlSeconds = loaded.ttlSeconds ?? this.ttlSeconds;
      if (loaded.value !== null && loaded.value !== undefined && ttlSeconds > 0) {
        try {
          await withTimeout(this.client.set(fullKey, JSON.stringify(loaded.value), 'EX', ttlSeconds), this.timeoutMs);
        } catch {
          this.metrics?.count('cache_error');
        }
      }
      return loaded;
    })().finally(() => this.inflight.delete(fullKey));
    this.inflight.set(fullKey, promise);
    return promise;
  }

  async invalidate(...keys) {
    if (!this.client) return;
    try {
      await withTimeout(this.client.del(...keys.map((key) => this.prefix + key)), this.timeoutMs);
    } catch {
      // Entries expire by TTL even if this delete is lost; that bounds the staleness.
      this.metrics?.count('cache_invalidate_error');
    }
  }
}

module.exports = { Cache };
