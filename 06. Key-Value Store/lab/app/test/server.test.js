const test = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../server');
const { Cluster } = require('../store');

async function withServer(fn, cluster = new Cluster()) {
  const server = createApp(cluster).listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (method, path, body) => {
    const response = await fetch(base + path, {
      method,
      headers: body === undefined ? {} : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
    });
    return { status: response.status, body: await response.json() };
  };
  try {
    await fn(call);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}

test('CRUD over HTTP', () => withServer(async call => {
  assert.equal((await call('GET', '/v1/kv/user:1')).status, 404);
  const put = await call('PUT', '/v1/kv/user:1', { value: { name: 'An' } });
  assert.equal(put.status, 200);
  assert.equal(put.body.acks, 3);
  const get = await call('GET', '/v1/kv/user:1');
  assert.deepEqual(get.body.value, { name: 'An' });
  assert.deepEqual((await call('GET', '/v1/partition/user:1')).body.preference.length, 3);
  assert.equal((await call('DELETE', '/v1/kv/user:1')).status, 200);
  const gone = await call('GET', '/v1/kv/user:1');
  assert.equal(gone.status, 404);
  assert.equal(gone.body.deleted, true);
}));

test('input validation and error mapping', () => withServer(async call => {
  assert.equal((await call('PUT', '/v1/kv/bad%20key', { value: 1 })).status, 400);
  assert.equal((await call('PUT', '/v1/kv/k', { nope: 1 })).status, 400);
  assert.equal((await call('PUT', '/v1/kv/k', '{broken')).status, 400);
  assert.equal((await call('PUT', '/v1/kv/k', { value: 'x'.repeat(11_000) })).status, 413);
  assert.equal((await call('PUT', '/v1/kv/k', { value: 'x'.repeat(20_000) })).status, 413);
  assert.equal((await call('GET', '/v1/kv/k?r=abc')).status, 400);
  assert.equal((await call('GET', '/v1/kv/k?policy=x')).status, 400);
  assert.equal((await call('PUT', '/v1/config', { r: 9 })).status, 400);
  assert.equal((await call('POST', '/v1/nodes/missing/down')).status, 404);
}));

test('quorum failure returns 503 with ack counts', () => withServer(async call => {
  const { body: { preference } } = await call('GET', '/v1/partition/k');
  await call('POST', `/v1/nodes/${preference[1]}/down`);
  await call('POST', `/v1/nodes/${preference[2]}/down`);
  const failed = await call('PUT', '/v1/kv/k', { value: 1 });
  assert.equal(failed.status, 503);
  assert.equal(failed.body.acks, 1);
  assert.equal(failed.body.required, 2);
  assert.equal((await call('PUT', '/v1/kv/k?w=1', { value: 1 })).status, 200);
  assert.equal((await call('GET', '/v1/kv/k')).status, 503);
}));

test('conflict is visible over HTTP and resolved with context', () => withServer(async call => {
  const { body: { preference: [p0, p1, p2] } } = await call('GET', '/v1/partition/k');
  await call('PUT', '/v1/config', { r: 3, w: 1 });
  await call('POST', `/v1/nodes/${p1}/down`);
  await call('POST', `/v1/nodes/${p2}/down`);
  await call('PUT', '/v1/kv/k', { value: 'A' });
  await call('POST', `/v1/nodes/${p0}/down`);
  await call('POST', `/v1/nodes/${p1}/up`);
  await call('POST', `/v1/nodes/${p2}/up`);
  await call('PUT', '/v1/kv/k', { value: 'B' });
  await call('POST', `/v1/nodes/${p0}/up`);

  const conflict = await call('GET', '/v1/kv/k');
  assert.equal(conflict.body.conflict, true);
  assert.equal(conflict.body.siblings.length, 2);
  assert.equal((await call('GET', '/v1/kv/k?policy=lww')).body.resolvedBy, 'lww');
  assert.equal((await call('PUT', '/v1/kv/k', { value: 'C' })).status, 409);
  assert.equal((await call('PUT', `/v1/kv/k?w=3&coordinator=${p0}`, { value: 'C', context: conflict.body.context })).status, 200);
  assert.equal((await call('GET', '/v1/kv/k')).body.value, 'C');
}));
