const express = require('express');
const { ConsistentHashRing, compareRemapping } = require('./ring');

const app = express();
app.use(express.json());
const ring = new ConsistentHashRing({ replicas: 100 });
['cache-a', 'cache-b', 'cache-c'].forEach(node => ring.addNode(node));

function validKey(req, res) {
  const key = req.query.key;
  if (typeof key !== 'string' || key.length === 0) {
    res.status(400).json({ error: 'query parameter key is required' });
    return null;
  }
  return key;
}

app.get('/api/owner', (req, res) => {
  const key = validKey(req, res);
  if (key === null) return;
  const node = ring.getNode(key);
  if (node === null) return res.status(503).json({ error: 'ring has no nodes' });
  res.json({ key, node });
});

app.get('/api/replicas', (req, res) => {
  const key = validKey(req, res);
  if (key === null) return;
  const count = req.query.count === undefined ? 3 : Number(req.query.count);
  if (!Number.isInteger(count) || count < 1 || count > 100) {
    return res.status(400).json({ error: 'count must be an integer from 1 to 100' });
  }
  res.json({ key, nodes: ring.getNodes(key, count) });
});

app.get('/api/nodes', (_req, res) => res.json({ nodes: ring.getNodeNames() }));

app.post('/api/nodes', (req, res) => {
  const { name } = req.body ?? {};
  if (typeof name !== 'string' || name.length === 0 || name.length > 128) {
    return res.status(400).json({ error: 'name must be a non-empty string up to 128 characters' });
  }
  try {
    ring.addNode(name);
    res.status(201).json({ nodes: ring.getNodeNames() });
  } catch (error) {
    res.status(409).json({ error: error.message });
  }
});

app.delete('/api/nodes/:name', (req, res) => {
  if (!ring.removeNode(req.params.name)) return res.status(404).json({ error: 'node not found' });
  res.json({ nodes: ring.getNodeNames() });
});

app.get('/api/stats', (req, res) => {
  const keyCount = req.query.keys === undefined ? 10_000 : Number(req.query.keys);
  if (!Number.isInteger(keyCount) || keyCount < 1 || keyCount > 1_000_000) {
    return res.status(400).json({ error: 'keys must be an integer from 1 to 1000000' });
  }
  const keys = Array.from({ length: keyCount }, (_, i) => `sample-${i}`);
  const distribution = ring.getDistribution(keys);
  const current = ring.getNodeNames();
  const next = [...current, 'sample-added-node'];
  res.json({
    virtualNodesPerNode: ring.replicas,
    distribution,
    remapping: compareRemapping(current, next, keyCount, ring.replicas),
  });
});

if (require.main === module) {
  app.listen(3000, () => process.stdout.write('Listening on http://localhost:3000\n'));
}

module.exports = app;
