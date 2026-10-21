const express = require('express');
const { Cluster, KvError, MAX_VALUE_BYTES } = require('./store');

function intParam(value, name) {
  if (value === undefined) return undefined;
  const number = Number(value);
  if (!Number.isInteger(number)) throw new KvError(400, `${name} must be an integer`);
  return number;
}

function readOptions(query) {
  if (query.repair !== undefined && !['true', 'false'].includes(query.repair)) {
    throw new KvError(400, 'repair must be true or false');
  }
  return {
    r: intParam(query.r, 'r'),
    policy: query.policy,
    repair: query.repair === undefined ? undefined : query.repair === 'true',
  };
}

function writeOptions(query, context) {
  if (query.coordinator !== undefined && typeof query.coordinator !== 'string') {
    throw new KvError(400, 'coordinator must be a node id');
  }
  return { w: intParam(query.w, 'w'), coordinator: query.coordinator, context };
}

function createApp(cluster = new Cluster()) {
  const app = express();
  app.use(express.json({ limit: '16kb' }));

  app.put('/v1/kv/:key', (req, res) => {
    const body = req.body;
    if (body === null || typeof body !== 'object' || !('value' in body)) {
      throw new KvError(400, 'body must be a JSON object with a value field');
    }
    if (Buffer.byteLength(JSON.stringify(body.value)) > MAX_VALUE_BYTES) {
      throw new KvError(413, `value must be at most ${MAX_VALUE_BYTES} bytes`);
    }
    res.json(cluster.put(req.params.key, body.value, writeOptions(req.query, body.context)));
  });

  app.get('/v1/kv/:key', (req, res) => {
    const result = cluster.get(req.params.key, readOptions(req.query));
    if (!result.found) return res.status(404).json({ error: 'key not found', ...result });
    if (result.deleted) return res.status(404).json({ error: 'key deleted', ...result });
    res.json(result);
  });

  app.delete('/v1/kv/:key', (req, res) => {
    res.json(cluster.delete(req.params.key, writeOptions(req.query, req.body?.context)));
  });

  app.get('/v1/partition/:key', (req, res) => {
    res.json({ key: req.params.key, preference: cluster.preferenceList(req.params.key) });
  });

  app.get('/v1/debug/replicas/:key', (req, res) => {
    res.json({ key: req.params.key, replicas: cluster.inspect(req.params.key) });
  });

  app.get('/v1/config', (_req, res) => res.json(cluster.getConfig()));

  app.put('/v1/config', (req, res) => {
    const { n, r, w } = req.body ?? {};
    res.json(cluster.setConfig(Object.fromEntries(Object.entries({ n, r, w }).filter(([, v]) => v !== undefined))));
  });

  app.get('/v1/nodes', (_req, res) => res.json({ nodes: cluster.nodeStates() }));
  app.post('/v1/nodes/:id/down', (req, res) => res.json(cluster.setNodeUp(req.params.id, false)));
  app.post('/v1/nodes/:id/up', (req, res) => res.json(cluster.setNodeUp(req.params.id, true)));

  app.use((error, _req, res, _next) => {
    if (error instanceof KvError) return res.status(error.status).json({ error: error.message, ...error.details });
    if (error.type === 'entity.too.large') return res.status(413).json({ error: 'request body too large' });
    if (error.type === 'entity.parse.failed') return res.status(400).json({ error: 'invalid JSON body' });
    process.stderr.write(`${error.stack}\n`);
    res.status(500).json({ error: 'internal error' });
  });

  return app;
}

if (require.main === module) {
  createApp().listen(3000, () => process.stdout.write('Listening on http://localhost:3000\n'));
}

module.exports = { createApp };
