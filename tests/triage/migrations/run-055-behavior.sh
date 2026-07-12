#!/usr/bin/env bash

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
tmp_dir="$(mktemp -d /tmp/triage-migration-055-behavior-XXXXXX)"
socket_dir="$tmp_dir/socket"
port="${PGPORT:-55495}"

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
  -d postgres
  -X
  -v ON_ERROR_STOP=1
)

psql "${psql_args[@]}" <<'SQL'
CREATE TABLE triage_sessions (
  id uuid PRIMARY KEY,
  tenant_id text NOT NULL
);

CREATE TABLE neurology_consults (
  id uuid PRIMARY KEY,
  tenant_id text NOT NULL,
  triage_session_id uuid
);

INSERT INTO triage_sessions (id, tenant_id) VALUES
  ('55000000-0000-4000-8000-000000000101', 'tenant-a'),
  ('55000000-0000-4000-8000-000000000102', 'tenant-a');

INSERT INTO neurology_consults (id, tenant_id, triage_session_id) VALUES
  ('55000000-0000-4000-8000-000000000001', 'tenant-a', '55000000-0000-4000-8000-000000000101'),
  ('55000000-0000-4000-8000-000000000002', 'tenant-b', '55000000-0000-4000-8000-000000000101');
SQL

if psql "${psql_args[@]}" \
  -f "$repo_root/migrations/055_unique_consult_per_triage_session.sql" \
  >"$tmp_dir/preflight.out" 2>&1; then
  echo "Migration 055 unexpectedly accepted preexisting duplicates" >&2
  exit 1
fi

grep -q \
  'reconcile duplicate consult bindings before retrying' \
  "$tmp_dir/preflight.out"

duplicate_count="$(
  psql "${psql_args[@]}" -Atc \
    "SELECT count(*) FROM neurology_consults WHERE triage_session_id = '55000000-0000-4000-8000-000000000101'"
)"
test "$duplicate_count" = "2"

psql "${psql_args[@]}" <<'SQL'
DELETE FROM neurology_consults
 WHERE id = '55000000-0000-4000-8000-000000000002';

UPDATE neurology_consults
   SET tenant_id = 'tenant-b'
 WHERE id = '55000000-0000-4000-8000-000000000001';
SQL

if psql "${psql_args[@]}" \
  -f "$repo_root/migrations/055_unique_consult_per_triage_session.sql" \
  >"$tmp_dir/tenant-preflight.out" 2>&1; then
  echo "Migration 055 unexpectedly accepted a cross-tenant binding" >&2
  exit 1
fi

grep -q \
  'reconcile cross-tenant consult bindings before retrying' \
  "$tmp_dir/tenant-preflight.out"

preserved_tenant="$(
  psql "${psql_args[@]}" -Atc \
    "SELECT tenant_id FROM neurology_consults WHERE id = '55000000-0000-4000-8000-000000000001'"
)"
test "$preserved_tenant" = "tenant-b"

psql "${psql_args[@]}" <<'SQL'
UPDATE neurology_consults
   SET tenant_id = 'tenant-a'
 WHERE id = '55000000-0000-4000-8000-000000000001';
SQL

psql "${psql_args[@]}" \
  -f "$repo_root/migrations/055_unique_consult_per_triage_session.sql" \
  >/dev/null
psql "${psql_args[@]}" \
  -f "$repo_root/migrations/055_unique_consult_per_triage_session.sql" \
  >/dev/null

if psql "${psql_args[@]}" -c \
  "INSERT INTO neurology_consults (id, tenant_id, triage_session_id) VALUES ('55000000-0000-4000-8000-000000000003', 'tenant-a', '55000000-0000-4000-8000-000000000101')" \
  >"$tmp_dir/unique.out" 2>&1; then
  echo "Migration 055 unique index unexpectedly accepted a duplicate" >&2
  exit 1
fi

grep -q 'duplicate key value violates unique constraint' "$tmp_dir/unique.out"

if psql "${psql_args[@]}" -c \
  "INSERT INTO neurology_consults (id, tenant_id, triage_session_id) VALUES ('55000000-0000-4000-8000-000000000004', 'tenant-b', '55000000-0000-4000-8000-000000000101')" \
  >"$tmp_dir/cross-tenant-duplicate.out" 2>&1; then
  echo "Migration 055 unexpectedly accepted a cross-tenant duplicate" >&2
  exit 1
fi

if psql "${psql_args[@]}" -c \
  "INSERT INTO neurology_consults (id, tenant_id, triage_session_id) VALUES ('55000000-0000-4000-8000-000000000005', 'tenant-b', '55000000-0000-4000-8000-000000000102')" \
  >"$tmp_dir/cross-tenant-new.out" 2>&1; then
  echo "Migration 055 unexpectedly accepted a new cross-tenant binding" >&2
  exit 1
fi

grep -q \
  'consult and triage session tenant binding must match' \
  "$tmp_dir/cross-tenant-new.out"

psql "${psql_args[@]}" -c \
  "INSERT INTO neurology_consults (id, tenant_id, triage_session_id) VALUES ('55000000-0000-4000-8000-000000000006', 'tenant-a', '55000000-0000-4000-8000-000000000102')" \
  >/dev/null

if psql "${psql_args[@]}" -c \
  "UPDATE neurology_consults SET tenant_id = 'tenant-b' WHERE id = '55000000-0000-4000-8000-000000000006'" \
  >"$tmp_dir/consult-drift.out" 2>&1; then
  echo "Migration 055 unexpectedly accepted consult tenant drift" >&2
  exit 1
fi

grep -q \
  'consult and triage session tenant binding must match' \
  "$tmp_dir/consult-drift.out"

if psql "${psql_args[@]}" -c \
  "UPDATE triage_sessions SET tenant_id = 'tenant-b' WHERE id = '55000000-0000-4000-8000-000000000102'" \
  >"$tmp_dir/session-drift.out" 2>&1; then
  echo "Migration 055 unexpectedly accepted session tenant drift" >&2
  exit 1
fi

grep -q \
  'consult and triage session tenant binding must match' \
  "$tmp_dir/session-drift.out"

binding_count="$(
  psql "${psql_args[@]}" -Atc \
    "SELECT count(*) FROM neurology_consults WHERE triage_session_id IN ('55000000-0000-4000-8000-000000000101', '55000000-0000-4000-8000-000000000102')"
)"
test "$binding_count" = "2"

echo 'PASS: migration 055 rejects historical and runtime cross-tenant links and enforces one consult per session'
