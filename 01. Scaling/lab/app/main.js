const { Pool } = require('pg');
const Redis = require('ioredis');
const { loadConfig } = require('./config');
const { createApp } = require('./server');
const { Metrics } = require('./metrics');
const { Cache } = require('./cache');
const { PostRepository } = require('./posts');
const { MemorySessionStore, RedisSessionStore } = require('./sessions');

const log = (level, message, extra = {}) => process.stdout.write(`${JSON.stringify({ level, message, ...extra })}\n`);

function createPool(connectionString, { max, connectionTimeoutMillis }) {
  const pool = new Pool({ connectionString, max, connectionTimeoutMillis });
  // Idle clients emit 'error' when the server goes away; without a listener the process would crash.
  pool.on('error', (error) => log('warn', 'pool error', { error: error.message }));
  return pool;
}

// Commands fail fast while Redis is down (no offline queue), so callers degrade instead of hanging.
function createRedis(url) {
  const redis = new Redis(url, {
    enableOfflineQueue: false,
    maxRetriesPerRequest: 1,
    connectTimeout: 500,
    retryStrategy: (attempt) => Math.min(attempt * 200, 2000),
  });
  let lastLogged = 0;
  redis.on('error', (error) => {
    if (Date.now() - lastLogged > 10_000) {
      lastLogged = Date.now();
      log('warn', 'redis error', { error: error.message });
    }
  });
  return redis;
}

async function main() {
  const config = loadConfig();
  const metrics = new Metrics();
  const needsRedis = config.sessionStore === 'redis' || config.cacheEnabled;
  const redis = needsRedis ? createRedis(config.redisUrl) : null;

  const primary = createPool(config.primaryUrl, { max: config.poolSize, connectionTimeoutMillis: 5000 });
  const replica = config.replicaUrl ? createPool(config.replicaUrl, { max: config.poolSize, connectionTimeoutMillis: 1000 }) : null;

  const sessions = config.sessionStore === 'redis'
    ? new RedisSessionStore(redis, { ttlSeconds: config.sessionTtlSeconds })
    : new MemorySessionStore({ ttlSeconds: config.sessionTtlSeconds });
  const cache = config.cacheEnabled ? new Cache(redis, { ttlSeconds: config.cacheTtlSeconds, metrics }) : null;
  const posts = new PostRepository({ primary, replica, metrics });

  const server = createApp({ posts, sessions, cache, metrics, config }).listen(config.port, () => {
    log('info', 'listening', { instance: config.instanceId, port: config.port, session: config.sessionStore, cache: config.cacheEnabled, replica: Boolean(replica) });
  });

  const shutdown = () => {
    server.close(async () => {
      await Promise.allSettled([primary.end(), replica?.end(), redis?.quit()]);
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 5000).unref();
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((error) => {
  log('error', 'startup failed', { error: error.message });
  process.exit(1);
});
