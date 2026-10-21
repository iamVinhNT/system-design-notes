const test = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../server');
const { Analytics, UrlService } = require('../shortener');

async function withServer(fn, { redirectStatus, ...serviceOptions } = {}) {
  const time = { ms: 1_700_000_000_000 };
  const analytics = new Analytics();
  const service = new UrlService({ now: () => time.ms, analytics, ...serviceOptions });
  const server = createApp({ service, redirectStatus }).listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (method, path, { body, headers = {} } = {}) => {
    const response = await fetch(base + path, {
      method,
      redirect: 'manual',
      headers: body === undefined ? headers : { 'content-type': 'application/json', ...headers },
      body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
    });
    const text = await response.text();
    let json;
    try { json = JSON.parse(text); } catch { json = undefined; }
    return { status: response.status, headers: response.headers, body: json };
  };
  try {
    await fn({ call, time, analytics });
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}

test('create then redirect with 302 and no-store by default', () => withServer(async ({ call, analytics }) => {
  const created = await call('POST', '/api/urls', { body: { url: 'https://example.com/path?q=1' } });
  assert.equal(created.status, 201);
  const redirect = await call('GET', `/${created.body.code}`);
  assert.equal(redirect.status, 302);
  assert.equal(redirect.headers.get('location'), 'https://example.com/path?q=1');
  assert.equal(redirect.headers.get('cache-control'), 'no-store');

  analytics.flush();
  const meta = await call('GET', `/api/urls/${created.body.code}`);
  assert.equal(meta.body.hits, 1);
  assert.equal(meta.body.deleteToken, undefined);
}));

test('301 mode sets a cache lifetime capped by the remaining ttl', () => withServer(async ({ call }) => {
  const forever = await call('POST', '/api/urls', { body: { url: 'https://example.com/a' } });
  const short = await call('POST', '/api/urls', { body: { url: 'https://example.com/b', ttlSeconds: 120 } });
  const a = await call('GET', `/${forever.body.code}`);
  const b = await call('GET', `/${short.body.code}`);
  assert.equal(a.status, 301);
  assert.equal(a.headers.get('cache-control'), 'public, max-age=86400');
  assert.equal(b.status, 301);
  assert.equal(b.headers.get('cache-control'), 'public, max-age=120');
}, { redirectStatus: 301 }));

test('status codes for invalid input, conflicts, missing, and expired urls', () => withServer(async ({ call, time }) => {
  const post = body => call('POST', '/api/urls', { body });
  assert.equal((await post({ url: 'javascript:alert(1)' })).status, 400);
  assert.equal((await post({ url: 'https://example.com/', alias: 'docs' })).status, 201);
  assert.equal((await post({ url: 'https://example.com/', alias: 'docs' })).status, 409);
  assert.equal((await post({ url: 'https://example.com/', ttlSeconds: 0 })).status, 400);
  assert.equal((await post([])).status, 400);
  assert.equal((await call('POST', '/api/urls', { body: '{broken' })).status, 400);
  assert.equal((await post({ url: `https://example.com/${'a'.repeat(5000)}` })).status, 413);
  assert.equal((await call('GET', '/missing')).status, 404);
  assert.equal((await call('GET', '/api')).status, 404);

  await post({ url: 'https://example.com/', alias: 'soon', ttlSeconds: 5 });
  assert.equal((await call('GET', '/soon')).status, 302);
  time.ms += 5000;
  const expired = await call('GET', '/soon');
  assert.equal(expired.status, 410);
  assert.equal(expired.body.code, 'EXPIRED');
}));

test('delete needs the token and invalidates the redirect', () => withServer(async ({ call }) => {
  const { body: { code, deleteToken } } = await call('POST', '/api/urls', { body: { url: 'https://example.com/' } });
  assert.equal((await call('GET', `/${code}`)).status, 302);
  assert.equal((await call('DELETE', `/api/urls/${code}`)).status, 403);
  assert.equal((await call('DELETE', `/api/urls/${code}`, { headers: { 'x-delete-token': 'nope' } })).status, 403);
  assert.equal((await call('DELETE', `/api/urls/${code}`, { headers: { 'x-delete-token': deleteToken } })).status, 204);
  assert.equal((await call('GET', `/${code}`)).status, 404);
  assert.equal((await call('DELETE', `/api/urls/${code}`, { headers: { 'x-delete-token': deleteToken } })).status, 404);
}));
