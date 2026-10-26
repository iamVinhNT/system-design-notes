const { randomUUID } = require('node:crypto');
const express = require('express');
const { Crawler } = require('./crawler');
const { CrawlError, isAllowedHost, normalizeUrl, parseHostList } = require('./url');

const MAX_RETAINED_JOBS = 20;
const DEFAULT_LIMITS = { maxDepth: 5, maxPages: 500, minDelayMs: 500, maxDelayMs: 60_000 };

class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function intField(body, name, fallback, min, max) {
  const value = body[name] ?? fallback;
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new ApiError(400, 'INVALID_REQUEST', `${name} must be an integer from ${min} to ${max}`);
  }
  return value;
}

// `allowedHosts` is the operator's allowlist: a job may only crawl hosts inside it, and an empty
// list rejects every job. `allowPrivateNetwork` is an operator switch for lab sites; requests cannot set it.
function createApp({ allowedHosts = [], allowPrivateNetwork = false, limits = {}, crawlerOptions = {} } = {}) {
  const operatorHosts = new Set(allowedHosts);
  const max = { ...DEFAULT_LIMITS, ...limits };
  const jobs = new Map();
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '8kb' }));

  const describe = job => ({
    id: job.id,
    createdAt: job.createdAt,
    config: job.config,
    ...job.crawler.summary(),
  });
  const findJob = id => {
    const job = jobs.get(id);
    if (!job) throw new ApiError(404, 'JOB_NOT_FOUND', 'job not found');
    return job;
  };

  app.post('/api/jobs', (req, res) => {
    const body = req.body;
    if (body === null || typeof body !== 'object' || Array.isArray(body)) throw new ApiError(400, 'INVALID_REQUEST', 'body must be a JSON object');
    if ([...jobs.values()].some(job => ['running', 'cancelling'].includes(job.crawler.state))) {
      // One job at a time keeps the per-host politeness guarantee simple.
      throw new ApiError(409, 'JOB_RUNNING', 'another job is still running');
    }
    const seed = normalizeUrl(body.seed);
    const hosts = body.allowedHosts === undefined ? [new URL(seed).host] : body.allowedHosts;
    parseHostList(hosts);
    for (const host of hosts) {
      if (!operatorHosts.has(host)) throw new ApiError(403, 'HOST_NOT_ALLOWED', `host ${host} is not enabled on this server`);
    }
    const config = {
      seed,
      allowedHosts: hosts,
      maxDepth: intField(body, 'maxDepth', 2, 0, max.maxDepth),
      maxPages: intField(body, 'maxPages', 50, 1, max.maxPages),
      delayMs: intField(body, 'delayMs', 1000, max.minDelayMs, max.maxDelayMs),
    };
    if (!isAllowedHost(seed, new Set(hosts))) throw new ApiError(400, 'SEED_NOT_ALLOWED', 'seed host must be in allowedHosts');

    const crawler = new Crawler({ ...crawlerOptions, ...config, allowPrivateNetwork });
    const job = { id: randomUUID(), createdAt: new Date().toISOString(), config, crawler };
    jobs.set(job.id, job);
    for (const [id, old] of jobs) {
      if (jobs.size <= MAX_RETAINED_JOBS) break;
      if (!['running', 'cancelling'].includes(old.crawler.state)) jobs.delete(id);
    }
    crawler.run();
    res.status(202).json(describe(job));
  });

  app.get('/api/jobs/:id', (req, res) => res.json(describe(findJob(req.params.id))));

  app.get('/api/jobs/:id/pages', (req, res) => {
    const job = findJob(req.params.id);
    const state = req.query.state;
    if (state !== undefined && !['queued', 'fetching', 'done', 'failed'].includes(state)) {
      throw new ApiError(400, 'INVALID_REQUEST', 'state must be queued, fetching, done, or failed');
    }
    const limit = req.query.limit === undefined ? 50 : Number(req.query.limit);
    const offset = req.query.offset === undefined ? 0 : Number(req.query.offset);
    if (!Number.isInteger(limit) || limit < 1 || limit > 200 || !Number.isInteger(offset) || offset < 0) {
      throw new ApiError(400, 'INVALID_REQUEST', 'limit must be 1-200 and offset a non-negative integer');
    }
    const pages = job.crawler.listPages().filter(page => state === undefined || page.state === state);
    res.json({ total: pages.length, pages: pages.slice(offset, offset + limit) });
  });

  app.delete('/api/jobs/:id', (req, res) => {
    const job = findJob(req.params.id);
    job.crawler.cancel();
    res.status(job.crawler.state === 'cancelling' ? 202 : 200).json(describe(job));
  });

  app.use((error, _req, res, _next) => {
    if (error instanceof ApiError || error instanceof CrawlError) {
      return res.status(error.status ?? 400).json({ error: error.message, code: error.code });
    }
    if (error.type === 'entity.too.large') return res.status(413).json({ error: 'request body too large', code: 'TOO_LARGE' });
    if (error.type === 'entity.parse.failed') return res.status(400).json({ error: 'invalid JSON body', code: 'INVALID_REQUEST' });
    process.stderr.write(`${error.stack}\n`);
    res.status(500).json({ error: 'internal error', code: 'INTERNAL' });
  });

  return app;
}

if (require.main === module) {
  const hosts = (process.env.CRAWLER_ALLOWED_HOSTS ?? '').split(',').map(host => host.trim()).filter(Boolean);
  const allowPrivateNetwork = process.env.CRAWLER_ALLOW_PRIVATE === '1';
  createApp({ allowedHosts: hosts, allowPrivateNetwork }).listen(3000, () => {
    process.stdout.write(`Listening on http://localhost:3000 (allowed hosts: ${hosts.join(', ') || 'none'})\n`);
  });
}

module.exports = { createApp };
