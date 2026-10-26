CREATE TABLE posts (
  id         bigserial PRIMARY KEY,
  author     text        NOT NULL,
  title      text        NOT NULL,
  body       text        NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE comments (
  id         bigserial PRIMARY KEY,
  post_id    bigint      NOT NULL REFERENCES posts (id),
  author     text        NOT NULL,
  body       text        NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX posts_created_idx ON posts (created_at DESC, id DESC);
CREATE INDEX comments_post_idx ON comments (post_id);
