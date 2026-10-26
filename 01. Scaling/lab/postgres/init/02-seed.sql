-- 5,000 posts and 150,000 comments: the feed query counts comments per post, so reads cost real DB work.
INSERT INTO posts (author, title, body, created_at)
SELECT 'user' || (g % 200), 'Post ' || g, repeat('lorem ipsum dolor sit amet ', 20), now() - (5000 - g) * interval '1 minute'
FROM generate_series(1, 5000) g;

INSERT INTO comments (post_id, author, body)
SELECT 1 + (random() * 4999)::int, 'user' || (g % 300), 'comment ' || g
FROM generate_series(1, 150000) g;

ANALYZE;
