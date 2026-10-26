const test = require('node:test');
const assert = require('node:assert/strict');
const { Crawler } = require('../crawler');
const { CrawlError } = require('../url');
const { crawlerOptions, fakeNetwork, html } = require('./helpers');

const H = 'http://site.test';

async function crawl(site, overrides = {}, networkOptions) {
  const network = fakeNetwork(site, networkOptions);
  const crawler = new Crawler(crawlerOptions(network, { seed: `${H}/`, ...overrides }));
  await crawler.run();
  return { crawler, network, page: url => crawler.pages.get(url), fetched: network.log.map(call => call.url) };
}

test('dedups URLs by normalized form, fetches each once, and ignores external and non-http links', async () => {
  const { crawler, fetched, page } = await crawl({
    [`${H}/`]: { body: html('Home', ['/a', '/a#top', '/a?y=2&x=1', '/a?x=1&y=2', 'http://other.test/x', 'mailto:a@b.c', 'javascript:void(0)']) },
    [`${H}/a`]: { body: html('A', ['/', '/b']) },
    [`${H}/a?x=1&y=2`]: { body: html('A2') },
    [`${H}/b`]: { body: html('B') },
  });
  assert.deepEqual(fetched.sort(), [`${H}/`, `${H}/a`, `${H}/a?x=1&y=2`, `${H}/b`].sort());
  assert.equal(page(`${H}/`).linksExternal, 1);
  assert.equal(page(`${H}/`).linksRejected, 2);
  assert.equal(crawler.stats.duplicateUrls, 3);
  assert.equal(crawler.state, 'completed');
});

test('seed outside the allowlist is rejected', () => {
  const network = fakeNetwork({});
  assert.throws(
    () => new Crawler(crawlerOptions(network, { seed: `${H}/`, allowedHosts: ['other.test'] })),
    error => error instanceof CrawlError && error.code === 'SEED_NOT_ALLOWED',
  );
});

test('max depth stops following links', async () => {
  const site = {
    [`${H}/`]: { body: html('0', ['/1']) },
    [`${H}/1`]: { body: html('1', ['/2']) },
    [`${H}/2`]: { body: html('2', ['/3']) },
    [`${H}/3`]: { body: html('3') },
  };
  const { fetched, page } = await crawl(site, { maxDepth: 2 });
  assert.deepEqual(fetched, [`${H}/`, `${H}/1`, `${H}/2`]);
  assert.equal(page(`${H}/2`).depth, 2);
  assert.equal(page(`${H}/3`), undefined);
});

test('max pages bounds accepted URLs', async () => {
  const links = Array.from({ length: 20 }, (_, i) => `/p${i}`);
  const site = { [`${H}/`]: { body: html('root', links) } };
  const { crawler, fetched } = await crawl(site, { maxPages: 5 });
  assert.equal(crawler.pages.size, 5);
  assert.equal(fetched.length, 5);
  assert.equal(crawler.stats.skippedMaxPages, 16);
});

test('a spider trap is bounded by depth and page limits', async () => {
  const site = new Proxy({}, {
    get: (_target, url) => ({ body: html('trap', [`${String(url).replace(/\d*$/, '')}${Number(String(url).match(/\d+$/)?.[0] ?? 0) + 1}`]) }),
  });
  const { crawler } = await crawl(site, { seed: `${H}/t/1`, maxDepth: 4, maxPages: 100 });
  assert.equal(crawler.pages.size, 5);
});

