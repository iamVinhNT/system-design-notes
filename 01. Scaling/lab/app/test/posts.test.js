const test = require('node:test');
const assert = require('node:assert/strict');
const { PostRepository } = require('../posts');
const { Metrics } = require('../metrics');
const { FakePool } = require('./helpers');

const row = { id: 1, author: 'alice', title: 't', body: 'b' };

function make({ withReplica = true } = {}) {
  let clock = 1000;
  const primary = new FakePool(() => [row]);
  const replica = withReplica ? new FakePool(() => [row]) : null;
  const metrics = new Metrics();
  const repo = new PostRepository({ primary, replica, metrics, now: () => clock });
  return { repo, primary, replica, metrics, advance: (ms) => { clock += ms; } };
}

test('reads use the replica when one is configured', async () => {
  const { repo, primary, replica } = make();
  assert.equal((await repo.getById('1')).source, 'replica');
  assert.equal(replica.queries.length, 1);
  assert.equal(primary.queries.length, 0);
});

test('consistent reads go to the primary', async () => {
  const { repo, replica } = make();
  assert.equal((await repo.getById('1', { consistent: true })).source, 'primary');
  assert.equal(replica.queries.length, 0);
});

test('without a replica reads use the primary', async () => {
  const { repo } = make({ withReplica: false });
  assert.equal((await repo.listLatest()).source, 'primary');
});

test('a failing replica falls back to the primary and is skipped until the retry window passes', async () => {
  const { repo, replica, primary, metrics, advance } = make();
  replica.down = true;

  assert.equal((await repo.getById('1')).source, 'primary');
  assert.equal((await repo.getById('1')).source, 'primary');
  assert.equal(replica.queries.length, 1, 'replica not retried inside the window');
  assert.equal(metrics.snapshot().counters.replica_fallback, 1);

  replica.down = false;
  advance(5000);
  assert.equal((await repo.getById('1')).source, 'replica');
  assert.equal(primary.queries.length, 2);
});

test('writes always go to the primary', async () => {
  const { repo, primary, replica } = make();
  await repo.create({ author: 'alice', title: 't', body: 'b' });
  assert.ok(primary.queries.some(({ sql }) => sql.startsWith('INSERT')));
  assert.equal(replica.queries.length, 0);
});

test('update distinguishes missing posts from posts owned by someone else', async () => {
  const missing = new PostRepository({ primary: new FakePool(() => []) });
  assert.equal(await missing.update('1', { author: 'bob', title: 't', body: 'b' }), null);

  const owned = new PostRepository({ primary: new FakePool((sql) => (sql.startsWith('SELECT author') ? [{ author: 'alice' }] : [row])) });
  assert.equal(await owned.update('1', { author: 'bob', title: 't', body: 'b' }), 'forbidden');
});
