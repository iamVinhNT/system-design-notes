// URL frontier: a dedup set plus one FIFO queue per host. FIFO per host gives breadth-first order.
// A host is handed out only when it is idle and its delay has elapsed, so at most one request
// per host is in flight and consecutive requests to a host are at least `delayMs` apart
// (measured from the previous request finishing).
class Frontier {
  constructor({ delayMs }) {
    this.defaultDelayMs = delayMs;
    this.hosts = new Map();
    this.seen = new Set();
  }

  // False when the URL was already accepted (queued, fetching or finished).
  add(item) {
    if (this.seen.has(item.url)) return false;
    this.seen.add(item.url);
    this.#host(new URL(item.url).host).queue.push(item);
    return true;
  }

  requeue(item) {
    this.#host(new URL(item.url).host).queue.unshift(item);
  }

  setDelay(host, delayMs) {
    this.#host(host).delayMs = delayMs;
  }

  delayFor(host) {
    return this.#host(host).delayMs ?? this.defaultDelayMs;
  }

  // Next ready item, preferring the host that has waited longest; marks its host busy.
  next(now) {
    let best = null;
    for (const state of this.hosts.values()) {
      if (state.busy || state.queue.length === 0 || state.nextAt > now) continue;
      if (best === null || state.nextAt < best.nextAt) best = state;
    }
    if (best === null) return null;
    best.busy = true;
    return best.queue.shift();
  }

  complete(host, finishedAt, extraDelayMs = 0) {
    const state = this.#host(host);
    state.busy = false;
    state.nextAt = finishedAt + Math.max(this.delayFor(host), extraDelayMs);
  }

  // Milliseconds until some idle host with queued URLs may be used; null if there is none.
  nextReadyIn(now) {
    let wait = null;
    for (const state of this.hosts.values()) {
      if (state.busy || state.queue.length === 0) continue;
      const remaining = Math.max(0, state.nextAt - now);
      if (wait === null || remaining < wait) wait = remaining;
    }
    return wait;
  }

  #host(host) {
    if (!this.hosts.has(host)) this.hosts.set(host, { queue: [], nextAt: 0, busy: false, delayMs: null });
    return this.hosts.get(host);
  }
}

module.exports = { Frontier };
