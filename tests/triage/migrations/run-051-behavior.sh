#!/usr/bin/env bash

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
tmp_dir="$(mktemp -d /tmp/triage-migration-051-behavior-XXXXXX)"
socket_dir="$tmp_dir/socket"
port="${PGPORT:-55491}"

mkdir -p "$socket_dir"

cleanup() {
  if [[ -f "$tmp_dir/data/postmaster.pid" ]]; then
    pg_ctl -D "$tmp_dir/data" -m fast -w stop >/dev/null 2>&1 || true
  fi
  rm -rf "$tmp_dir"
}
trap cleanup EXIT

for command in initdb pg_ctl psql; do
  if ! command -v "$command" >/dev/null 2>&1; then
    echo "PostgreSQL command not found: $command" >&2
    exit 1
  fi
done

initdb -D "$tmp_dir/data" --auth=trust --no-locale -E UTF8 >/dev/null
pg_ctl \
  -D "$tmp_dir/data" \
  -o "-F -c listen_addresses='' -k $socket_dir -p $port" \
  -w start >/dev/null

psql_args=(
  -h "$socket_dir"
  -p "$port"
  -X
  -v ON_ERROR_STOP=1
)

psql "${psql_args[@]}" -d postgres <<'SQL'
CREATE DATABASE triage_051_preflight;
CREATE DATABASE triage_051_behavior;
SQL

psql "${psql_args[@]}" -d triage_051_preflight <<'SQL'
CREATE TABLE triage_extractions (
  id uuid PRIMARY KEY,
  tenant_id text NOT NULL
);
CREATE TABLE triage_sessions (
  id uuid PRIMARY KEY,
  tenant_id text NOT NULL,
  source_extraction_id uuid REFERENCES triage_extractions(id) ON DELETE RESTRICT,
  processing_status text NOT NULL DEFAULT 'pending'
    CHECK (processing_status IN ('pending','complete','error'))
);
INSERT INTO triage_extractions (id, tenant_id) VALUES
  ('05100000-0000-4000-8000-000000000099', 'tenant-preflight');
INSERT INTO triage_sessions (
  id, tenant_id, source_extraction_id, processing_status
) VALUES
  ('05110000-0000-4000-8000-000000000098', 'tenant-preflight', '05100000-0000-4000-8000-000000000099', 'pending'),
  ('05110000-0000-4000-8000-000000000099', 'tenant-preflight', '05100000-0000-4000-8000-000000000099', 'pending');
SQL

if psql "${psql_args[@]}" -d triage_051_preflight \
  -f "$repo_root/migrations/051_triage_ingress_idempotency.sql" \
  >"$tmp_dir/preflight.log" 2>&1; then
  echo "Migration 051 unexpectedly accepted duplicate source links" >&2
  exit 1
fi
if ! grep -q 'preflight found duplicate source extraction links' \
  "$tmp_dir/preflight.log"; then
  cat "$tmp_dir/preflight.log" >&2
  echo "Migration 051 did not emit its duplicate-link preflight diagnostic" >&2
  exit 1
fi
echo "PASS: migration 051 duplicate-link preflight"

psql "${psql_args[@]}" -d triage_051_behavior <<'SQL'
CREATE TABLE triage_extractions (
  id uuid PRIMARY KEY,
  tenant_id text NOT NULL
);
CREATE TABLE triage_sessions (
  id uuid PRIMARY KEY,
  tenant_id text NOT NULL,
  source_extraction_id uuid REFERENCES triage_extractions(id) ON DELETE RESTRICT,
  processing_status text NOT NULL DEFAULT 'pending'
    CHECK (processing_status IN ('pending','complete','error'))
);
SQL

psql "${psql_args[@]}" -d triage_051_behavior \
  -f "$repo_root/migrations/051_triage_ingress_idempotency.sql" >/dev/null
psql "${psql_args[@]}" -d triage_051_behavior \
  -f "$repo_root/tests/triage/migrations/051_triage_ingress_idempotency.behavior.sql"
