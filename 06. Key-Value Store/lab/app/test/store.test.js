const test = require('node:test');
const assert = require('node:assert/strict');
const { Cluster, KvError } = require('../store');

function makeCluster(options = {}) {
  let tick = 0;
  return new Cluster({ now: () => ++tick, ...options });
}

function rejects(fn, status) {
  assert.throws(fn, error => error instanceof KvError && error.status === status);
}

test('preference list is deterministic, distinct, and sized N', () => {
  const a = makeCluster();
  const b = makeCluster();
  const list = a.preferenceList('user:1');
  assert.deepEqual(list, b.preferenceList('user:1'));
  assert.equal(list.length, 3);
  assert.equal(new Set(list).size, 3);
});

test('put, get, and delete round-trip with a tombstone', () => {
  const cluster = makeCluster();
  cluster.put('k', { name: 'a' });
  assert.deepEqual(cluster.get('k').value, { name: 'a' });
  cluster.put('k', { name: 'b' });
  assert.deepEqual(cluster.get('k').value, { name: 'b' });
  cluster.delete('k');
  const gone = cluster.get('k');
  assert.equal(gone.found, true);
  assert.equal(gone.deleted, true);
  assert.equal(makeCluster().get('missing').found, false);
});

test('write below W reports failure but accepted replicas keep the write', () => {
  const cluster = makeCluster({ n: 3, r: 2, w: 2 });
  const [first, second, third] = cluster.preferenceList('k');
  cluster.setNodeUp(second, false);
  cluster.setNodeUp(third, false);
  assert.throws(() => cluster.put('k', 'v'), error => {
    return error.status === 503 && error.details.acks === 1 && error.details.required === 2;
  });
  assert.equal(cluster.inspect('k').find(r => r.node === first).versions.length, 1);
  assert.equal(cluster.put('k', 'v2', { w: 1 }).acks, 1);
});

test('read below R fails instead of answering from fewer replicas', () => {
  const cluster = makeCluster({ n: 3, r: 3, w: 3 });
  cluster.setNodeUp(cluster.preferenceList('k')[2], false);
  rejects(() => cluster.get('k'), 503);
  rejects(() => cluster.put('k', 'v'), 503);
});

test('R + W <= N can return a stale read; R + W > N sees the write and repairs', () => {
  const cluster = makeCluster({ n: 3, r: 1, w: 2 });
  const [first] = cluster.preferenceList('k');
  cluster.setNodeUp(first, false);
  assert.equal(cluster.put('k', 'fresh').acks, 2);
  cluster.setNodeUp(first, true);

  const stale = cluster.get('k', { r: 1, repair: false });
  assert.equal(stale.found, false);

  const quorum = cluster.get('k', { r: 2 });
  assert.equal(quorum.value, 'fresh');
  assert.deepEqual(quorum.repaired, [first]);
  assert.equal(cluster.get('k', { r: 1 }).value, 'fresh');
});

test('tombstone dominates a stale value on a recovered replica', () => {
  const cluster = makeCluster({ n: 3, r: 3, w: 2 });
  cluster.put('k', 'v');
  const last = cluster.preferenceList('k')[2];
  cluster.setNodeUp(last, false);
  cluster.delete('k');
  cluster.setNodeUp(last, true);
  const result = cluster.get('k');
  assert.equal(result.deleted, true);
  assert.deepEqual(result.stale, [last]);
});

function createConflict(cluster) {
  const [p0, p1, p2] = cluster.preferenceList('k');
  cluster.setNodeUp(p1, false);
  cluster.setNodeUp(p2, false);
  cluster.put('k', 'A', { w: 1 });
  cluster.setNodeUp(p0, false);
  cluster.setNodeUp(p1, true);
  cluster.setNodeUp(p2, true);
  cluster.put('k', 'B', { w: 1 });
  cluster.setNodeUp(p0, true);
}

test('concurrent writes are kept as siblings, never silently overwritten', () => {
  const cluster = makeCluster({ n: 3, r: 3, w: 1 });
  createConflict(cluster);
  const result = cluster.get('k');
  assert.equal(result.conflict, true);
  assert.deepEqual(result.siblings.map(s => s.value).sort(), ['A', 'B']);
});

test('last-write-wins policy resolves a conflict on read only', () => {
  const cluster = makeCluster({ n: 3, r: 3, w: 1 });
  createConflict(cluster);
  const lww = cluster.get('k', { policy: 'lww' });
  assert.equal(lww.value, 'B');
  assert.equal(lww.resolvedBy, 'lww');
  assert.equal(lww.discarded, 1);
  assert.equal(cluster.get('k').conflict, true);
});

test('blind write on siblings is rejected; write with context resolves them', () => {
  const cluster = makeCluster({ n: 3, r: 3, w: 1 });
  createConflict(cluster);
  const { context } = cluster.get('k');
  const coordinator = cluster.preferenceList('k')[0];
  rejects(() => cluster.put('k', 'C', { coordinator }), 409);
  cluster.put('k', 'C', { coordinator, context, w: 3 });
  const result = cluster.get('k');
  assert.equal(result.conflict, false);
  assert.equal(result.value, 'C');
});

test('write with stale context from another coordinator creates a sibling', () => {
  const cluster = makeCluster({ n: 3, r: 3, w: 3 });
  const [p0, p1] = cluster.preferenceList('k');
  cluster.put('k', 'v1', { coordinator: p0 });
  const { context } = cluster.get('k');
  cluster.put('k', 'v2', { coordinator: p0, context });
  cluster.put('k', 'v3', { coordinator: p1, context });
  assert.equal(cluster.get('k').conflict, true);
});

test('config and request parameters are validated', () => {
  const cluster = makeCluster();
  rejects(() => cluster.setConfig({ n: 6 }), 400);
  rejects(() => cluster.setConfig({ r: 4 }), 400);
  assert.equal(cluster.setConfig({ n: 3, r: 2, w: 2 }).quorumOverlap, true);
  assert.equal(cluster.setConfig({ r: 1, w: 1 }).quorumOverlap, false);
  rejects(() => cluster.get('bad key'), 400);
  rejects(() => cluster.get('k', { r: 9 }), 400);
  rejects(() => cluster.get('k', { policy: 'x' }), 400);
  rejects(() => cluster.put('k', 'v', { coordinator: 'nope' }), 400);
  rejects(() => cluster.put('k', 'v', { context: { n1: 0 } }), 400);
  rejects(() => cluster.setNodeUp('missing', false), 404);
});
