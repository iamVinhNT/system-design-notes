// In-memory stand-in for the ioredis calls Cache and RedisSessionStore use.
class FakeRedis {
  constructor() {
    this.data = new Map();
    this.down = false;
    this.calls = [];
  }

  guard() {
    if (this.down) throw new Error('redis down');
  }

  async get(key) {
    this.calls.push(['get', key]);
    this.guard();
    return this.data.get(key) ?? null;
  }

  async set(key, value, ...args) {
    this.calls.push(['set', key, value, ...args]);
    this.guard();
    this.data.set(key, value);
    return 'OK';
  }

  async del(...keys) {
    this.calls.push(['del', ...keys]);
    this.guard();
    for (const key of keys) this.data.delete(key);
    return keys.length;
  }
}

// Fake pg pool: answers each query from a handler and records every SQL text.
class FakePool {
  constructor(handler = () => []) {
    this.handler = handler;
    this.queries = [];
    this.down = false;
  }

  async query(sql, params = []) {
    this.queries.push({ sql, params });
    if (this.down) throw new Error('connection refused');
    return { rows: await this.handler(sql, params) };
  }
}

const listen = (app) =>
  new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => resolve({ server, url: `http://127.0.0.1:${server.address().port}` }));
  });

module.exports = { FakeRedis, FakePool, listen };
