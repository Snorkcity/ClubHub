-- Additive Railway production migration for durable in-app and Web Push notifications.
-- Applied to production on 2026-09-01. Safe to re-run.
BEGIN;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS push_notifications_enabled boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS notifications (
  id serial PRIMARY KEY,
  club_id integer NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  actor_id integer REFERENCES users(id) ON DELETE SET NULL,
  kind text NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  deep_link text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notifications_club_created_idx
  ON notifications (club_id, created_at);

CREATE TABLE IF NOT EXISTS notification_recipients (
  id serial PRIMARY KEY,
  notification_id integer NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
  user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT notification_recipients_notification_user_unique
    UNIQUE (notification_id, user_id)
);

CREATE INDEX IF NOT EXISTS notification_recipients_user_created_idx
  ON notification_recipients (user_id, created_at);

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id serial PRIMARY KEY,
  user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint text NOT NULL,
  p256dh text NOT NULL,
  auth text NOT NULL,
  content_encoding text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT push_subscriptions_endpoint_unique UNIQUE (endpoint)
);

CREATE INDEX IF NOT EXISTS push_subscriptions_user_idx
  ON push_subscriptions (user_id);

COMMIT;