-- Additive production migration for secure, expiring team invitations.
-- Safe to re-run.
BEGIN;

CREATE TABLE IF NOT EXISTS team_invitations (
  id serial PRIMARY KEY,
  club_id integer NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  team_id integer NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  person_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  invited_by_user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  accepted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT team_invitations_token_hash_unique UNIQUE (token_hash)
);

CREATE INDEX IF NOT EXISTS team_invitations_person_idx
  ON team_invitations (person_id);

COMMIT;