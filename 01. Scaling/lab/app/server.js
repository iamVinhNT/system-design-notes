const express = require('express');
const { newSessionId } = require('./sessions');

class HttpError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const USERNAME = /^[a-zA-Z0-9_-]{1,32}$/;

function parseCookies(header = '') {
  const cookies = {};
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index > 0) cookies[part.slice(0, index).trim()] = part.slice(index + 1).trim();
  }
  return cookies;
}

function parsePostBody(body) {
  const { title, body: text } = body ?? {};
  if (typeof title !== 'string' || title.trim() === '' || title.length > 120) {
    throw new HttpError(400, 'INVALID_TITLE', 'title must be 1-120 characters');
  }
  if (typeof text !== 'string' || text.trim() === '' || text.length > 2000) {
    throw new HttpError(400, 'INVALID_BODY', 'body must be 1-2000 characters');
  }
  return { title: title.trim(), body: text.trim() };
}

function parsePostId(raw) {
  if (!/^[1-9]\d{0,17}$/.test(raw)) throw new HttpError(400, 'INVALID_ID', 'id must be a positive integer');
  return raw;
}

const handler = (fn) => (req, res, next) => fn(req, res).catch(next);

function createApp({ posts, sessions, metrics, cache = null, config, now = () => Date.now() }) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '16kb' }));

  app.use((req, res, next) => {
    const started = process.hrtime.bigint();
    res.set('X-Instance', config.instanceId);
    req.cookies = parseCookies(req.headers.cookie);
    res.on('finish', () => {
      if (req.path.startsWith('/metrics') || req.path === '/healthz') return;
      metrics.observe(Number(process.hrtime.bigint() - started) / 1e6);
      metrics.count('requests');
      metrics.count(`status_${Math.floor(res.statusCode / 100)}xx`);
    });
    next();
  });

  async function loadSession(req) {
    const sid = req.cookies.sid;
    if (!sid) return null;
    try {
      return await sessions.get(sid);
    } catch {
      metrics.count('session_store_error');
      throw new HttpError(503, 'SESSION_STORE_UNAVAILABLE', 'session store unavailable');
    }
  }

  async function requireSession(req) {
    const session = await loadSession(req);
    if (!session) throw new HttpError(401, 'UNAUTHENTICATED', 'login required');
    return session;
  }

  // Read-your-writes: for a few seconds after a write the author reads from the primary and skips
  // the cache, because a lagging replica or a stale cache entry could hide the post they just made.
  function recentlyWrote(req) {
    if (config.readAfterWriteSeconds === 0) return false;
    const age = now() - Number(req.cookies.last_write);
    // The cookie is client-controlled: a timestamp in the future would otherwise pin the reader to the primary forever.
    return Number.isFinite(age) && age >= 0 && age < config.readAfterWriteSeconds * 1000;
  }

  function markWrite(res) {
    if (config.readAfterWriteSeconds === 0) return;
    res.append('Set-Cookie', `last_write=${now()}; Path=/; Max-Age=${config.readAfterWriteSeconds}; SameSite=Lax`);
  }

  const wantsFreshRead = (req) => config.allowCacheBypass && /(^|,)\s*no-cache\b/i.test(req.headers['cache-control'] ?? '');

  // Only anonymous, non-recent-writer responses may be stored by a shared edge cache.
  function setReadCacheHeaders(res, req, found) {
    const shareable = found && config.edgeMaxAgeSeconds > 0 && !req.cookies.sid && !req.cookies.last_write;
    res.set('Cache-Control', shareable ? `public, max-age=${config.edgeMaxAgeSeconds}` : 'no-store');
  }

  async function cachedRead(req, res, key, load) {
    const consistent = recentlyWrote(req);
    const bypass = consistent || wantsFreshRead(req);
    const loader = async () => {
      const { value, source } = await load({ consistent });
      return { value, meta: source, ttlSeconds: source === 'replica' ? config.replicaFillTtlSeconds : undefined };
    };
    const { value, meta, state } = cache
      ? await cache.getOrLoad(key, loader, { bypass })
      : { ...(await loader()), state: 'OFF' };
    res.set({ 'X-App-Cache': state, 'X-Db-Source': state === 'HIT' ? 'cache' : meta });
    setReadCacheHeaders(res, req, value !== null);
    return value;
  }

  app.get('/healthz', (_req, res) => res.json({ status: 'ok', instance: config.instanceId }));
  app.get('/metrics', (_req, res) => res.json({ instance: config.instanceId, ...metrics.snapshot() }));
  app.post('/metrics/reset', (_req, res) => {
    metrics.reset();
    res.status(204).end();
  });

  // Lab only: any username is accepted. The point is to create a session, not to authenticate.
  app.post('/api/login', handler(async (req, res) => {
    const username = req.body?.username;
    if (typeof username !== 'string' || !USERNAME.test(username)) {
      throw new HttpError(400, 'INVALID_USERNAME', 'username must match [a-zA-Z0-9_-]{1,32}');
    }
    const sid = newSessionId();
    try {
      await sessions.set(sid, { user: username });
    } catch {
      metrics.count('session_store_error');
      throw new HttpError(503, 'SESSION_STORE_UNAVAILABLE', 'session store unavailable');
    }
    res.append('Set-Cookie', `sid=${sid}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${config.sessionTtlSeconds}`);
    res.json({ user: username });
  }));

  app.get('/api/me', handler(async (req, res) => {
    const session = await requireSession(req);
    res.set('Cache-Control', 'no-store').json({ user: session.user });
  }));

  app.get('/api/posts', handler(async (req, res) => {
    const items = await cachedRead(req, res, 'posts:latest', (options) => posts.listLatest(options));
    res.json({ items });
  }));

  app.get('/api/posts/:id', handler(async (req, res) => {
    const id = parsePostId(req.params.id);
    const post = await cachedRead(req, res, `post:${id}`, (options) => posts.getById(id, options));
    if (post === null) throw new HttpError(404, 'NOT_FOUND', 'post not found');
    res.json(post);
  }));

  app.post('/api/posts', handler(async (req, res) => {
    const session = await requireSession(req);
    const created = await posts.create({ author: session.user, ...parsePostBody(req.body) });
    await cache?.invalidate('posts:latest');
    markWrite(res);
    res.status(201).json(created);
  }));

  app.put('/api/posts/:id', handler(async (req, res) => {
    const session = await requireSession(req);
    const id = parsePostId(req.params.id);
    const updated = await posts.update(id, { author: session.user, ...parsePostBody(req.body) });
    if (updated === null) throw new HttpError(404, 'NOT_FOUND', 'post not found');
    if (updated === 'forbidden') throw new HttpError(403, 'FORBIDDEN', 'only the author can edit this post');
    await cache?.invalidate(`post:${id}`, 'posts:latest');
    markWrite(res);
    res.json(updated);
  }));

  app.use((_req, _res, next) => next(new HttpError(404, 'NOT_FOUND', 'route not found')));

  app.use((error, _req, res, _next) => {
    if (error instanceof HttpError) return res.status(error.status).set('Cache-Control', 'no-store').json({ error: error.message, code: error.code });
    if (error.type === 'entity.too.large') return res.status(413).json({ error: 'request body too large', code: 'TOO_LARGE' });
    if (error.type === 'entity.parse.failed') return res.status(400).json({ error: 'invalid JSON body', code: 'INVALID_BODY' });
    metrics.count('internal_errors');
    process.stderr.write(`${JSON.stringify({ level: 'error', instance: config.instanceId, message: error.message })}\n`);
    res.status(500).set('Cache-Control', 'no-store').json({ error: 'internal error', code: 'INTERNAL' });
  });

  return app;
}

module.exports = { createApp, HttpError, parseCookies };