test('redirect inside the allowlist is crawled through the frontier; redirect out of scope fails', async () => {
  const site = {
    [`${H}/`]: { body: html('Home', ['/go', '/leave']) },
    [`${H}/go`]: { status: 302, location: '/target' },
    [`${H}/target`]: { body: html('Target') },
    [`${H}/leave`]: { status: 302, location: 'http://evil.test/steal' },
  };
  const { fetched, page } = await crawl(site);
  assert.equal(page(`${H}/go`).state, 'done');
  assert.equal(page(`${H}/go`).redirectTo, `${H}/target`);
  assert.equal(page(`${H}/target`).state, 'done');
  assert.equal(page(`${H}/leave`).state, 'failed');
  assert.equal(page(`${H}/leave`).error, 'REDIRECT_OUT_OF_SCOPE');
  assert.equal(fetched.includes('http://evil.test/steal'), false);
});

test('redirect loops and long chains terminate', async () => {
  const loop = await crawl({
    [`${H}/`]: { status: 302, location: '/b' },
    [`${H}/b`]: { status: 302, location: '/' },
  });
  assert.deepEqual(loop.fetched, [`${H}/`, `${H}/b`]);

  const chain = {};
  for (let i = 0; i < 10; i++) chain[`${H}/${i}`] = { status: 302, location: `/${i + 1}` };
  const long = await crawl(chain, { seed: `${H}/0`, maxRedirects: 3, maxPages: 50 });
  assert.equal(long.page(`${H}/3`).error, 'TOO_MANY_REDIRECTS');
  assert.equal(long.page(`${H}/4`), undefined);
});

test('redirect to another allowlisted host is paced by that host, not followed inline', async () => {
  const site = {
    'http://a.test/': { status: 301, location: 'http://b.test/page' },
    'http://b.test/page': { body: html('B') },
  };
  const { network, page } = await crawl(site, { seed: 'http://a.test/', allowedHosts: ['a.test', 'b.test'] });
  assert.equal(page('http://b.test/page').state, 'done');
  assert.equal(network.log.length, 2);
});

test('per-host politeness: one request at a time and delay measured from the previous request end', async () => {
  const links = ['/1', '/2', '/3'];
  const { network } = await crawl({ [`${H}/`]: { body: html('r', links) } }, { delayMs: 1000 });
  assert.equal(network.log.length, 4);
  for (let i = 1; i < network.log.length; i++) {
    assert.ok(network.log[i].start - network.log[i - 1].end >= 1000, `gap before request ${i}`);
  }
});

test('retryable failures back off exponentially and stop at the retry limit', async () => {
  const flaky = await crawl({
    [`${H}/`]: calls => (calls < 3 ? { error: 'TIMEOUT', retryable: true } : { body: html('ok') }),
  });
  const page = flaky.page(`${H}/`);
  assert.equal(page.state, 'done');
  assert.equal(page.attempts, 3);
  const [first, second, third] = flaky.network.log;
  assert.ok(second.start - first.end >= 2000);
  assert.ok(third.start - second.end >= 4000);

  const dead = await crawl({ [`${H}/`]: { status: 503 } }, { maxRetries: 2 });
  assert.equal(dead.page(`${H}/`).state, 'failed');
  assert.equal(dead.page(`${H}/`).attempts, 3);
  assert.equal(dead.page(`${H}/`).error, 'HTTP_503');
});

test('non-retryable failures are recorded once', async () => {
  const { page, network } = await crawl({
    [`${H}/`]: { body: html('r', ['/missing', '/big', '/json', '/ssrf']) },
    [`${H}/big`]: { error: 'TOO_LARGE' },
    [`${H}/json`]: { error: 'NOT_HTML' },
    [`${H}/ssrf`]: { error: 'SSRF_BLOCKED' },
  });
  for (const [path, error] of [['missing', 'HTTP_404'], ['big', 'TOO_LARGE'], ['json', 'NOT_HTML'], ['ssrf', 'SSRF_BLOCKED']]) {
    assert.equal(page(`${H}/${path}`).state, 'failed');
    assert.equal(page(`${H}/${path}`).error, error);
    assert.equal(page(`${H}/${path}`).attempts, 1);
  }
  assert.equal(network.log.length, 5);
});

