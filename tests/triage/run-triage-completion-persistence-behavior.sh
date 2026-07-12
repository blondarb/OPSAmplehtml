#!/usr/bin/env bash

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
tmp_dir="$(mktemp -d /tmp/triage-completion-behavior-XXXXXX)"
socket_dir="$tmp_dir/socket"
port="${PGPORT:-55496}"

mkdir -p "$socket_dir"

cleanup() {
  if [[ -f "$tmp_dir/data/postmaster.pid" ]]; then
    pg_ctl -D "$tmp_dir/data" -m fast -w stop >/dev/null 2>&1 || true
  fi
  rm -rf "$tmp_dir"
}
trap cleanup EXIT

for command in initdb pg_ctl; do
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

TRIAGE_COMPLETION_PG_INTEGRATION=1 \
PGHOST="$socket_dir" \
PGPORT="$port" \
PGDATABASE=postgres \
PGUSER="$(id -un)" \
  "$repo_root/node_modules/.bin/vitest" run \
  tests/triage/triageCompletionPersistence.postgres.test.ts
