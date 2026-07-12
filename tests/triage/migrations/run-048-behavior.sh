#!/usr/bin/env bash

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
tmp_dir="$(mktemp -d /tmp/triage-migration-048-behavior-XXXXXX)"
socket_dir="$tmp_dir/socket"
port="${PGPORT:-55488}"

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
CREATE TABLE triage_extractions (id uuid PRIMARY KEY);
CREATE TABLE triage_sessions (id uuid PRIMARY KEY);
CREATE TABLE neurology_consults (id uuid PRIMARY KEY);
CREATE TABLE followup_sessions (id uuid PRIMARY KEY);
CREATE TABLE appointments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status text NOT NULL,
  scheduling_notes text
);
SQL

psql "${psql_args[@]}" \
  -f "$repo_root/migrations/048_triage_safety_workflow.sql" >/dev/null
psql "${psql_args[@]}" \
  -f "$repo_root/tests/triage/migrations/048_triage_safety_workflow.behavior.sql"
