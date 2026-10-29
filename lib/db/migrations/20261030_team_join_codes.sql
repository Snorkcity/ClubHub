BEGIN;
CREATE TABLE IF NOT EXISTS team_join_codes (
  team_id integer PRIMARY KEY REFERENCES teams(id) ON DELETE CASCADE,
  code text UNIQUE,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS team_join_requests (
  id serial PRIMARY KEY,
  team_id integer NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  child_name text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  reviewed_by integer REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT team_join_requests_team_user_unique UNIQUE (team_id, user_id)
);
COMMIT;
