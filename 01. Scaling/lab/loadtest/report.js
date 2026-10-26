// Prints the latest result per (stage, workload) from results.jsonl so stages can be compared side by side.
const fs = require('node:fs');

const file = process.argv[2] ?? 'results.jsonl';
if (!fs.existsSync(file)) {
  process.stderr.write(`no results yet: run ./lab.sh load <read|write|mixed> first (${file} not found)\n`);
  process.exit(1);
}

const latest = new Map();
for (const line of fs.readFileSync(file, 'utf8').split('\n').filter(Boolean)) {
  const row = JSON.parse(line);
  latest.set(`${row.workload}:${row.stage}`, row);
}

const rows = [...latest.values()].sort((a, b) => a.workload.localeCompare(b.workload) || Number(a.stage) - Number(b.stage));
const columns = [
  ['workload', (r) => r.workload],
  ['stage', (r) => r.stage],
  ['conns', (r) => r.connections],
  ['rps', (r) => r.rps],
  ['p50 ms', (r) => r.p50],
  ['p95 ms', (r) => r.p95],
  ['p99 ms', (r) => r.p99],
  ['write p95', (r) => r.writeP95],
  ['errors', (r) => `${(r.errorRate * 100).toFixed(1)}%`],
  ['instances', (r) => Object.keys(r.instances).filter((k) => k !== '-').length],
  ['app hit%', (r) => hitRatio(r.appCache)],
  ['edge hit%', (r) => hitRatio(r.edgeCache)],
];

function hitRatio(tallies) {
  const lookups = Object.entries(tallies).filter(([k]) => ['HIT', 'MISS', 'EXPIRED', 'STALE', 'UPDATING', 'ERROR', 'REVALIDATED'].includes(k));
  const total = lookups.reduce((sum, [, n]) => sum + n, 0);
  return total === 0 ? '-' : `${Math.round(((tallies.HIT ?? 0) / total) * 100)}%`;
}

const table = [columns.map(([name]) => name), ...rows.map((row) => columns.map(([, get]) => String(get(row) ?? '-')))];
const widths = table[0].map((_, i) => Math.max(...table.map((row) => row[i].length)));
for (const row of table) process.stdout.write(`${row.map((cell, i) => cell.padEnd(widths[i])).join('  ')}\n`);
