const express = require('express');
const { ShortenerError, UrlService } = require('./shortener');

const ONE_DAY_SECONDS = 86_400;

// 302 is the default: the browser asks the service on every visit, so expiry, deletion and
// hit counting keep working. 301 lets browsers and CDNs cache the target and skip the service;
// the cache lifetime is capped by the remaining TTL, but deletions are not honored until it ends.
function redirectHeaders(status, expiresAt, now) {
  if (status === 302) return { 'Cache-Control': 'no-store' };
  const remaining = expiresAt === null ? ONE_DAY_SECONDS : Math.max(0, Math.floor((expiresAt - now) / 1000));
  return { 'Cache-Control': `public, max-age=${Math.min(ONE_DAY_SECONDS, remaining)}` };
}

function createApp({ service = new UrlService(), redirectStatus = 302 } = {}) {
  if (![301, 302].includes(redirectStatus)) throw new RangeError('redirectStatus must be 301 or 302');
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '4kb' }));

  app.post('/api/urls', (req, res) => {
    const body = req.body;
    if (body === null || typeof body !== 'object' || Array.isArray(body)) {
      throw new ShortenerError(400, 'INVALID_BODY', 'body must be a JSON object');
    }
    res.status(201).json(service.create({ url: body.url, alias: body.alias, ttlSeconds: body.ttlSeconds }));
  });

  app.get('/api/urls/:code', (req, res) => res.json(service.describe(req.params.code)));

  app.delete('/api/urls/:code', (req, res) => {
    service.delete(req.params.code, req.get('x-delete-token'));
    res.status(204).end();
  });

  app.get('/:code', (req, res) => {
    const { url, expiresAt } = service.resolve(req.params.code);
    res.set(redirectHeaders(redirectStatus, expiresAt, service.now()));
    res.redirect(redirectStatus, url);
  });

  app.use((error, _req, res, _next) => {
    if (error instanceof ShortenerError) return res.status(error.status).json({ error: error.message, code: error.code });
    if (error.type === 'entity.too.large') return res.status(413).json({ error: 'request body too large', code: 'TOO_LARGE' });
    if (error.type === 'entity.parse.failed') return res.status(400).json({ error: 'invalid JSON body', code: 'INVALID_BODY' });
    process.stderr.write(`${error.stack}\n`);
    res.status(500).json({ error: 'internal error', code: 'INTERNAL' });
  });

  return app;
}

if (require.main === module) {
  const baseUrl = process.env.BASE_URL ?? 'http://localhost:3000';
  createApp({ service: new UrlService({ baseUrl }) }).listen(3000, () => process.stdout.write('Listening on http://localhost:3000\n'));
}

module.exports = { createApp };
