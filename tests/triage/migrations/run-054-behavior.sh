#!/usr/bin/env bash

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
tmp_dir="$(mktemp -d /tmp/triage-migration-054-behavior-XXXXXX)"
socket_dir="$tmp_dir/socket"
port="${PGPORT:-55494}"

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
CREATE TABLE notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL,
  recipient_user_id text,
  source_type text NOT NULL,
  source_id text,
  patient_id uuid,
  priority text NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  status text NOT NULL DEFAULT 'unread',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
SQL

psql "${psql_args[@]}" \
  -f "$repo_root/migrations/048_triage_safety_workflow.sql" >/dev/null
psql "${psql_args[@]}" \
  -f "$repo_root/migrations/053_emergency_action_alert_outbox.sql" >/dev/null
psql "${psql_args[@]}" \
  -f "$repo_root/migrations/054_emergency_alert_notification_delivery.sql" >/dev/null
# Reapply before fixtures to prove migration-level idempotency.
psql "${psql_args[@]}" \
  -f "$repo_root/migrations/054_emergency_alert_notification_delivery.sql" >/dev/null
psql "${psql_args[@]}" \
  -f "$repo_root/tests/triage/migrations/054_emergency_alert_notification_delivery.behavior.sql"

PGHOST="$socket_dir" \
PGPORT="$port" \
PGDATABASE=postgres \
  "$repo_root/node_modules/.bin/ts-node" \
  --transpile-only \
  --compiler-options '{"module":"CommonJS","moduleResolution":"node"}' \
  "$repo_root/tests/triage/migrations/054_emergency_alert_notification_delivery.integration.ts"
