const { randomBytes } = require('node:crypto');

const newSessionId = () => randomBytes(18).toString('base64url');

// Lives in this process only. Fast, but a second app instance cannot see the session:
// this is exactly the stateful-tier problem stage 1 is meant to expose.
class MemorySessionStore {
  constructor({ ttlSeconds, now = () => Date.now() }) {
    this.ttlMs = ttlSeconds * 1000;
    this.now = now;
    this.entries = new Map();
  }

  async get(sid) {
    const entry = this.entries.get(sid);
    if (!entry) return null;
    if (entry.expiresAt <= this.now()) {
      this.entries.delete(sid);
      return null;
    }
    return entry.data;
  }

  async set(sid, data) {
    this.entries.set(sid, { data, expiresAt: this.now() + this.ttlMs });
  }
}

// Shared by every app instance, so any instance can serve any request (stateless web tier).
class RedisSessionStore {
  constructor(redis, { ttlSeconds, prefix = 'sess:' }) {
    this.redis = redis;
    this.ttlSeconds = ttlSeconds;
    this.prefix = prefix;
  }

  async get(sid) {
    const raw = await this.redis.get(this.prefix + sid);
    return raw === null ? null : JSON.parse(raw);
  }

  async set(sid, data) {
    await this.redis.set(this.prefix + sid, JSON.stringify(data), 'EX', this.ttlSeconds);
  }
}

module.exports = { MemorySessionStore, RedisSessionStore, newSessionId };
