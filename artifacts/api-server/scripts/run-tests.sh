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

# No `exec` here: the EXIT trap must run to stop and remove the cluster.
cd "$ARTIFACT_DIR"
pnpm exec vitest run "$@"
