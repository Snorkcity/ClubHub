BEGIN;
CREATE TABLE IF NOT EXISTS platform_owners (
  email text PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);
CREATE TABLE IF NOT EXISTS club_setup_invitations (
  id serial PRIMARY KEY,
  email text NOT NULL,
  token_hash text NOT NULL UNIQUE,
  invited_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  used_at timestamptz,
  used_by integer REFERENCES users(id),
  club_id integer REFERENCES clubs(id)
);
COMMIT;
