const { FetchError } = require('../fetcher');

function html(title, links = []) {
  return `<html><head><title>${title}</title></head><body>${links.map(href => `<a href="${href}">x</a>`).join('')}</body></html>`;
}

// A fake network on a virtual clock: every fetch takes `latencyMs`, and sleeping advances time.
// `site` maps URL -> { body, status, location, error }; a function value is called per request.
function fakeNetwork(site, { latencyMs = 5 } = {}) {
  const clock = { ms: 0 };
  const log = [];
  const fetchPage = async (url, options) => {
    const start = clock.ms;
    clock.ms += latencyMs;
    log.push({ url, start, end: clock.ms, types: options.types });
    let entry = site[url];
    if (typeof entry === 'function') entry = entry(log.filter(call => call.url === url).length);
    if (entry === undefined) entry = { status: 404 };
    if (entry.error) throw new FetchError(entry.error, 'simulated', entry.retryable ?? false);
    const status = entry.status ?? 200;
    return {
      status,
      headers: {},
      contentType: entry.contentType ?? 'text/html',
      location: entry.location,
      body: entry.body ?? '',
    };
  };
  return { clock, log, fetchPage, now: () => clock.ms, sleep: async ms => { clock.ms += ms; } };
}

function crawlerOptions(network, overrides = {}) {
  return {
    delayMs: 1000,
    concurrency: 1,
    respectRobots: false,
    now: network.now,
    sleep: network.sleep,
    fetchPage: network.fetchPage,
    ...overrides,
  };
}

module.exports = { crawlerOptions, fakeNetwork, html };
