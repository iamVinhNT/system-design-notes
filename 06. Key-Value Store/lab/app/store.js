const { createHash } = require('node:crypto');

const KEY_PATTERN = /^[A-Za-z0-9._:-]{1,256}$/;
const MAX_VALUE_BYTES = 10 * 1024;

class KvError extends Error {
  constructor(status, message, details = {}) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

function hashPosition(value) {
  return Number.parseInt(createHash('sha256').update(value).digest('hex').slice(0, 12), 16);
}

// Vector clock: { nodeId: positive integer counter }.
function compareClocks(a, b) {
  let aAhead = false;
  let bAhead = false;
  for (const id of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const x = a[id] ?? 0;
    const y = b[id] ?? 0;
    if (x > y) aAhead = true;
    if (y > x) bAhead = true;
  }
  if (aAhead && bAhead) return 'concurrent';
  if (aAhead) return 'after';
  if (bAhead) return 'before';
  return 'equal';
}

function mergeClocks(clocks) {
  const merged = {};
  for (const clock of clocks) {
    for (const [id, counter] of Object.entries(clock)) merged[id] = Math.max(merged[id] ?? 0, counter);
  }
  return merged;
}

function canonicalClock(clock) {
  return JSON.stringify(Object.entries(clock).sort(([x], [y]) => x.localeCompare(y)));
}

// Drop versions dominated by another version and duplicates; keep a stable order.
function pruneVersions(versions) {
  const unique = new Map(versions.map(version => [canonicalClock(version.clock), version]));
  return [...unique.values()]
    .filter(version => ![...unique.values()].some(other => compareClocks(version.clock, other.clock) === 'before'))
    .sort((a, b) => canonicalClock(a.clock).localeCompare(canonicalClock(b.clock)));
}

function sameVersionSet(a, b) {
  const keys = list => list.map(version => canonicalClock(version.clock)).sort().join('|');
  return keys(a) === keys(b);
}

function validateClock(context) {
  if (context === null || typeof context !== 'object' || Array.isArray(context)) {
    throw new KvError(400, 'context must be an object of node id to positive integer');
  }
  for (const [id, counter] of Object.entries(context)) {
    if (!Number.isInteger(counter) || counter < 1) {
      throw new KvError(400, `context counter for ${id} must be a positive integer`);
    }
  }
  return { ...context };
}

function publicVersion(version) {
  return { value: version.value, deleted: version.deleted, clock: version.clock, ts: version.ts };
}

class Cluster {
  constructor({ nodes = ['n1', 'n2', 'n3', 'n4', 'n5'], n = 3, r = 2, w = 2, now = Date.now } = {}) {
    if (!Array.isArray(nodes) || nodes.length === 0 || new Set(nodes).size !== nodes.length) {
      throw new RangeError('nodes must be a non-empty list of unique ids');
    }
    this.now = now;
    this.nodes = new Map(nodes.map(id => [id, { up: true, data: new Map() }]));
    this.ring = nodes
      .map(id => ({ id, position: hashPosition(`node:${id}`) }))
      .sort((a, b) => a.position - b.position || a.id.localeCompare(b.id));
    this.config = { n: 1, r: 1, w: 1 };
    this.setConfig({ n, r, w });
  }

  getConfig() {
    const { n, r, w } = this.config;
    return { n, r, w, quorumOverlap: r + w > n };
  }

  setConfig(update) {
    const next = { ...this.config, ...update };
    for (const field of ['n', 'r', 'w']) {
      if (!Number.isInteger(next[field]) || next[field] < 1) throw new KvError(400, `${field} must be a positive integer`);
    }
    if (next.n > this.nodes.size) throw new KvError(400, `n must not exceed node count ${this.nodes.size}`);
    if (next.r > next.n || next.w > next.n) throw new KvError(400, 'r and w must not exceed n');
    this.config = { n: next.n, r: next.r, w: next.w };
    return this.getConfig();
  }

  nodeStates() {
    return [...this.nodes].map(([id, node]) => ({ id, up: node.up })).sort((a, b) => a.id.localeCompare(b.id));
  }

  setNodeUp(id, up) {
    const node = this.nodes.get(id);
    if (!node) throw new KvError(404, `node ${id} not found`);
    node.up = up;
    return { id, up };
  }

  // Clockwise from the key position: owner first, then N-1 distinct successors.
  preferenceList(key) {
    const position = hashPosition(`key:${key}`);
    let start = this.ring.findIndex(entry => entry.position >= position);
    if (start === -1) start = 0;
    return Array.from({ length: this.config.n }, (_, i) => this.ring[(start + i) % this.ring.length].id);
  }

  put(key, value, options = {}) {
    return this.#write(key, { value, deleted: false }, options);
  }

  delete(key, options = {}) {
    return this.#write(key, { value: null, deleted: true }, options);
  }

