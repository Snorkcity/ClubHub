ALTER TABLE player_learning_preferences
  ADD COLUMN IF NOT EXISTS subject_role text NOT NULL DEFAULT 'player';

CREATE UNIQUE INDEX IF NOT EXISTS player_learning_preferences_user_role_unique
  ON player_learning_preferences (user_id, subject_role);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'player_learning_preferences_subject_role'
      AND conrelid = 'player_learning_preferences'::regclass
  ) THEN
    ALTER TABLE player_learning_preferences
      ADD CONSTRAINT player_learning_preferences_subject_role
      CHECK (subject_role IN ('player', 'coach'));
  END IF;
END $$;
