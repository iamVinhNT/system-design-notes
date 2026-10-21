const test = require('node:test');
const assert = require('node:assert/strict');
const { Analytics, LruCache, ShortenerError, UrlService, BASE62 } = require('../shortener');

function failsWith(fn, code, status) {
  assert.throws(fn, error => error instanceof ShortenerError && error.code === code && error.status === status);
}

function makeService(options = {}) {
  const time = { ms: 1_700_000_000_000 };
  const service = new UrlService({ now: () => time.ms, ...options });
  return { service, time };
}

test('creates a 7-character Base62 code by default', () => {
  const { service } = makeService();
  const created = service.create({ url: 'https://example.com/a?b=1#c' });
  assert.match(created.code, new RegExp(`^[${BASE62}]{7}$`));
  assert.equal(created.shortUrl, `http://localhost:3000/${created.code}`);
  assert.equal(created.expiresAt, null);
  assert.ok(created.deleteToken.length >= 32);
  assert.equal(service.resolve(created.code).url, 'https://example.com/a?b=1#c');
});

test('rejects invalid urls and dangerous schemes', () => {
  const { service } = makeService();
  const bad = [
    ['javascript:alert(1)', 'UNSUPPORTED_SCHEME'],
    ['data:text/html,<script>1</script>', 'UNSUPPORTED_SCHEME'],
    ['file:///etc/passwd', 'UNSUPPORTED_SCHEME'],
    ['ftp://example.com/x', 'UNSUPPORTED_SCHEME'],
    ['//example.com/x', 'INVALID_URL'],
    ['example.com', 'INVALID_URL'],
    ['https://user:secret@example.com/', 'INVALID_URL'],
    ['https://example.com/a b', 'INVALID_URL'],
    ['https://example.com/\r\nSet-Cookie: x=1', 'INVALID_URL'],
    ['http://localhost:3000/abc', 'SELF_REFERENCE'],
    ['', 'INVALID_URL'],
    [42, 'INVALID_URL'],
    [`https://example.com/${'a'.repeat(2048)}`, 'INVALID_URL'],
  ];
  for (const [url, code] of bad) failsWith(() => service.create({ url }), code, 400);
});

test('custom alias is validated and duplicates are rejected', () => {
  const { service } = makeService();
  service.create({ url: 'https://example.com/1', alias: 'docs' });
  failsWith(() => service.create({ url: 'https://example.com/2', alias: 'docs' }), 'ALIAS_TAKEN', 409);
  for (const alias of ['ab', 'has space', 'a/b', 'api', 'x'.repeat(33), 5]) {
    failsWith(() => service.create({ url: 'https://example.com/3', alias }), 'INVALID_ALIAS', 400);
  }
  assert.equal(service.resolve('docs').url, 'https://example.com/1');
});

test('collision on a generated code is retried; exhaustion fails explicitly', () => {
  const sequence = ['taken01', 'taken01', 'taken01', 'fresh02'];
  const { service } = makeService({ generateCode: () => sequence.shift() ?? 'fresh99', maxAttempts: 5 });
  service.create({ url: 'https://example.com/1', alias: 'taken01' });
  const created = service.create({ url: 'https://example.com/2' });
  assert.equal(created.code, 'fresh02');
  assert.equal(service.resolve('taken01').url, 'https://example.com/1');

  const stuck = makeService({ generateCode: () => 'taken01', maxAttempts: 3 }).service;
  stuck.create({ url: 'https://example.com/1', alias: 'taken01' });
  failsWith(() => stuck.create({ url: 'https://example.com/2' }), 'CODE_GENERATION_FAILED', 503);
});

test('generated code does not overwrite an existing alias', () => {
  const { service } = makeService({ generateCode: () => 'samecode' });
  service.create({ url: 'https://example.com/1' });
  failsWith(() => service.create({ url: 'https://example.com/2' }), 'CODE_GENERATION_FAILED', 503);
  assert.equal(service.resolve('samecode').url, 'https://example.com/1');
});

test('expired urls answer 410 until purged, then 404; ttl is validated', () => {
  const { service, time } = makeService();
  const { code } = service.create({ url: 'https://example.com/', ttlSeconds: 60 });
  assert.equal(service.describe(code).expiresAt, new Date(time.ms + 60_000).toISOString());
  time.ms += 59_999;
  assert.equal(service.resolve(code).url, 'https://example.com/');
  time.ms += 1;
  failsWith(() => service.resolve(code), 'EXPIRED', 410);
  failsWith(() => service.describe(code), 'EXPIRED', 410);
  assert.equal(service.purgeExpired(), 1);
  failsWith(() => service.resolve(code), 'NOT_FOUND', 404);
  for (const ttlSeconds of [0, -1, 1.5, '60', 10 * 365 * 24 * 3600 + 1]) {
    failsWith(() => service.create({ url: 'https://example.com/', ttlSeconds }), 'INVALID_TTL', 400);
  }
});

test('unknown and malformed codes return 404', () => {
  const { service } = makeService();
  failsWith(() => service.resolve('nope123'), 'NOT_FOUND', 404);
  failsWith(() => service.resolve('bad code!'), 'NOT_FOUND', 404);
});

test('read-through cache serves repeated reads and is invalidated on delete', () => {
  const { service } = makeService();
  const { code, deleteToken } = service.create({ url: 'https://example.com/' });
  service.resolve(code);
  service.resolve(code);
  assert.deepEqual(service.metrics, { cacheHits: 1, cacheMisses: 1 });
  failsWith(() => service.delete(code, 'wrong'), 'FORBIDDEN', 403);
  failsWith(() => service.delete(code, undefined), 'FORBIDDEN', 403);
  assert.equal(service.resolve(code).url, 'https://example.com/');
  service.delete(code, deleteToken);
  assert.equal(service.cache.size, 0);
  failsWith(() => service.resolve(code), 'NOT_FOUND', 404);
});

test('a cached entry is not served after it expires', () => {
  const { service, time } = makeService();
  const { code } = service.create({ url: 'https://example.com/', ttlSeconds: 10 });
  service.resolve(code);
  time.ms += 10_000;
  failsWith(() => service.resolve(code), 'EXPIRED', 410);
  assert.equal(service.metrics.cacheHits, 1);
});

test('LRU cache evicts the least recently used entry', () => {
  const cache = new LruCache(2);
  cache.set('a', 1);
  cache.set('b', 2);
  cache.get('a');
  cache.set('c', 3);
  assert.equal(cache.get('b'), undefined);
  assert.equal(cache.get('a'), 1);
  assert.equal(cache.size, 2);
});

test('analytics are counted after the redirect path, and the queue is bounded', () => {
  const queue = [];
  const analytics = new Analytics({ maxPending: 3, schedule: fn => queue.push(fn) });
  const { service } = makeService({ analytics });
  const { code } = service.create({ url: 'https://example.com/' });
  service.resolve(code);
  service.resolve(code);
  assert.equal(service.describe(code).hits, 0);
  assert.equal(queue.length, 1);
  queue.shift()();
  assert.equal(service.describe(code).hits, 2);

  for (let i = 0; i < 5; i++) service.resolve(code);
  assert.equal(analytics.dropped, 2);
  queue.shift()();
  assert.equal(service.describe(code).hits, 5);
});