  get(key, { r = this.config.r, policy = 'siblings', repair = true } = {}) {
    this.#validateKey(key);
    const required = this.#quorumSize(r, 'r');
    if (!['siblings', 'lww'].includes(policy)) throw new KvError(400, 'policy must be siblings or lww');

    const preference = this.preferenceList(key);
    const available = preference.filter(id => this.nodes.get(id).up);
    if (available.length < required) {
      throw new KvError(503, 'read quorum not met', { available: available.length, required });
    }

    // Simulates "first R replicas to answer": the first R live replicas in preference order.
    const responders = available.slice(0, required);
    const responses = responders.map(id => ({ id, versions: this.nodes.get(id).data.get(key) ?? [] }));
    const merged = pruneVersions(responses.flatMap(response => response.versions));
    const stale = merged.length === 0 ? [] : responses.filter(r => !sameVersionSet(r.versions, merged)).map(r => r.id);
    if (repair) stale.forEach(id => this.nodes.get(id).data.set(key, merged));

    const result = {
      key,
      found: merged.length > 0,
      deleted: false,
      conflict: merged.length > 1,
      context: mergeClocks(merged.map(version => version.clock)),
      quorum: { r: required, responders },
      stale,
      repaired: repair ? stale : [],
    };
    if (merged.length === 0) return result;
    if (merged.length === 1 || policy === 'lww') {
      const winner = this.#lastWriteWins(merged);
      Object.assign(result, { deleted: winner.deleted, value: winner.value });
      if (merged.length > 1) Object.assign(result, { resolvedBy: 'lww', discarded: merged.length - 1 });
    } else {
      result.siblings = merged.map(publicVersion);
    }
    return result;
  }

  // Per-replica local state, for demos and tests. No quorum, no repair.
  inspect(key) {
    this.#validateKey(key);
    return this.preferenceList(key).map(id => {
      const node = this.nodes.get(id);
      return { node: id, up: node.up, versions: (node.data.get(key) ?? []).map(publicVersion) };
    });
  }

  #write(key, payload, { context, coordinator, w = this.config.w } = {}) {
    this.#validateKey(key);
    const required = this.#quorumSize(w, 'w');
    const preference = this.preferenceList(key);
    const chosen = coordinator ?? preference.find(id => this.nodes.get(id).up);
    if (chosen !== undefined && !preference.includes(chosen)) {
      throw new KvError(400, `coordinator ${chosen} is not in the preference list`, { preference });
    }
    if (chosen === undefined || !this.nodes.get(chosen).up) {
      throw new KvError(503, 'no live coordinator', { acks: 0, required, preference });
    }

    const local = this.nodes.get(chosen).data.get(key) ?? [];
    let base;
    if (context !== undefined) {
      base = validateClock(context);
    } else if (local.length > 1) {
      // A blind write would silently drop the sibling versions; the client must resolve them.
      throw new KvError(409, 'key has conflicting versions; read them and write with the returned context', {
        siblings: local.map(publicVersion),
        context: mergeClocks(local.map(version => version.clock)),
      });
    } else {
      base = local[0]?.clock ?? {};
    }
    const seenByCoordinator = mergeClocks(local.map(version => version.clock))[chosen] ?? 0;
    const clock = { ...base, [chosen]: Math.max(base[chosen] ?? 0, seenByCoordinator) + 1 };
    const version = { ...payload, clock, ts: this.now() };

    // The write is sent to every live replica. Replicas that accepted it keep it even when
    // the quorum is missed: there is no rollback, so a failed write may still become visible.
    const written = preference.filter(id => this.nodes.get(id).up);
    for (const id of written) {
      const data = this.nodes.get(id).data;
      data.set(key, pruneVersions([...(data.get(key) ?? []), version]));
    }
    if (written.length < required) {
      throw new KvError(503, 'write quorum not met; accepted replicas keep the write (no rollback)', {
        acks: written.length,
        required,
        written,
        context: clock,
      });
    }
    return { key, coordinator: chosen, context: clock, acks: written.length, required, written, deleted: payload.deleted };
  }

  #lastWriteWins(versions) {
    return [...versions].sort((a, b) => b.ts - a.ts || canonicalClock(b.clock).localeCompare(canonicalClock(a.clock)))[0];
  }

  #quorumSize(value, name) {
    if (!Number.isInteger(value) || value < 1 || value > this.config.n) {
      throw new KvError(400, `${name} must be an integer from 1 to ${this.config.n}`);
    }
    return value;
  }

  #validateKey(key) {
    if (typeof key !== 'string' || !KEY_PATTERN.test(key)) {
      throw new KvError(400, 'key must match [A-Za-z0-9._:-] and be 1-256 characters');
    }
  }
}

module.exports = { Cluster, KvError, compareClocks, MAX_VALUE_BYTES };
