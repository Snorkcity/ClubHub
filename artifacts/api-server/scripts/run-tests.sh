#!/usr/bin/env bash
# Runs the API test suite against a throwaway local PostgreSQL cluster so the
# shared dev/prod database is never touched. Lifecycle: initdb -> start on a
# private unix socket -> push the drizzle schema -> vitest -> tear down.
set -euo pipefail

ARTIFACT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PGDIR="$(mktemp -d /tmp/clubhub-test-pg.XXXXXX)"
PGDATA="$PGDIR/data"
PGPORT=5498

cleanup() {
  pg_ctl -D "$PGDATA" -m immediate stop >/dev/null 2>&1 || true
  rm -rf "$PGDIR"
}
trap cleanup EXIT

initdb -D "$PGDATA" -U postgres -A trust >/dev/null

# Unix-socket only (listen_addresses='') so parallel runs / other services
# can't collide on TCP ports.
pg_ctl -D "$PGDATA" -w -l "$PGDIR/pg.log" \
  -o "-c listen_addresses='' -k $PGDIR -p $PGPORT" start >/dev/null

createdb -h "$PGDIR" -p "$PGPORT" -U postgres clubhub_test

# The clubhub_test marker in the URL is asserted by the test suite (fail
# closed: tests refuse to run against anything else).
export DATABASE_URL="postgresql://postgres@localhost:$PGPORT/clubhub_test?host=$PGDIR"

# Create the schema from the drizzle definitions.
pnpm --filter @workspace/db run push-force >/dev/null

# New-club access migration is additive and safe to run on every API startup.
psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 \
  -f "$ARTIFACT_DIR/../../lib/db/migrations/20261025_club_setup_access.sql" >/dev/null
psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 \
  -f "$ARTIFACT_DIR/../../lib/db/migrations/20261025_club_setup_access.sql" >/dev/null

# Exercise the additive production repair from the drifted state: preserve all
# rows, remove only the constraint, then prove the migration restores it.
membership_count_before="$(psql "$DATABASE_URL" -X -Atc "SELECT COUNT(*) FROM club_members")"
psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 \
  -c "DROP INDEX club_members_club_id_user_id_unique" \
  >/dev/null
psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 \
  -c "ALTER TABLE club_members ADD CONSTRAINT club_members_club_id_user_id_unique UNIQUE (club_id, user_id)" \
  >/dev/null
psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 \
  -f "$ARTIFACT_DIR/../../lib/db/migrations/20260901_club_members_unique.sql" \
  >/dev/null
membership_count_after="$(psql "$DATABASE_URL" -X -Atc "SELECT COUNT(*) FROM club_members")"
test "$membership_count_before" = "$membership_count_after"

# Exercise the coach-scope migration from the legacy player-only schema.
psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 \
  -c "ALTER TABLE player_learning_preferences DROP CONSTRAINT IF EXISTS player_learning_preferences_subject_role; DROP INDEX IF EXISTS player_learning_preferences_user_role_unique; ALTER TABLE player_learning_preferences DROP COLUMN IF EXISTS subject_role; CREATE UNIQUE INDEX player_learning_preferences_user_unique ON player_learning_preferences (user_id)" \
  >/dev/null
psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 \
  -f "$ARTIFACT_DIR/../../lib/db/migrations/20261025_learning_preferences_coach_scope.sql" \
  >/dev/null
# Apply the new schema while keeping the old user-only index so the currently
# deployed API remains compatible until the new API is live.
psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 \
  -f "$ARTIFACT_DIR/../../lib/db/migrations/20261025_learning_preferences_coach_scope.sql" \
  >/dev/null
learning_preferences_schema="$(psql "$DATABASE_URL" -X -Atc "SELECT (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'player_learning_preferences' AND column_name = 'subject_role') || ':' || (SELECT COUNT(*) FROM pg_indexes WHERE tablename = 'player_learning_preferences' AND indexname = 'player_learning_preferences_user_role_unique') || ':' || (SELECT COUNT(*) FROM pg_constraint WHERE conname = 'player_learning_preferences_subject_role') || ':' || (SELECT COUNT(*) FROM pg_indexes WHERE tablename = 'player_learning_preferences' AND indexname = 'player_learning_preferences_user_unique')")"
test "$learning_preferences_schema" = "1:1:1:1"
# Once the new API is live, the post-deploy migration removes only the legacy
# index that prevents separate player and coach records for dual-role users.
psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 \
  -f "$ARTIFACT_DIR/../../lib/db/migrations/20261025_learning_preferences_drop_legacy_unique.sql" \
  >/dev/null
psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 \
  -f "$ARTIFACT_DIR/../../lib/db/migrations/20261025_learning_preferences_drop_legacy_unique.sql" \
  >/dev/null
learning_preferences_schema="$(psql "$DATABASE_URL" -X -Atc "SELECT (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'player_learning_preferences' AND column_name = 'subject_role') || ':' || (SELECT COUNT(*) FROM pg_indexes WHERE tablename = 'player_learning_preferences' AND indexname = 'player_learning_preferences_user_role_unique') || ':' || (SELECT COUNT(*) FROM pg_constraint WHERE conname = 'player_learning_preferences_subject_role') || ':' || (SELECT COUNT(*) FROM pg_indexes WHERE tablename = 'player_learning_preferences' AND indexname = 'player_learning_preferences_user_unique')")"
test "$learning_preferences_schema" = "1:1:1:0"

# No `exec` here: the EXIT trap must run to stop and remove the cluster.
cd "$ARTIFACT_DIR"
pnpm exec vitest run "$@"
