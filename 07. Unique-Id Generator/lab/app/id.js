// Layout (63 usable bits, sign bit always 0 so the ID fits a signed int64):
// | 1 sign | 41 timestamp ms since EPOCH | 10 worker | 12 sequence |
const EPOCH_MS = Date.UTC(2024, 0, 1);
const TIMESTAMP_BITS = 41n;
const WORKER_BITS = 10n;
const SEQUENCE_BITS = 12n;

const MAX_TIMESTAMP = (1n << TIMESTAMP_BITS) - 1n;
const MAX_WORKER = (1n << WORKER_BITS) - 1n;
const MAX_SEQUENCE = (1n << SEQUENCE_BITS) - 1n;
const MAX_ID = (1n << 63n) - 1n;
const EXPIRES_AT_MS = EPOCH_MS + Number(MAX_TIMESTAMP);

class IdError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.code = code;
    this.details = details;
  }
}

function checkField(name, value, max) {
  if (!Number.isSafeInteger(value) || value < 0 || BigInt(value) > max) {
    throw new IdError('OUT_OF_RANGE', `${name} must be an integer from 0 to ${max}`, { field: name });
  }
  return BigInt(value);
}

function encodeId({ timestamp, worker, sequence }) {
  const t = checkField('timestamp', timestamp, MAX_TIMESTAMP);
  const w = checkField('worker', worker, MAX_WORKER);
  const s = checkField('sequence', sequence, MAX_SEQUENCE);
  return (t << (WORKER_BITS + SEQUENCE_BITS)) | (w << SEQUENCE_BITS) | s;
}

function decodeId(id) {
  if (typeof id !== 'bigint' || id < 0n || id > MAX_ID) {
    throw new IdError('OUT_OF_RANGE', `id must be a bigint from 0 to ${MAX_ID}`, { field: 'id' });
  }
  const timestamp = Number(id >> (WORKER_BITS + SEQUENCE_BITS));
  return {
    timestamp,
    unixMs: EPOCH_MS + timestamp,
    worker: Number((id >> SEQUENCE_BITS) & MAX_WORKER),
    sequence: Number(id & MAX_SEQUENCE),
  };
}

// One generator per worker. State is in memory only; it is not safe to run two
// generators with the same worker id.
class IdGenerator {
  constructor({ worker, now = Date.now, epoch = EPOCH_MS, lastTimestamp = -1 }) {
    checkField('worker', worker, MAX_WORKER);
    this.worker = worker;
    this.now = now;
    this.epoch = epoch;
    // Highest timestamp already used. Pass a persisted value after a restart so a
    // rolled-back clock cannot reissue IDs from before the restart.
    this.lastTimestamp = lastTimestamp;
    this.sequence = 0;
  }

  next() {
    const timestamp = this.now() - this.epoch;
    if (timestamp < 0) {
      throw new IdError('BEFORE_EPOCH', 'clock is before the epoch', { timestamp });
    }
    if (timestamp > Number(MAX_TIMESTAMP)) {
      throw new IdError('TIMESTAMP_EXHAUSTED', 'timestamp field is exhausted', { expiresAt: new Date(EXPIRES_AT_MS).toISOString() });
    }
    if (timestamp < this.lastTimestamp) {
      throw new IdError('CLOCK_ROLLBACK', `clock moved back ${this.lastTimestamp - timestamp} ms`, {
        rollbackMs: this.lastTimestamp - timestamp,
      });
    }
    let sequence = 0;
    if (timestamp === this.lastTimestamp) {
      sequence = this.sequence + 1;
      // Never wait or spin for the next millisecond: report overflow and let the caller retry.
      if (sequence > Number(MAX_SEQUENCE)) {
        throw new IdError('SEQUENCE_OVERFLOW', 'sequence exhausted for this millisecond', { retryAfterMs: 1 });
      }
    }
    this.lastTimestamp = timestamp;
    this.sequence = sequence;
    return encodeId({ timestamp, worker: this.worker, sequence });
  }

  // All or nothing: on failure the generator state is restored, so no IDs are burned.
  nextBatch(count) {
    if (!Number.isInteger(count) || count < 1) throw new IdError('OUT_OF_RANGE', 'count must be a positive integer');
    const saved = { lastTimestamp: this.lastTimestamp, sequence: this.sequence };
    try {
      return Array.from({ length: count }, () => this.next());
    } catch (error) {
      Object.assign(this, saved);
      throw error;
    }
  }
}

module.exports = {
  EPOCH_MS,
  EXPIRES_AT_MS,
  MAX_ID,
  MAX_SEQUENCE,
  MAX_TIMESTAMP,
  MAX_WORKER,
  IdError,
  IdGenerator,
  decodeId,
  encodeId,
};
