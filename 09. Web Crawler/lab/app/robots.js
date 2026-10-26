// Minimal robots.txt: picks the group for our agent token (else `*`), supports Disallow with
// `*` and `$`, and Crawl-delay. `Allow` lines are ignored, which can only make the crawler
// stricter than the file asks for.
function ruleToRegExp(rule) {
  const escaped = rule.replace(/[.+?^{}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(`^${escaped.endsWith('$') ? `${escaped.slice(0, -1)}$` : escaped}`);
}

function parseRobots(text, agentToken) {
  const groups = [];
  let current = null;
  let sawRule = false;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*/, '').trim();
    const separator = line.indexOf(':');
    if (separator === -1) continue;
    const field = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();
    if (field === 'user-agent') {
      if (current === null || sawRule) {
        current = { agents: [], disallow: [], crawlDelayMs: null };
        groups.push(current);
        sawRule = false;
      }
      current.agents.push(value.toLowerCase());
    } else if (current !== null && field === 'disallow') {
      sawRule = true;
      if (value !== '') current.disallow.push(ruleToRegExp(value));
    } else if (current !== null && field === 'crawl-delay') {
      sawRule = true;
      const seconds = Number(value);
      if (Number.isFinite(seconds) && seconds >= 0) current.crawlDelayMs = seconds * 1000;
    }
  }
  const token = agentToken.toLowerCase();
  const group = groups.find(g => g.agents.includes(token)) ?? groups.find(g => g.agents.includes('*'));
  return {
    crawlDelayMs: group?.crawlDelayMs ?? null,
    isAllowed: pathAndQuery => !(group?.disallow ?? []).some(pattern => pattern.test(pathAndQuery)),
  };
}

const ALLOW_ALL = { crawlDelayMs: null, isAllowed: () => true };
const DISALLOW_ALL = { crawlDelayMs: null, isAllowed: () => false };

module.exports = { ALLOW_ALL, DISALLOW_ALL, parseRobots };
