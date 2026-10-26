const test = require('node:test');
const assert = require('node:assert/strict');
const net = require('node:net');
const { FetchError, fetchOnce, isBlockedAddress } = require('../fetcher');
const { createLabSite } = require('../lab-site');

async function withSite(fn, options) {
  const site = createLabSite(options);
  await new Promise(resolve => site.listen(0, '127.0.0.1', resolve));
  try {
    await fn(`127.0.0.1:${site.address().port}`, site);
  } finally {
    site.closeAllConnections();
    await new Promise(resolve => site.close(resolve));
  }
}

function rejectsWith(promise, code, retryable) {
  return assert.rejects(promise, error => error instanceof FetchError && error.code === code && error.retryable === retryable);
}

test('isBlockedAddress covers private, loopback, link-local, mapped, and unparsable addresses', () => {
  for (const address of [
    '127.0.0.1', '127.255.255.254', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.169.254',
    '100.64.0.1', '0.0.0.0', '224.0.0.1', '255.255.255.255', '::1', '::', 'fe80::1', 'fc00::1', 'fd12::1',
    '::ffff:127.0.0.1', '::ffff:10.0.0.1', '2001:db8::1', 'not-an-ip', '',
  ]) assert.equal(isBlockedAddress(address), true, address);
  for (const address of ['8.8.8.8', '93.184.216.34', '172.32.0.1', '172.15.255.255', '2606:4700:4700::1111', '::ffff:8.8.8.8']) {
    assert.equal(isBlockedAddress(address), false, address);
  }
});

test('private targets are blocked by default: IP literals, localhost, and decimal IP forms', () => withSite(async host => {
  const port = host.split(':')[1];
  await rejectsWith(fetchOnce(`http://${host}/a`), 'SSRF_BLOCKED', false);
  await rejectsWith(fetchOnce(`http://localhost:${port}/a`), 'SSRF_BLOCKED', false);
  await rejectsWith(fetchOnce(`http://2130706433:${port}/a`), 'SSRF_BLOCKED', false);
  await rejectsWith(fetchOnce(`http://[::1]:${port}/a`), 'SSRF_BLOCKED', false);
  await rejectsWith(fetchOnce('http://169.254.169.254/latest/meta-data/'), 'SSRF_BLOCKED', false);
}));

test('with the operator switch the lab site is reachable', () => withSite(async (host, site) => {
  const result = await fetchOnce(`http://${host}/a`, { allowPrivateNetwork: true });
  assert.equal(result.status, 200);
  assert.equal(result.contentType, 'text/html');
  assert.match(result.body, /<title>A<\/title>/);
  assert.equal(site.hits.get('/a'), 1);
}));

test('redirects and error statuses are returned, not followed', () => withSite(async host => {
  const options = { allowPrivateNetwork: true };
  const redirect = await fetchOnce(`http://${host}/redirect-out`, options);
  assert.equal(redirect.status, 302);
  assert.equal(redirect.location, 'http://outside.invalid/');
  assert.equal((await fetchOnce(`http://${host}/missing`, options)).status, 404);
  assert.equal((await fetchOnce(`http://${host}/flaky`, options)).status, 503);
}));

test('timeout, size limits, and content type are enforced', () => withSite(async host => {
  const options = { allowPrivateNetwork: true };
  const started = Date.now();
  await rejectsWith(fetchOnce(`http://${host}/slow`, { ...options, timeoutMs: 100 }), 'TIMEOUT', true);
  assert.ok(Date.now() - started < 2000);
  await rejectsWith(fetchOnce(`http://${host}/big`, { ...options, maxBytes: 64 * 1024 }), 'TOO_LARGE', false);
  await rejectsWith(fetchOnce(`http://${host}/huge-header`, { ...options, maxBytes: 64 * 1024 }), 'TOO_LARGE', false);
  await rejectsWith(fetchOnce(`http://${host}/not-html`, options), 'NOT_HTML', false);
  const text = await fetchOnce(`http://${host}/robots.txt`, { ...options, types: ['text/plain'] });
  assert.match(text.body, /Disallow: \/private/);
}, { slowMs: 3000 }));

test('connection failures are retryable network errors', async () => {
  const server = net.createServer().listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const { port } = server.address();
  await new Promise(resolve => server.close(resolve));
  await rejectsWith(fetchOnce(`http://127.0.0.1:${port}/`, { allowPrivateNetwork: true }), 'NETWORK_ERROR', true);
});
