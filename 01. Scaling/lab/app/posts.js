const POST_COLUMNS = `p.id::int AS id, p.author, p.title, p.body, p.created_at AS "createdAt",
  (SELECT count(*)::int FROM comments c WHERE c.post_id = p.id) AS "commentCount"`;

const LIST_SQL = `SELECT ${POST_COLUMNS} FROM posts p ORDER BY p.created_at DESC, p.id DESC LIMIT 20`;
const GET_SQL = `SELECT ${POST_COLUMNS} FROM posts p WHERE p.id = $1`;

const REPLICA_RETRY_MS = 5000;

class PostRepository {
  constructor({ primary, replica = null, metrics, now = () => Date.now() }) {
    this.primary = primary;
    this.replica = replica;
    this.metrics = metrics;
    this.now = now;
    this.replicaRetryAt = 0;
  }

  // Reads go to the replica unless the caller needs read-your-writes. A failing replica is skipped
  // for a few seconds so every request does not pay the connection timeout again.
  async read(sql, params, { consistent = false } = {}) {
    if (this.replica && !consistent && this.now() >= this.replicaRetryAt) {
      try {
        const { rows } = await this.replica.query(sql, params);
        this.metrics?.count('db_replica_reads');
        return { rows, source: 'replica' };
      } catch {
        this.replicaRetryAt = this.now() + REPLICA_RETRY_MS;
        this.metrics?.count('replica_fallback');
      }
    }
    const { rows } = await this.primary.query(sql, params);
    this.metrics?.count('db_primary_reads');
    return { rows, source: 'primary' };
  }

  async listLatest(options) {
    const { rows, source } = await this.read(LIST_SQL, [], options);
    return { value: rows, source };
  }

  async getById(id, options) {
    const { rows, source } = await this.read(GET_SQL, [id], options);
    return { value: rows[0] ?? null, source };
  }

  async create({ author, title, body }) {
    const { rows } = await this.primary.query(
      `INSERT INTO posts (author, title, body) VALUES ($1, $2, $3) RETURNING id`,
      [author, title, body],
    );
    this.metrics?.count('db_writes');
    const { rows: created } = await this.primary.query(GET_SQL, [rows[0].id]);
    return created[0];
  }

  // Returns null when the post does not exist and 'forbidden' when someone else owns it.
  async update(id, { author, title, body }) {
    const { rows: owner } = await this.primary.query('SELECT author FROM posts WHERE id = $1', [id]);
    if (owner.length === 0) return null;
    if (owner[0].author !== author) return 'forbidden';
    await this.primary.query('UPDATE posts SET title = $2, body = $3 WHERE id = $1', [id, title, body]);
    this.metrics?.count('db_writes');
    const { rows } = await this.primary.query(GET_SQL, [id]);
    return rows[0];
  }
}

module.exports = { PostRepository };
