const express = require('express');
const {
  EPOCH_MS, EXPIRES_AT_MS, MAX_ID, MAX_SEQUENCE, MAX_WORKER, IdError, IdGenerator, decodeId,
} = require('./id');

const MAX_BATCH = 1000;
const STATUS_BY_CODE = {
  OUT_OF_RANGE: 400,
  UNKNOWN_WORKER: 404,
  CLOCK_ROLLBACK: 503,
  SEQUENCE_OVERFLOW: 503,
  BEFORE_EPOCH: 503,
  TIMESTAMP_EXHAUSTED: 503,
};

function parseInteger(value, name, fallback) {
  if (value === undefined) return fallback;
  if (typeof value !== 'string' || !/^\d+$/.test(value)) {
    throw new IdError('OUT_OF_RANGE', `${name} must be a non-negative integer`, { field: name });
  }
  return Number(value);
}

// Simulates several workers in one process. Each worker id appears once, so this fleet
// cannot reproduce the real risk of two machines sharing a worker id.
function createApp({ workerIds = [1, 2, 3], now = Date.now } = {}) {
  if (new Set(workerIds).size !== workerIds.length) throw new RangeError('workerIds must be unique');
  const workers = new Map(workerIds.map(worker => [worker, new IdGenerator({ worker, now })]));
  const app = express();

  app.get('/v1/layout', (_req, res) => {
    res.json({
      bits: { sign: 1, timestamp: 41, worker: 10, sequence: 12 },
      epoch: new Date(EPOCH_MS).toISOString(),
      expiresAt: new Date(EXPIRES_AT_MS).toISOString(),
      maxWorker: Number(MAX_WORKER),
      maxSequencePerMs: Number(MAX_SEQUENCE) + 1,
      maxBatch: MAX_BATCH,
    });
  });

  app.get('/v1/workers', (_req, res) => res.json({ workers: [...workers.keys()] }));

  // POST: every call changes generator state, so it is not idempotent.
  app.post('/v1/ids', (req, res) => {
    const worker = parseInteger(req.query.worker, 'worker', workerIds[0]);
    const count = parseInteger(req.query.count, 'count', 1);
    if (count < 1 || count > MAX_BATCH) {
      throw new IdError('OUT_OF_RANGE', `count must be an integer from 1 to ${MAX_BATCH}`, { field: 'count' });
    }
    const generator = workers.get(worker);
    if (!generator) throw new IdError('UNKNOWN_WORKER', `worker ${worker} is not configured`, { worker });
    // IDs are strings: values above 2^53 lose precision as JSON numbers.
    res.status(201).json({ worker, ids: generator.nextBatch(count).map(String) });
  });

  app.get('/v1/ids/:id/decode', (req, res) => {
    if (!/^\d{1,19}$/.test(req.params.id) || BigInt(req.params.id) > MAX_ID) {
      throw new IdError('OUT_OF_RANGE', `id must be a decimal integer from 0 to ${MAX_ID}`, { field: 'id' });
    }
    const decoded = decodeId(BigInt(req.params.id));
    res.json({ id: req.params.id, ...decoded, time: new Date(decoded.unixMs).toISOString() });
  });

  app.use((error, _req, res, _next) => {
    if (error instanceof IdError) {
      if (error.details.retryAfterMs) res.set('Retry-After', '1');
      return res.status(STATUS_BY_CODE[error.code] ?? 500).json({ error: error.message, code: error.code, ...error.details });
    }
    process.stderr.write(`${error.stack}\n`);
    res.status(500).json({ error: 'internal error' });
  });

  return app;
}

if (require.main === module) {
  createApp().listen(3000, () => process.stdout.write('Listening on http://localhost:3000\n'));
}

module.exports = { createApp };
