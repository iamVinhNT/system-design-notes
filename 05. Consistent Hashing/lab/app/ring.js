const { createHash } = require('node:crypto');

function defaultHash(value) {
  return createHash('sha256').update(value).digest('hex');
}

class ConsistentHashRing {
  constructor({ replicas = 100, hash = defaultHash } = {}) {
    if (!Number.isInteger(replicas) || replicas < 1) throw new RangeError('replicas must be a positive integer');
    this.replicas = replicas;
    this.hash = hash;
    this.nodes = new Set();
    this.ring = [];
  }

  addNode(node) {
    if (typeof node !== 'string' || node.length === 0) throw new TypeError('node must be a non-empty string');
    if (this.nodes.has(node)) throw new Error(`node ${node} already exists`);
    this.nodes.add(node);
    for (let i = 0; i < this.replicas; i++) {
      const vnode = `${node}#${i}`;
      this.ring.push({ position: this.hash(`vnode:${vnode}`), vnode, node });
    }
    this.ring.sort((a, b) => a.position.localeCompare(b.position) || a.vnode.localeCompare(b.vnode));
  }

  removeNode(node) {
    if (!this.nodes.delete(node)) return false;
    this.ring = this.ring.filter(entry => entry.node !== node);
    return true;
  }

  getNode(key) {
    const entry = this.#startEntry(key);
    return entry?.node ?? null;
  }

  getNodes(key, count = 1) {
    if (!Number.isInteger(count) || count < 0) throw new RangeError('count must be a non-negative integer');
    if (count === 0 || this.ring.length === 0) return [];

    const result = [];
    const seen = new Set();
    const start = this.#startIndex(key);
    for (let offset = 0; offset < this.ring.length && result.length < count; offset++) {
      const node = this.ring[(start + offset) % this.ring.length].node;
      if (!seen.has(node)) {
        seen.add(node);
        result.push(node);
      }
    }
    return result;
  }

  getNodeNames() {
    return [...this.nodes].sort();
  }

  getDistribution(keys) {
    const counts = Object.fromEntries(this.getNodeNames().map(node => [node, 0]));
    for (const key of keys) {
      const node = this.getNode(key);
      if (node !== null) counts[node]++;
    }
    const values = Object.values(counts);
    return {
      keyCount: keys.length,
      counts,
      min: values.length ? Math.min(...values) : 0,
      max: values.length ? Math.max(...values) : 0,
    };
  }

  #startEntry(key) {
    return this.ring[this.#startIndex(key)] ?? null;
  }

  #startIndex(key) {
    if (this.ring.length === 0) return 0;
    const position = this.hash(`key:${key}`);
    let low = 0;
    let high = this.ring.length;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if (this.ring[middle].position < position) low = middle + 1;
      else high = middle;
    }
    return low === this.ring.length ? 0 : low;
  }
}

function moduloOwner(key, nodes) {
  if (nodes.length === 0) return null;
  const digest = defaultHash(`key:${key}`);
  const hashNumber = Number.parseInt(digest.slice(0, 12), 16);
  return nodes[hashNumber % nodes.length];
}

function compareRemapping(beforeNodes, afterNodes, keyCount, replicas = 100) {
  const before = [...beforeNodes].sort();
  const after = [...afterNodes].sort();
  const beforeRing = new ConsistentHashRing({ replicas });
  const afterRing = new ConsistentHashRing({ replicas });
  before.forEach(node => beforeRing.addNode(node));
  after.forEach(node => afterRing.addNode(node));
  let consistentChanged = 0;
  let moduloChanged = 0;

  for (let i = 0; i < keyCount; i++) {
    const key = `sample-${i}`;
    if (beforeRing.getNode(key) !== afterRing.getNode(key)) consistentChanged++;
    if (moduloOwner(key, before) !== moduloOwner(key, after)) moduloChanged++;
  }

  return {
    keyCount,
    consistent: { changed: consistentChanged, fraction: keyCount ? consistentChanged / keyCount : 0 },
    modulo: { changed: moduloChanged, fraction: keyCount ? moduloChanged / keyCount : 0 },
  };
}

module.exports = { ConsistentHashRing, compareRemapping };
