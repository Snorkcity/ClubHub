CREATE TABLE IF NOT EXISTS development_cycles (
  id serial PRIMARY KEY,
  club_id integer NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  team_id integer NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  created_by_id integer NOT NULL REFERENCES users(id),
  internal_recipient_id integer REFERENCES users(id) ON DELETE SET NULL,
  title text NOT NULL,
  reporting_period text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  submitted_at timestamptz,
  released_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS development_cycles_club_team_idx ON development_cycles(club_id, team_id);
CREATE INDEX IF NOT EXISTS development_cycles_status_idx ON development_cycles(status);

CREATE TABLE IF NOT EXISTS development_cycle_assessors (
  id serial PRIMARY KEY,
  cycle_id integer NOT NULL REFERENCES development_cycles(id) ON DELETE CASCADE,
  user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(cycle_id, user_id)
);
CREATE INDEX IF NOT EXISTS development_cycle_assessors_user_idx ON development_cycle_assessors(user_id);

CREATE TABLE IF NOT EXISTS development_assessments (
  id serial PRIMARY KEY,
  cycle_id integer NOT NULL REFERENCES development_cycles(id) ON DELETE CASCADE,
  player_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  technical integer NOT NULL,
  tactical integer NOT NULL,
  physical integer NOT NULL,
  coachability_mindset integer NOT NULL,
  effort_consistency integer NOT NULL,
  teamwork_communication integer NOT NULL,
  attendance_reliability integer NOT NULL,
  strength text NOT NULL,
  focus text NOT NULL,
  internal_notes text,
  updated_by_id integer NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(cycle_id, player_id),
  CONSTRAINT development_assessment_ratings_check CHECK (
    technical BETWEEN 1 AND 5 AND tactical BETWEEN 1 AND 5 AND physical BETWEEN 1 AND 5
    AND coachability_mindset BETWEEN 1 AND 5 AND effort_consistency BETWEEN 1 AND 5
    AND teamwork_communication BETWEEN 1 AND 5 AND attendance_reliability BETWEEN 1 AND 5
  )
);
CREATE INDEX IF NOT EXISTS development_assessments_player_idx ON development_assessments(player_id);

CREATE TABLE IF NOT EXISTS development_reports (
  id serial PRIMARY KEY,
  cycle_id integer NOT NULL REFERENCES development_cycles(id) ON DELETE CASCADE,
  assessment_id integer NOT NULL REFERENCES development_assessments(id) ON DELETE RESTRICT,
  player_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  player_first_name text NOT NULL,
  player_full_name text NOT NULL,
  reporting_period text NOT NULL,
  categories jsonb NOT NULL,
  strength text NOT NULL,
  focus text NOT NULL,
  disclosure text NOT NULL,
  released_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(cycle_id, player_id)
);
CREATE INDEX IF NOT EXISTS development_reports_player_released_idx ON development_reports(player_id, released_at);
