const { createHash } = require('node:crypto');
const { FetchError, fetchOnce } = require('./fetcher');
const { Frontier } = require('./frontier');
const { extractLinks, extractTitle } = require('./html');
const { ALLOW_ALL, DISALLOW_ALL, parseRobots } = require('./robots');
const { CrawlError, isAllowedHost, normalizeUrl, parseHostList } = require('./url');

const MAX_CRAWL_DELAY_MS = 30_000;
const ROBOTS_MAX_BYTES = 64 * 1024;

class Crawler {
  constructor({
    seed,
    allowedHosts,
    maxDepth = 2,
    maxPages = 50,
    delayMs = 1000,
    concurrency = 2,
    maxRetries = 2,
    maxRedirects = 5,
    maxLinksPerPage = 100,
    timeoutMs = 5000,
    maxBytes = 512 * 1024,
    userAgent = 'LabCrawler/1.0',
    respectRobots = true,
    allowPrivateNetwork = false,
    now = Date.now,
    sleep = ms => new Promise(resolve => setTimeout(resolve, ms)),
    fetchPage = fetchOnce,
  }) {
    this.seed = normalizeUrl(seed);
    this.allowedHosts = parseHostList(allowedHosts ?? [new URL(this.seed).host]);
    if (!isAllowedHost(this.seed, this.allowedHosts)) throw new CrawlError('SEED_NOT_ALLOWED', 'seed host is not in the allowlist');
    Object.assign(this, { maxDepth, maxPages, concurrency, maxRetries, maxRedirects, maxLinksPerPage, respectRobots, now, sleep, fetchPage });
    this.delayMs = delayMs;
    this.agentToken = userAgent.split('/')[0];
    this.fetchOptions = { timeoutMs, maxBytes, userAgent, allowPrivateNetwork };
    this.frontier = new Frontier({ delayMs });
    this.pages = new Map();
    this.contentSeen = new Map();
    this.robots = new Map();
    this.state = 'queued';
    this.error = null;
    this.stats = { duplicateUrls: 0, skippedMaxPages: 0, requests: 0 };
  }

  async run() {
    this.state = 'running';
    this.#enqueue(this.seed, 0);
    const running = new Set();
    try {
      while (this.state === 'running') {
        this.#launch(running);
        if (running.size === 0) {
          const wait = this.frontier.nextReadyIn(this.now());
          if (wait === null) break;
          await this.sleep(wait);
          continue;
        }
        // Wake when a request ends, or when an idle host's delay elapses and a slot is free.
        const waits = [...running];
        const wake = this.frontier.nextReadyIn(this.now());
        if (running.size < this.concurrency && wake !== null) waits.push(this.sleep(Math.max(wake, 1)));
        await Promise.race(waits);
      }
      await Promise.all(running);
      this.state = this.state === 'cancelling' ? 'cancelled' : 'completed';
    } catch (error) {
      await Promise.allSettled(running);
      this.state = 'failed';
      this.error = error.message;
    }
  }

  // Stops launching new requests; requests already in flight finish (bounded by the timeout).
  cancel() {
    if (this.state === 'running') this.state = 'cancelling';
  }

  summary() {
    const counts = { queued: 0, fetching: 0, done: 0, failed: 0 };
    for (const page of this.pages.values()) counts[page.state]++;
    return { state: this.state, error: this.error, counts, accepted: this.pages.size, ...this.stats };
  }

  listPages() {
    return [...this.pages.values()];
  }

