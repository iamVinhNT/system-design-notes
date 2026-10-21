const test = require('node:test');
const assert = require('node:assert/strict');
const {
  EPOCH_MS, EXPIRES_AT_MS, MAX_ID, MAX_SEQUENCE, MAX_TIMESTAMP, MAX_WORKER, IdError, IdGenerator, decodeId, encodeId,
} = require('../id');

function clock(start = 0) {
  const state = { ms: EPOCH_MS + start };
  state.now = () => state.ms;
  return state;
}

function failsWith(fn, code) {
  assert.throws(fn, error => error instanceof IdError && error.code === code);
}

test('encode matches known vectors and decode inverts it', () => {
  const vectors = [
    [{ timestamp: 0, worker: 0, sequence: 0 }, 0n],
    [{ timestamp: 0, worker: 0, sequence: 1 }, 1n],
    [{ timestamp: 0, worker: 1, sequence: 0 }, 4096n],
    [{ timestamp: 1, worker: 0, sequence: 0 }, 4194304n],
    [{ timestamp: 1000, worker: 5, sequence: 7 }, 4194324487n],
    [{ timestamp: Number(MAX_TIMESTAMP), worker: Number(MAX_WORKER), sequence: Number(MAX_SEQUENCE) }, MAX_ID],
  ];
  for (const [fields, expected] of vectors) {
    assert.equal(encodeId(fields), expected);
    const decoded = decodeId(expected);
    assert.deepEqual({ timestamp: decoded.timestamp, worker: decoded.worker, sequence: decoded.sequence }, fields);
  }
  assert.equal(decodeId(MAX_ID).unixMs, EXPIRES_AT_MS);
});

test('fields and ids outside their domain are rejected', () => {
  failsWith(() => encodeId({ timestamp: -1, worker: 0, sequence: 0 }), 'OUT_OF_RANGE');
  failsWith(() => encodeId({ timestamp: Number(MAX_TIMESTAMP) + 1, worker: 0, sequence: 0 }), 'OUT_OF_RANGE');
  failsWith(() => encodeId({ timestamp: 0, worker: 1024, sequence: 0 }), 'OUT_OF_RANGE');
  failsWith(() => encodeId({ timestamp: 0, worker: 0, sequence: 4096 }), 'OUT_OF_RANGE');
  failsWith(() => encodeId({ timestamp: 0, worker: 1.5, sequence: 0 }), 'OUT_OF_RANGE');
  failsWith(() => decodeId(-1n), 'OUT_OF_RANGE');
  failsWith(() => decodeId(MAX_ID + 1n), 'OUT_OF_RANGE');
  failsWith(() => decodeId(5), 'OUT_OF_RANGE');
  failsWith(() => new IdGenerator({ worker: 1024 }), 'OUT_OF_RANGE');
});

test('same millisecond increments sequence and a new millisecond resets it', () => {
  const time = clock(10);
  const generator = new IdGenerator({ worker: 3, now: time.now });
  const a = decodeId(generator.next());
  const b = decodeId(generator.next());
  assert.deepEqual([a.timestamp, a.worker, a.sequence], [10, 3, 0]);
  assert.deepEqual([b.timestamp, b.sequence], [10, 1]);
  time.ms += 1;
  const c = decodeId(generator.next());
  assert.deepEqual([c.timestamp, c.sequence], [11, 0]);
});

test('sequence overflow throws without looping and recovers on the next millisecond', () => {
  const time = clock();
  const generator = new IdGenerator({ worker: 1, now: time.now });
  for (let i = 0; i <= Number(MAX_SEQUENCE); i++) generator.next();
  assert.throws(() => generator.next(), error => error.code === 'SEQUENCE_OVERFLOW' && error.details.retryAfterMs === 1);
  assert.throws(() => generator.next(), error => error.code === 'SEQUENCE_OVERFLOW');
  time.ms += 1;
  assert.equal(decodeId(generator.next()).sequence, 0);
});

test('clock rollback is rejected, not reissued, and recovers once the clock catches up', () => {
  const time = clock(100);
  const generator = new IdGenerator({ worker: 1, now: time.now });
  const first = generator.next();
  time.ms -= 5;
  assert.throws(() => generator.next(), error => error.code === 'CLOCK_ROLLBACK' && error.details.rollbackMs === 5);
  time.ms += 5;
  assert.ok(generator.next() > first);
});

test('batch is all or nothing and does not burn ids on failure', () => {
  const time = clock();
  const generator = new IdGenerator({ worker: 1, now: time.now });
  generator.nextBatch(4000);
  failsWith(() => generator.nextBatch(200), 'SEQUENCE_OVERFLOW');
  assert.equal(generator.nextBatch(96).length, 96);
  failsWith(() => generator.next(), 'SEQUENCE_OVERFLOW');
  failsWith(() => generator.nextBatch(0), 'OUT_OF_RANGE');
});

test('persisted high-water mark blocks duplicates after a restart with a rolled-back clock', () => {
  const time = clock(500);
  const before = new IdGenerator({ worker: 1, now: time.now });
  const issued = before.next();
  const unsafe = new IdGenerator({ worker: 1, now: () => EPOCH_MS + 400 });
  assert.notEqual(unsafe.next(), issued);
  const restarted = new IdGenerator({ worker: 1, now: () => EPOCH_MS + 400, lastTimestamp: before.lastTimestamp });
  failsWith(() => restarted.next(), 'CLOCK_ROLLBACK');
  // Same-millisecond restart without the mark repeats sequence 0: the mark is the only guard.
  const sameMs = new IdGenerator({ worker: 1, now: time.now });
  assert.equal(sameMs.next(), issued);
});

test('different workers never collide, even in the same millisecond', () => {
  const time = clock();
  const generators = [1, 2, 3, 4].map(worker => new IdGenerator({ worker, now: time.now }));
  const seen = new Set();
  for (let tick = 0; tick < 5; tick++) {
    for (const generator of generators) for (const id of generator.nextBatch(1000)) seen.add(id);
    time.ms += 1;
  }
  assert.equal(seen.size, 4 * 5 * 1000);
});

test('duplicate worker ids collide: coordination of worker ids is required', () => {
  const time = clock();
  const a = new IdGenerator({ worker: 7, now: time.now });
  const b = new IdGenerator({ worker: 7, now: time.now });
  assert.equal(a.next(), b.next());
});

test('ids from one worker sort by creation time', () => {
  const time = clock();
  const generator = new IdGenerator({ worker: 9, now: time.now });
  const ids = [];
  for (let i = 0; i < 50; i++) {
    ids.push(generator.next());
    if (i % 7 === 0) time.ms += 1;
  }
  assert.deepEqual([...ids].sort((x, y) => (x < y ? -1 : x > y ? 1 : 0)), ids);
});

test('clock before the epoch and past timestamp exhaustion are rejected', () => {
  failsWith(() => new IdGenerator({ worker: 1, now: () => EPOCH_MS - 1 }).next(), 'BEFORE_EPOCH');
  const last = new IdGenerator({ worker: 1, now: () => EXPIRES_AT_MS });
  assert.equal(decodeId(last.next()).timestamp, Number(MAX_TIMESTAMP));
  failsWith(() => new IdGenerator({ worker: 1, now: () => EXPIRES_AT_MS + 1 }).next(), 'TIMESTAMP_EXHAUSTED');
});
