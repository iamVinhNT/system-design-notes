const test = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../server');
const { EPOCH_MS } = require('../id');

async function withServer(fn, options = {}) {
  const time = { ms: EPOCH_MS + 1000 };
  const server = createApp({ now: () => time.ms, ...options }).listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (method, path) => {
    const response = await fetch(base + path, { method });
    return { status: response.status, headers: response.headers, body: await response.json() };
  };
  try {
    await fn(call, time);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}

test('issues single and batch ids as strings and decodes them', () => withServer(async call => {
  const single = await call('POST', '/v1/ids?worker=2');
  assert.equal(single.status, 201);
  assert.equal(single.body.ids.length, 1);
  assert.equal(typeof single.body.ids[0], 'string');

  const batch = await call('POST', '/v1/ids?count=5');
  assert.equal(new Set(batch.body.ids).size, 5);
  assert.equal(batch.body.worker, 1);

  const decoded = await call('GET', `/v1/ids/${single.body.ids[0]}/decode`);
  assert.equal(decoded.body.worker, 2);
  assert.equal(decoded.body.timestamp, 1000);
  assert.equal(decoded.body.sequence, 0);

  const layout = await call('GET', '/v1/layout');
  assert.equal(layout.body.bits.timestamp, 41);
  assert.equal(layout.body.expiresAt, '2093-09-06T15:47:35.551Z');
}));

test('validates worker, count, and id', () => withServer(async call => {
  assert.equal((await call('POST', '/v1/ids?worker=99')).status, 404);
  assert.equal((await call('POST', '/v1/ids?worker=abc')).status, 400);
  assert.equal((await call('POST', '/v1/ids?count=0')).status, 400);
  assert.equal((await call('POST', '/v1/ids?count=1001')).status, 400);
  assert.equal((await call('GET', '/v1/ids/abc/decode')).status, 400);
  assert.equal((await call('GET', '/v1/ids/9223372036854775808/decode')).status, 400);
  assert.equal((await call('GET', '/v1/ids/9223372036854775807/decode')).status, 200);
}));

test('overflow and rollback return 503 and clear when the clock moves', () => withServer(async (call, time) => {
  for (let i = 0; i < 4; i++) assert.equal((await call('POST', '/v1/ids?count=1000')).status, 201);
  const overflow = await call('POST', '/v1/ids?count=1000');
  assert.equal(overflow.status, 503);
  assert.equal(overflow.body.code, 'SEQUENCE_OVERFLOW');
  assert.equal(overflow.headers.get('retry-after'), '1');
  assert.equal((await call('POST', '/v1/ids?count=96')).status, 201);
  assert.equal((await call('POST', '/v1/ids?worker=2')).status, 201);

  time.ms += 1;
  assert.equal((await call('POST', '/v1/ids')).status, 201);
  time.ms -= 3;
  const rollback = await call('POST', '/v1/ids');
  assert.equal(rollback.status, 503);
  assert.equal(rollback.body.code, 'CLOCK_ROLLBACK');
  assert.equal(rollback.body.rollbackMs, 3);
}));

test('rejects duplicate configured worker ids', () => {
  assert.throws(() => createApp({ workerIds: [1, 1] }), RangeError);
});
