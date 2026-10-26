const MAX_URL_LENGTH = 2048;
const HOST_PATTERN = /^[a-z0-9]([a-z0-9.-]*[a-z0-9])?(:\d{1,5})?$/;

class CrawlError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

// Absolute http(s) URL without fragment, credentials, or userinfo. Query parameters are sorted so
// `?a=1&b=2` and `?b=2&a=1` dedupe; this re-encodes the query, which is fine for crawling but
// would not be for a proxy. Over-long URLs are rejected, a cheap spider-trap guard.
function normalizeUrl(raw, base) {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > MAX_URL_LENGTH) {
    throw new CrawlError('INVALID_URL', `url must be a string of 1-${MAX_URL_LENGTH} characters`);
  }
  let url;
  try {
    url = new URL(raw.trim(), base);
  } catch {
    throw new CrawlError('INVALID_URL', 'url is not a valid absolute URL');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new CrawlError('UNSUPPORTED_SCHEME', 'only http and https URLs can be crawled');
  }
  if (url.username !== '' || url.password !== '') {
    throw new CrawlError('INVALID_URL', 'url must not contain credentials');
  }
  url.hash = '';
  url.searchParams.sort();
  if (url.href.length > MAX_URL_LENGTH) throw new CrawlError('INVALID_URL', 'normalized url is too long');
  return url.href;
}

// Allowlist entries are exact `host[:port]` values, so a subdomain or another port is not implied.
function isAllowedHost(href, allowedHosts) {
  return allowedHosts.has(new URL(href).host);
}

function parseHostList(hosts) {
  if (!Array.isArray(hosts) || hosts.length === 0 || hosts.length > 20) {
    throw new CrawlError('INVALID_HOSTS', 'allowedHosts must be a list of 1-20 hosts');
  }
  for (const host of hosts) {
    if (typeof host !== 'string' || !HOST_PATTERN.test(host)) {
      throw new CrawlError('INVALID_HOSTS', 'each allowed host must be a lowercase host[:port]');
    }
  }
  return new Set(hosts);
}

module.exports = { CrawlError, MAX_URL_LENGTH, isAllowedHost, normalizeUrl, parseHostList };
