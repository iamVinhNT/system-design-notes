const { createHash, randomBytes, randomInt, timingSafeEqual } = require('node:crypto');

const BASE62 = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
const MAX_URL_LENGTH = 2048;
const MAX_TTL_SECONDS = 10 * 365 * 24 * 60 * 60;
const CODE_PATTERN = /^[A-Za-z0-9_-]{1,32}$/;
const ALIAS_PATTERN = /^[A-Za-z0-9_-]{3,32}$/;
const RESERVED_CODES = new Set(['api']);

class ShortenerError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function randomCode(length) {
  return Array.from({ length }, () => BASE62[randomInt(BASE62.length)]).join('');
}

function hashToken(token) {
  return createHash('sha256').update(token).digest();
}

// Only absolute http(s) URLs are accepted. The normalized href is stored, so the
// Location header never carries raw user input.
function validateLongUrl(raw, selfHost) {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > MAX_URL_LENGTH) {
    throw new ShortenerError(400, 'INVALID_URL', `url must be a string of 1-${MAX_URL_LENGTH} characters`);
  }
  // The URL parser silently strips tabs/newlines; refuse them instead.
  if (/[\u0000- \u007f]/.test(raw)) {
    throw new ShortenerError(400, 'INVALID_URL', 'url must not contain whitespace or control characters');
  }
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new ShortenerError(400, 'INVALID_URL', 'url must be an absolute URL');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new ShortenerError(400, 'UNSUPPORTED_SCHEME', 'only http and https URLs are allowed');
  }
  if (url.username !== '' || url.password !== '') {
    throw new ShortenerError(400, 'INVALID_URL', 'url must not contain credentials');
  }
  if (url.host === selfHost) {
    throw new ShortenerError(400, 'SELF_REFERENCE', 'url must not point back to this service');
  }
  return url.href;
}

function validateAlias(alias) {
  if (typeof alias !== 'string' || !ALIAS_PATTERN.test(alias)) {
    throw new ShortenerError(400, 'INVALID_ALIAS', 'alias must be 3-32 characters of [A-Za-z0-9_-]');
  }
  if (RESERVED_CODES.has(alias)) throw new ShortenerError(400, 'INVALID_ALIAS', `alias ${alias} is reserved`);
  return alias;
}

// Least-recently-used map; a Map keeps insertion order, so re-inserting marks a key as fresh.
class LruCache {
  constructor(maxEntries) {
    this.maxEntries = maxEntries;
    this.entries = new Map();
  }

  get(key) {
    if (!this.entries.has(key)) return undefined;
    const value = this.entries.get(key);
    this.entries.delete(key);
    this.entries.set(key, value);
    return value;
  }

  set(key, value) {
    this.entries.delete(key);
    this.entries.set(key, value);
    if (this.entries.size > this.maxEntries) this.entries.delete(this.entries.keys().next().value);
  }

  delete(key) {
    this.entries.delete(key);
  }

  get size() {
    return this.entries.size;
  }
}

// Hit counting is queued and applied off the redirect path. The queue is bounded:
// when full, the oldest events are dropped and counted, never blocking a redirect.
class Analytics {
  constructor({ maxPending = 10_000, schedule = setImmediate } = {}) {
    this.maxPending = maxPending;
    this.schedule = schedule;
    this.pending = [];
    this.hits = new Map();
    this.dropped = 0;
    this.scheduled = false;
  }

  record(code) {
    if (this.pending.length >= this.maxPending) {
      this.pending.shift();
      this.dropped++;
    }
    this.pending.push(code);
    if (!this.scheduled) {
      this.scheduled = true;
      this.schedule(() => this.flush());
    }
  }

  flush() {
    this.scheduled = false;
    for (const code of this.pending) this.hits.set(code, (this.hits.get(code) ?? 0) + 1);
    this.pending = [];
  }

  count(code) {
    return this.hits.get(code) ?? 0;
  }
}

class UrlService {
  constructor({
    now = Date.now,
    baseUrl = 'http://localhost:3000',
    codeLength = 7,
    maxAttempts = 5,
    cacheSize = 1000,
    generateCode = randomCode,
    analytics = new Analytics(),
  } = {}) {
    this.now = now;
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.selfHost = new URL(baseUrl).host;
    this.codeLength = codeLength;
    this.maxAttempts = maxAttempts;
    this.generateCode = generateCode;
    this.analytics = analytics;
    this.records = new Map();
    this.cache = new LruCache(cacheSize);
    this.metrics = { cacheHits: 0, cacheMisses: 0 };
  }

