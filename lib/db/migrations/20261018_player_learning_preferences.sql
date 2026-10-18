CREATE TABLE IF NOT EXISTS player_learning_preferences (
  id serial PRIMARY KEY,
  club_id integer NOT NULL REFERENCES clubs(id),
  user_id integer NOT NULL REFERENCES users(id),
  visual_score integer NOT NULL CHECK (visual_score BETWEEN 0 AND 30),
  auditory_score integer NOT NULL CHECK (auditory_score BETWEEN 0 AND 30),
  kinesthetic_score integer NOT NULL CHECK (kinesthetic_score BETWEEN 0 AND 30),
  questionnaire_version integer NOT NULL DEFAULT 1,
  completed_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT player_learning_preferences_score_total
    CHECK (visual_score + auditory_score + kinesthetic_score = 30)
);

CREATE UNIQUE INDEX IF NOT EXISTS player_learning_preferences_user_unique
  ON player_learning_preferences (user_id);