test('robots.txt disallow, crawl-delay, and failure handling', async () => {
  const robots = body => ({ [`${H}/robots.txt`]: { body, contentType: 'text/plain' } });
  const pages = { [`${H}/`]: { body: html('r', ['/private/x', '/open']) }, [`${H}/open`]: { body: html('o') } };

  const disallow = await crawl({ ...pages, ...robots('User-agent: *\nDisallow: /private\n') }, { respectRobots: true });
  assert.equal(disallow.page(`${H}/private/x`).error, 'ROBOTS_DISALLOWED');
  assert.equal(disallow.fetched.includes(`${H}/private/x`), false);
  assert.equal(disallow.page(`${H}/open`).state, 'done');

  const delayed = await crawl({ ...pages, ...robots('User-agent: *\nCrawl-delay: 5\n') }, { respectRobots: true, delayMs: 1000 });
  const pageCalls = delayed.network.log.filter(call => call.url !== `${H}/robots.txt`);
  for (let i = 1; i < delayed.network.log.length; i++) {
    assert.ok(delayed.network.log[i].start - delayed.network.log[i - 1].end >= 5000);
  }
  assert.equal(pageCalls.length > 0, true);

  const missing = await crawl(pages, { respectRobots: true });
  assert.equal(missing.page(`${H}/private/x`).error, 'HTTP_404');

  const broken = await crawl({ ...pages, [`${H}/robots.txt`]: { status: 500 } }, { respectRobots: true });
  assert.equal(broken.page(`${H}/`).error, 'ROBOTS_DISALLOWED');

  const ignored = await crawl({ ...pages, ...robots('User-agent: *\nDisallow: /\n') }, { respectRobots: false });
  assert.equal(ignored.page(`${H}/`).state, 'done');
});

test('pages with identical content are recorded as duplicates and their links are not followed', async () => {
  const same = html('Same', ['/deep']);
  const { page, fetched } = await crawl({
    [`${H}/`]: { body: html('Home', ['/x', '/y']) },
    [`${H}/x`]: { body: same },
    [`${H}/y`]: { body: same },
    [`${H}/deep`]: { body: html('Deep') },
  });
  assert.equal(page(`${H}/y`).duplicateOf, `${H}/x`);
  assert.equal(page(`${H}/y`).state, 'done');
  assert.equal(fetched.filter(url => url === `${H}/deep`).length, 1);
});

test('cancel stops launching requests and leaves the rest queued', async () => {
  const network = fakeNetwork({ [`${H}/`]: { body: html('r', ['/1', '/2', '/3']) } });
  let crawler;
  const base = crawlerOptions(network, { seed: `${H}/` });
  crawler = new Crawler({ ...base, fetchPage: async (...args) => { const result = await network.fetchPage(...args); crawler.cancel(); return result; } });
  await crawler.run();
  assert.equal(crawler.state, 'cancelled');
  assert.equal(crawler.summary().counts.queued, 3);
  assert.equal(network.log.length, 1);
});

test('concurrency never exceeds the limit', async () => {
  const hosts = ['a.test', 'b.test', 'c.test', 'd.test'];
  const site = { 'http://a.test/': { body: html('r', hosts.slice(1).map(host => `http://${host}/`)) } };
  const network = fakeNetwork(site);
  let active = 0;
  let peak = 0;
  const fetchPage = async (...args) => {
    active++;
    peak = Math.max(peak, active);
    await new Promise(resolve => setImmediate(resolve));
    active--;
    return network.fetchPage(...args);
  };
  const crawler = new Crawler({
    ...crawlerOptions(network, { seed: 'http://a.test/', allowedHosts: hosts, concurrency: 2, delayMs: 0 }),
    fetchPage,
    sleep: ms => new Promise(resolve => setTimeout(resolve, ms)),
    now: Date.now,
  });
  await crawler.run();
  assert.equal(crawler.pages.size, 4);
  assert.ok(peak <= 2, `peak concurrency ${peak}`);
});
