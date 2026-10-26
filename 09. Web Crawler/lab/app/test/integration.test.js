const test = require('node:test');
const assert = require('node:assert/strict');
const { Crawler } = require('../crawler');
const { createApp } = require('../server');
const { createLabSite } = require('../lab-site');

async function withSite(fn) {
  const site = createLabSite({ slowMs: 3000 });
  await new Promise(resolve => site.listen(0, '127.0.0.1', resolve));
  try {
    await fn(`127.0.0.1:${site.address().port}`, site);
  } finally {
    site.closeAllConnections();
    await new Promise(resolve => site.close(resolve));
  }
}

test('crawls the lab site: scope, dedup, robots, failures, politeness', () => withSite(async (host, site) => {
  const base = `http://${host}`;
  const crawler = new Crawler({
    seed: `${base}/`,
    allowPrivateNetwork: true,
    delayMs: 40,
    concurrency: 4,
    maxDepth: 3,
    maxPages: 60,
    maxRetries: 2,
    timeoutMs: 200,
    maxBytes: 64 * 1024,
  });
  await crawler.run();
  const page = path => crawler.pages.get(base + path);

  assert.equal(crawler.state, 'completed');
  assert.equal(page('/').state, 'done');
  assert.equal(page('/a').linksExternal, 1);
  assert.equal(page('/a').linksRejected, 2);

  // Dedup: sorted query forms are one URL, fetched once; fragments never reach the server.
  assert.equal(site.hits.get('/a?x=1&y=2'), 1);
  assert.equal(site.hits.has('/a?y=2&x=1'), false);
  assert.equal(site.hits.get('/b'), 1);
  assert.equal(site.hits.has('/nofollow'), false);

  // robots.txt: disallowed path is recorded as failed and never requested.
  assert.equal(page('/private/secret').error, 'ROBOTS_DISALLOWED');
  assert.equal(site.hits.has('/private/secret'), false);

  // Scope: a redirect off the allowlist is a failure; the same-host redirect is followed via the frontier.
  assert.equal(page('/redirect-out').error, 'REDIRECT_OUT_OF_SCOPE');
  assert.equal(page('/redirect-same').redirectTo, `${base}/b`);
  assert.equal(page('/loop-a').state, 'done');
  assert.equal(page('/loop-b').state, 'done');

  // Content-seen: /dup has the same body as /b.
  assert.equal(page('/dup').duplicateOf, `${base}/b`);

  // Failure handling.
  assert.equal(page('/big').error, 'TOO_LARGE');
  assert.equal(page('/not-html').error, 'NOT_HTML');
  assert.equal(page('/missing').error, 'HTTP_404');
  assert.equal(page('/slow').error, 'TIMEOUT');
  assert.equal(page('/slow').attempts, 3);
  assert.equal(page('/flaky').state, 'done');
  assert.equal(page('/flaky').attempts, 3);
  assert.equal(page('/flaky').error, null);

  // Spider trap is cut off by max depth.
  assert.equal(page('/trap/3').state, 'done');
  assert.equal(page('/trap/4'), undefined);

  // Politeness: requests to the single host never overlap and are spaced by the delay.
  const log = [...site.log].sort((a, b) => a.start - b.start);
  for (let i = 1; i < log.length; i++) {
    assert.ok(log[i].start >= log[i - 1].end, `request ${i} overlapped the previous one`);
    assert.ok(log[i].start - log[i - 1].end >= 40 - 10, `gap before request ${i}: ${log[i].start - log[i - 1].end} ms`);
  }
}));

async function withApi(options, fn) {
  const server = createApp(options).listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (method, path, body) => {
    const response = await fetch(base + path, {
      method,
      headers: body === undefined ? {} : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: response.status, body: await response.json() };
  };
  try {
    await fn(call);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}

async function waitFor(call, id, states, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const { body } = await call('GET', `/api/jobs/${id}`);
    if (states.includes(body.state)) return body;
    if (Date.now() > deadline) throw new Error(`job stuck in ${body.state}`);
    await new Promise(resolve => setTimeout(resolve, 25));
  }
}

test('API: create a job, poll it, and read pages', () => withSite(async host => {
  const options = { allowedHosts: [host], allowPrivateNetwork: true, limits: { minDelayMs: 0 }, crawlerOptions: { timeoutMs: 200, maxBytes: 64 * 1024 } };
  await withApi(options, async call => {
    const created = await call('POST', '/api/jobs', { seed: `http://${host}/a`, maxDepth: 1, maxPages: 10, delayMs: 10 });
    assert.equal(created.status, 202);
    const done = await waitFor(call, created.body.id, ['completed', 'failed']);
    assert.equal(done.state, 'completed');
    assert.equal(done.counts.queued + done.counts.fetching, 0);

    const all = await call('GET', `/api/jobs/${created.body.id}/pages`);
    assert.equal(all.body.total, done.accepted);
    const failed = await call('GET', `/api/jobs/${created.body.id}/pages?state=failed&limit=1`);
    assert.ok(failed.body.pages.length <= 1);
  });
}));

test('API: validation, operator allowlist, one job at a time, cancel, and unknown jobs', () => withSite(async host => {
  const options = { allowedHosts: [host], allowPrivateNetwork: true, limits: { minDelayMs: 0 }, crawlerOptions: { timeoutMs: 200 } };
  await withApi(options, async call => {
    const seed = `http://${host}/`;
    assert.equal((await call('POST', '/api/jobs', {})).status, 400);
    assert.equal((await call('POST', '/api/jobs', { seed: 'javascript:alert(1)' })).status, 400);
    assert.equal((await call('POST', '/api/jobs', { seed, maxDepth: 99 })).status, 400);
    assert.equal((await call('POST', '/api/jobs', { seed, maxPages: 0 })).status, 400);
    assert.equal((await call('POST', '/api/jobs', { seed, allowedHosts: ['Bad Host'] })).status, 400);
    assert.equal((await call('POST', '/api/jobs', { seed: 'http://example.org/' })).status, 403);
    assert.equal((await call('POST', '/api/jobs', { seed, allowedHosts: [host, 'example.org'] })).status, 403);
    assert.equal((await call('GET', '/api/jobs/missing')).status, 404);

    const first = await call('POST', '/api/jobs', { seed, maxDepth: 3, maxPages: 60, delayMs: 100 });
    assert.equal(first.status, 202);
    assert.equal((await call('POST', '/api/jobs', { seed })).status, 409);
    const cancel = await call('DELETE', `/api/jobs/${first.body.id}`);
    assert.equal(cancel.status, 202);
    const final = await waitFor(call, first.body.id, ['cancelled', 'completed']);
    assert.equal(final.state, 'cancelled');
    assert.equal((await call('POST', '/api/jobs', { seed: `http://${host}/c`, maxDepth: 0, delayMs: 0 })).status, 202);
  });
}));

test('API: an empty operator allowlist rejects every job, and the operator allowlist does not unlock private networks', () => withSite(async host => {
  await withApi({ allowedHosts: [] }, async call => {
    assert.equal((await call('POST', '/api/jobs', { seed: `http://${host}/` })).status, 403);
  });
  await withApi({ allowedHosts: [host], limits: { minDelayMs: 0 } }, async call => {
    const created = await call('POST', '/api/jobs', { seed: `http://${host}/`, delayMs: 0 });
    assert.equal(created.status, 202);
    const done = await waitFor(call, created.body.id, ['completed', 'failed']);
    const pages = await call('GET', `/api/jobs/${created.body.id}/pages`);
    assert.equal(done.accepted, 1);
    assert.equal(pages.body.pages[0].error, 'SSRF_BLOCKED');
  });
}));
