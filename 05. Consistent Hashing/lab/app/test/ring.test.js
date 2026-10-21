const test = require('node:test');
const assert = require('node:assert/strict');
const { ConsistentHashRing, compareRemapping } = require('../ring');

test('lookup is deterministic and empty ring has no owner', () => {
  const ring = new ConsistentHashRing({ replicas: 50 });
  assert.equal(ring.getNode('key-a'), null);
  ring.addNode('a');
  ring.addNode('b');
  const expected = ring.getNode('key-a');
  for (let i = 0; i < 10; i++) assert.equal(ring.getNode('key-a'), expected);
});

test('adding and removing node changes a subset of owners', () => {
  const ring = new ConsistentHashRing({ replicas: 100 });
  ring.addNode('a');
  ring.addNode('b');
  ring.addNode('c');
  const before = new Map(Array.from({ length: 10_000 }, (_, i) => [`key-${i}`, ring.getNode(`key-${i}`)]));
  ring.addNode('d');
  const changed = [...before].filter(([key, node]) => ring.getNode(key) !== node).length;
  assert.ok(changed > 1_000 && changed < 5_000, `unexpected remap count: ${changed}`);
  ring.removeNode('d');
  assert.equal([...before].filter(([key, node]) => ring.getNode(key) !== node).length, 0);
});

test('replicas are distinct physical nodes and bounded by node count', () => {
  const ring = new ConsistentHashRing({ replicas: 20 });
  for (const node of ['a', 'b', 'c']) ring.addNode(node);
  assert.deepEqual(new Set(ring.getNodes('key', 10)).size, 3);
  assert.equal(ring.getNodes('key', 10).length, 3);
  assert.equal(ring.getNodes('key', 0).length, 0);
});

test('removing unknown node is harmless and duplicate add is rejected', () => {
  const ring = new ConsistentHashRing({ replicas: 10 });
  assert.equal(ring.removeNode('missing'), false);
  ring.addNode('a');
  assert.throws(() => ring.addNode('a'), /already exists/);
});

test('hash collisions resolve deterministically', () => {
  const ring = new ConsistentHashRing({ replicas: 2, hash: () => 'same' });
  ring.addNode('b');
  ring.addNode('a');
  assert.equal(ring.getNode('any'), 'a');
});

test('consistent hashing remaps fewer keys than modulo when adding node', () => {
  const result = compareRemapping(['a', 'b', 'c'], ['a', 'b', 'c', 'd'], 20_000);
  assert.ok(result.consistent.changed < result.modulo.changed / 2);
});
