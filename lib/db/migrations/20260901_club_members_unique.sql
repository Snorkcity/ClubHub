-- Add the intended club/member uniqueness protection without deleting rows.
-- Safe to re-run. Fails closed if duplicate pairs exist.
BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM club_members
    GROUP BY club_id, user_id
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION
      'Cannot add club_members uniqueness protection: duplicate (club_id, user_id) pairs exist';
  END IF;
END
$$;

-- Drizzle 0.31 does not reliably reconcile manually-added UNIQUE constraints
-- on Railway's PostgreSQL version. Use the equivalent unique index so future
-- schema pushes recognize the protection instead of offering a truncation.
ALTER TABLE club_members
  DROP CONSTRAINT IF EXISTS club_members_club_id_user_id_unique;

CREATE UNIQUE INDEX IF NOT EXISTS club_members_club_id_user_id_unique
  ON club_members (club_id, user_id);

COMMIT;