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

# No `exec` here: the EXIT trap must run to stop and remove the cluster.
cd "$ARTIFACT_DIR"
pnpm exec vitest run "$@"
