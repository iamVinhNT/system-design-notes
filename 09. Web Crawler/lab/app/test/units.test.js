const test = require('node:test');
const assert = require('node:assert/strict');
const { CrawlError, isAllowedHost, normalizeUrl, parseHostList } = require('../url');
const { parseRobots } = require('../robots');
const { extractLinks, extractTitle } = require('../html');
const { Frontier } = require('../frontier');

function failsWith(fn, code) {
  assert.throws(fn, error => error instanceof CrawlError && error.code === code);
}

test('normalizeUrl strips fragments, sorts queries, lowercases hosts, and resolves relative links', () => {
  assert.equal(normalizeUrl('HTTP://Example.COM:80/a#frag'), 'http://example.com/a');
  assert.equal(normalizeUrl('http://example.com'), 'http://example.com/');
  assert.equal(normalizeUrl('http://example.com/a?y=2&x=1'), normalizeUrl('http://example.com/a?x=1&y=2'));
  assert.equal(normalizeUrl('../c?z=1', 'http://example.com/a/b/'), 'http://example.com/a/c?z=1');
  assert.equal(normalizeUrl('//cdn.example.com/x', 'https://example.com/'), 'https://cdn.example.com/x');
  assert.equal(normalizeUrl('  /spaced ', 'http://example.com/'), 'http://example.com/spaced');
});

test('normalizeUrl rejects non-http schemes, credentials, relative input, and over-long URLs', () => {
  failsWith(() => normalizeUrl('javascript:alert(1)'), 'UNSUPPORTED_SCHEME');
  failsWith(() => normalizeUrl('mailto:a@example.com'), 'UNSUPPORTED_SCHEME');
  failsWith(() => normalizeUrl('ftp://example.com/'), 'UNSUPPORTED_SCHEME');
  failsWith(() => normalizeUrl('file:///etc/passwd'), 'UNSUPPORTED_SCHEME');
  failsWith(() => normalizeUrl('http://user:pw@example.com/'), 'INVALID_URL');
  failsWith(() => normalizeUrl('/relative'), 'INVALID_URL');
  failsWith(() => normalizeUrl(`http://example.com/${'a'.repeat(2100)}`), 'INVALID_URL');
  failsWith(() => normalizeUrl(42), 'INVALID_URL');
});

test('allowlist matches exact host and port only', () => {
  const allowed = parseHostList(['example.com', 'lab.test:8080']);
  assert.equal(isAllowedHost('http://example.com/x', allowed), true);
  assert.equal(isAllowedHost('http://lab.test:8080/x', allowed), true);
  assert.equal(isAllowedHost('http://lab.test:9090/x', allowed), false);
  assert.equal(isAllowedHost('http://sub.example.com/x', allowed), false);
  assert.equal(isAllowedHost('http://example.com.evil.test/x', allowed), false);
  failsWith(() => parseHostList([]), 'INVALID_HOSTS');
  failsWith(() => parseHostList(['Example.com']), 'INVALID_HOSTS');
  failsWith(() => parseHostList(['a.com/path']), 'INVALID_HOSTS');
});

test('robots.txt: group selection, wildcards, crawl-delay, and ignored Allow', () => {
  const text = `
    User-agent: *
    Disallow: /private
    Disallow: /*.pdf$
    Crawl-delay: 3
    Allow: /private/ok

    User-agent: LabCrawler
    Disallow: /only-for-us
  `;
  const generic = parseRobots(text, 'OtherBot');
  assert.equal(generic.isAllowed('/private/x'), false);
  assert.equal(generic.isAllowed('/private/ok'), false);
  assert.equal(generic.isAllowed('/docs/a.pdf'), false);
  assert.equal(generic.isAllowed('/docs/a.pdf?x=1'), true);
  assert.equal(generic.isAllowed('/public'), true);
  assert.equal(generic.crawlDelayMs, 3000);
  const ours = parseRobots(text, 'LabCrawler');
  assert.equal(ours.isAllowed('/private/x'), true);
  assert.equal(ours.isAllowed('/only-for-us'), false);
  assert.equal(parseRobots('User-agent: *\nDisallow: /', 'x').isAllowed('/anything'), false);
  assert.equal(parseRobots('User-agent: *\nDisallow:', 'x').isAllowed('/anything'), true);
  assert.equal(parseRobots('', 'x').isAllowed('/anything'), true);
});

test('extractLinks handles quoting styles, nofollow, entities, and the per-page limit', () => {
  const body = `<a href="/one">1</a> <A HREF='/two'>2</A> <a class=x href=/three>3</a>
    <a href="/four?a=1&amp;b=2">4</a> <a rel="nofollow noopener" href="/skip">s</a> <a name="no-href">n</a>`;
  assert.deepEqual(extractLinks(body, 100), ['/one', '/two', '/three', '/four?a=1&b=2']);
  assert.deepEqual(extractLinks(body, 2), ['/one', '/two']);
  assert.equal(extractTitle('<title>\n Hello   &amp; world </title>'), 'Hello & world');
  assert.equal(extractTitle('<p>none</p>'), null);
});

test('frontier dedups, keeps FIFO per host, and enforces one in flight plus the delay per host', () => {
  const frontier = new Frontier({ delayMs: 100 });
  assert.equal(frontier.add({ url: 'http://a.test/1' }), true);
  assert.equal(frontier.add({ url: 'http://a.test/1' }), false);
  frontier.add({ url: 'http://a.test/2' });
  frontier.add({ url: 'http://b.test/1' });

  assert.equal(frontier.next(0).url, 'http://a.test/1');
  assert.equal(frontier.next(0).url, 'http://b.test/1');
  assert.equal(frontier.next(0), null);
  frontier.complete('a.test', 10);
  assert.equal(frontier.next(50), null);
  assert.equal(frontier.nextReadyIn(50), 60);
  assert.equal(frontier.next(110).url, 'http://a.test/2');
  assert.equal(frontier.nextReadyIn(110), null);
});
