-- Parent invitations do not create a player/staff membership.
ALTER TABLE team_invitations ADD COLUMN IF NOT EXISTS guardian_player_id integer
  REFERENCES users(id) ON DELETE CASCADE;