  #launch(running) {
    while (this.state === 'running' && running.size < this.concurrency) {
      const item = this.frontier.next(this.now());
      if (item === null) return;
      const task = this.#process(item).finally(() => running.delete(task));
      running.add(task);
    }
  }

  // Adds a URL once: dedup first, then the page budget. `seen.size` is the number of accepted URLs.
  #enqueue(url, depth, redirects = 0) {
    if (this.frontier.seen.has(url)) {
      this.stats.duplicateUrls++;
      return false;
    }
    if (this.frontier.seen.size >= this.maxPages) {
      this.stats.skippedMaxPages++;
      return false;
    }
    this.frontier.add({ url, depth, redirects });
    this.pages.set(url, { url, depth, state: 'queued', attempts: 0, status: null, error: null });
    return true;
  }

  async #process(item) {
    const record = this.pages.get(item.url);
    const { host, origin, pathname, search } = new URL(item.url);
    record.state = 'fetching';
    record.attempts++;
    let extraDelayMs = 0;
    try {
      const rules = await this.#robotsFor(host, origin);
      if (!rules.isAllowed(pathname + search)) throw new FetchError('ROBOTS_DISALLOWED', 'blocked by robots.txt');
      this.stats.requests++;
      this.#handle(item, record, await this.fetchPage(item.url, this.fetchOptions));
      record.error = null;
    } catch (error) {
      if (error.retryable && record.attempts <= this.maxRetries) {
        record.state = 'queued';
        record.error = error.code;
        extraDelayMs = this.delayMs * 2 ** record.attempts;
        this.frontier.requeue(item);
      } else {
        record.state = 'failed';
        record.error = error.code ?? 'INTERNAL_ERROR';
        record.message = error.message;
      }
    } finally {
      this.frontier.complete(host, this.now(), extraDelayMs);
    }
  }

  // robots.txt is fetched once per host per job through the same guarded fetcher. Any failure to
  // read it (5xx, timeout, network) is treated as "disallow all": cautious beats rude.
  async #robotsFor(host, origin) {
    if (!this.respectRobots) return ALLOW_ALL;
    if (this.robots.has(host)) return this.robots.get(host);
    let rules;
    try {
      this.stats.requests++;
      const result = await this.fetchPage(`${origin}/robots.txt`, {
        ...this.fetchOptions,
        maxBytes: Math.min(this.fetchOptions.maxBytes, ROBOTS_MAX_BYTES),
        types: ['text/plain', 'text/html'],
      });
      if (result.status === 200) rules = parseRobots(result.body, this.agentToken);
      else rules = result.status === 429 || result.status >= 500 ? DISALLOW_ALL : ALLOW_ALL;
    } catch (error) {
      // A policy block says why the host is unreachable; other failures just mean "robots unknown".
      if (error.code === 'SSRF_BLOCKED') throw error;
      rules = DISALLOW_ALL;
    }
    this.robots.set(host, rules);
    if (rules.crawlDelayMs !== null) {
      this.frontier.setDelay(host, Math.min(Math.max(this.delayMs, rules.crawlDelayMs), MAX_CRAWL_DELAY_MS));
    }
    // The robots request counts as this host's request, so wait before the page request.
    await this.sleep(this.frontier.delayFor(host));
    return rules;
  }

  #handle(item, record, result) {
    record.status = result.status;
    if (result.status >= 300 && result.status < 400) return this.#handleRedirect(item, record, result);
    if (result.status >= 400) {
      throw new FetchError(`HTTP_${result.status}`, `server answered ${result.status}`, result.status === 429 || result.status >= 500);
    }
    record.contentType = result.contentType;
    record.bytes = Buffer.byteLength(result.body);
    record.title = extractTitle(result.body);
    record.contentHash = createHash('sha256').update(result.body).digest('hex');
    const original = this.contentSeen.get(record.contentHash);
    if (original !== undefined) {
      // Same bytes as an earlier page: keep the record, do not follow its links again.
      record.duplicateOf = original;
      record.state = 'done';
      return;
    }
    this.contentSeen.set(record.contentHash, item.url);

    const links = item.depth < this.maxDepth ? extractLinks(result.body, this.maxLinksPerPage) : [];
    Object.assign(record, { linksFound: links.length, linksQueued: 0, linksExternal: 0, linksRejected: 0 });
    for (const raw of links) {
      let href;
      try {
        href = normalizeUrl(raw, item.url);
      } catch {
        record.linksRejected++;
        continue;
      }
      if (!isAllowedHost(href, this.allowedHosts)) record.linksExternal++;
      else if (this.#enqueue(href, item.depth + 1)) record.linksQueued++;
    }
    record.state = 'done';
  }

  // A redirect is never followed inline: the target goes through the frontier like any link, so it
  // is checked against the allowlist, deduplicated, counted against the budget, and paced per host.
  #handleRedirect(item, record, result) {
    let target;
    try {
      target = normalizeUrl(result.location, item.url);
    } catch {
      throw new FetchError('BAD_REDIRECT', 'redirect has a missing or invalid Location');
    }
    if (!isAllowedHost(target, this.allowedHosts)) {
      throw new FetchError('REDIRECT_OUT_OF_SCOPE', 'redirect leaves the allowlist');
    }
    if (item.redirects + 1 > this.maxRedirects) throw new FetchError('TOO_MANY_REDIRECTS', 'redirect chain is too long');
    record.redirectTo = target;
    this.#enqueue(target, item.depth, item.redirects + 1);
    record.state = 'done';
  }
}

module.exports = { Crawler };
