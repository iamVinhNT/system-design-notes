function intFrom(env, key, fallback) {
  const raw = env[key];
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0) throw new RangeError(`${key} must be a non-negative integer`);
  return value;
}

function loadConfig(env = process.env) {
  const sessionStore = env.SESSION_STORE ?? 'memory';
  if (!['memory', 'redis'].includes(sessionStore)) throw new RangeError('SESSION_STORE must be memory or redis');
  return {
    port: intFrom(env, 'PORT', 3000),
    instanceId: env.INSTANCE_ID ?? 'app',
    primaryUrl: env.PRIMARY_URL ?? 'postgres://lab:labpass@localhost:5432/lab',
    replicaUrl: env.REPLICA_URL || null,
    redisUrl: env.REDIS_URL ?? 'redis://localhost:6379',
    sessionStore,
    cacheEnabled: env.CACHE === 'on',
    // Lab only: lets a client send `Cache-Control: no-cache` to read through the cache (cold-cache traffic).
    allowCacheBypass: env.ALLOW_CACHE_BYPASS === 'on',
    cacheTtlSeconds: intFrom(env, 'CACHE_TTL_SECONDS', 30),
    // A value read from a possibly lagging replica is cached only briefly, so a stale copy cannot outlive the lag by 30s.
    replicaFillTtlSeconds: intFrom(env, 'REPLICA_FILL_TTL_SECONDS', 2),
    sessionTtlSeconds: intFrom(env, 'SESSION_TTL_SECONDS', 3600),
    // 0 disables the read-your-writes cookie (no replica yet, nothing to protect against).
    readAfterWriteSeconds: intFrom(env, 'READ_AFTER_WRITE_SECONDS', 0),
    // 0 means responses are never marked as shareable by an edge cache.
    edgeMaxAgeSeconds: intFrom(env, 'EDGE_MAX_AGE_SECONDS', 0),
    poolSize: intFrom(env, 'DB_POOL_SIZE', 10),
  };
}

module.exports = { loadConfig };