  create({ url, alias, ttlSeconds }) {
    const longUrl = validateLongUrl(url, this.selfHost);
    if (ttlSeconds !== undefined && (!Number.isInteger(ttlSeconds) || ttlSeconds < 1 || ttlSeconds > MAX_TTL_SECONDS)) {
      throw new ShortenerError(400, 'INVALID_TTL', `ttlSeconds must be an integer from 1 to ${MAX_TTL_SECONDS}`);
    }
    const createdAt = this.now();
    const deleteToken = randomBytes(24).toString('base64url');
    const record = {
      url: longUrl,
      createdAt,
      expiresAt: ttlSeconds === undefined ? null : createdAt + ttlSeconds * 1000,
      deleteTokenHash: hashToken(deleteToken),
    };

    let code;
    if (alias !== undefined) {
      code = validateAlias(alias);
      if (this.records.has(code)) throw new ShortenerError(409, 'ALIAS_TAKEN', `alias ${code} is already in use`);
    } else {
      // Random codes make collisions possible: check-and-insert in one synchronous step, then retry.
      for (let attempt = 0; attempt < this.maxAttempts && code === undefined; attempt++) {
        const candidate = this.generateCode(this.codeLength);
        if (!this.records.has(candidate)) code = candidate;
      }
      if (code === undefined) {
        throw new ShortenerError(503, 'CODE_GENERATION_FAILED', 'could not find a free short code; retry');
      }
    }
    this.records.set(code, record);
    return { ...this.#describe(code, record), deleteToken };
  }

  // Read-through cache; entries are dropped on delete, and expiry is re-checked on every hit.
  resolve(code) {
    const entry = this.#lookup(code);
    this.analytics.record(code);
    return { url: entry.url, expiresAt: entry.expiresAt };
  }

  describe(code) {
    const record = this.#find(code);
    return { ...this.#describe(code, record), hits: this.analytics.count(code) };
  }

  delete(code, token) {
    const record = this.#find(code, { allowExpired: true });
    const supplied = typeof token === 'string' ? hashToken(token) : Buffer.alloc(32);
    if (!timingSafeEqual(supplied, record.deleteTokenHash)) {
      throw new ShortenerError(403, 'FORBIDDEN', 'delete token is missing or wrong');
    }
    this.records.delete(code);
    this.cache.delete(code);
  }

  // Expired records answer 410 until purged, then 404.
  purgeExpired() {
    let purged = 0;
    for (const [code, record] of this.records) {
      if (record.expiresAt !== null && record.expiresAt <= this.now()) {
        this.records.delete(code);
        this.cache.delete(code);
        purged++;
      }
    }
    return purged;
  }

  #lookup(code) {
    let entry = CODE_PATTERN.test(code) ? this.cache.get(code) : undefined;
    if (entry) {
      this.metrics.cacheHits++;
      if (entry.expiresAt !== null && entry.expiresAt <= this.now()) {
        throw new ShortenerError(410, 'EXPIRED', 'short url has expired');
      }
      return entry;
    }
    this.metrics.cacheMisses++;
    const record = this.#find(code);
    entry = { url: record.url, expiresAt: record.expiresAt };
    this.cache.set(code, entry);
    return entry;
  }

  #find(code, { allowExpired = false } = {}) {
    const record = CODE_PATTERN.test(code) ? this.records.get(code) : undefined;
    if (!record) throw new ShortenerError(404, 'NOT_FOUND', 'short url not found');
    if (!allowExpired && record.expiresAt !== null && record.expiresAt <= this.now()) {
      throw new ShortenerError(410, 'EXPIRED', 'short url has expired');
    }
    return record;
  }

  #describe(code, record) {
    return {
      code,
      shortUrl: `${this.baseUrl}/${code}`,
      url: record.url,
      createdAt: new Date(record.createdAt).toISOString(),
      expiresAt: record.expiresAt === null ? null : new Date(record.expiresAt).toISOString(),
    };
  }
}

module.exports = { Analytics, LruCache, ShortenerError, UrlService, validateAlias, validateLongUrl, BASE62 };
