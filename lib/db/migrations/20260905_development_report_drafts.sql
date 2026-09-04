-- Add reviewable family wording without changing existing submitted reports.
ALTER TABLE development_assessments ADD COLUMN IF NOT EXISTS family_draft_categories jsonb;
ALTER TABLE development_assessments ADD COLUMN IF NOT EXISTS family_strength text;
ALTER TABLE development_assessments ADD COLUMN IF NOT EXISTS family_focus text;
ALTER TABLE development_assessments ADD COLUMN IF NOT EXISTS reviewed_at timestamptz;
ALTER TABLE development_assessments ADD COLUMN IF NOT EXISTS reviewed_by_id integer REFERENCES users(id) ON DELETE SET NULL;