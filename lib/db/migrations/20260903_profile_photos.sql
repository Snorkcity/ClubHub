ALTER TABLE users
  ADD COLUMN IF NOT EXISTS avatar_image text,
  ADD COLUMN IF NOT EXISTS avatar_content_type text,
  ADD COLUMN IF NOT EXISTS avatar_updated_at timestamptz;