BEGIN;
CREATE TABLE IF NOT EXISTS post_reactions (
  post_id integer NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  emoji text NOT NULL,
  PRIMARY KEY (post_id, user_id)
);
COMMIT;
