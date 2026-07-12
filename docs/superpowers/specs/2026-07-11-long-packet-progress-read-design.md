# Durable Long-Packet Progress Read Design

**Status:** Approved for implementation on 2026-07-11.

## Goal

Give an authenticated clinician concise progress while a tenant-bound long-packet extraction remains pending, without returning packet contents, model outputs, internal identifiers, worker/lease details, errors, or PHI.

## Architecture

A focused `longPacketProgressRead` service performs one aggregate PostgreSQL query over migration-052 durable-work tables. The query starts from the tenant-bound, pending, `long_packet` extraction; selects the newest primary run for that extraction; and aggregates only lifecycle statuses and counts. The polling route calls this service only for a pending long-packet extraction and conditionally adds `long_packet_progress` to its existing response.

The client polling helper runtime-validates the aggregate before invoking `PollOptions.onProgress`. The triage page stores only the validated aggregate and derives a concise clinician-facing label. Batch items may store only that label, never the underlying run/job identity.

## API contract

`GET /api/triage/extract/:id` may add this object while `status` is `pending`:

```json
{
  "long_packet_progress": {
    "run_status": "pending | running | complete | failed",
    "expected_chunks": 8,
    "mapper": { "completed": 3, "failed": 0, "leased": 1 },
    "safety": { "completed": 4, "failed": 0, "leased": 1 },
    "finalizer_status": "pending | leased | complete | failed | null"
  }
}
```

No other durable-work columns are selected or serialized. In particular, the response excludes run IDs, chunk/job IDs, configuration/source/plan hashes, model or prompt identifiers, attempts, retry times, lease tokens/owners/times, result payloads/hashes, error codes/details, and timestamps.

## Data and isolation rules

- The aggregate SQL joins `triage_extractions` to the selected run with both extraction ID and tenant ID.
- The extraction must still be `pending` and `ingestion_mode = 'long_packet'`.
- Only `run_purpose = 'primary'` is eligible; the newest primary run is selected deterministically.
- Chunk counts are filtered by branch and status and cast to integers.
- Every count must be a safe non-negative integer no greater than `expected_chunks`; status totals for one branch may not exceed `expected_chunks`.
- A `complete` run is accepted only if mapper and safety completed counts equal `expected_chunks` and finalizer status is `complete`. Inconsistent data is omitted, never presented as completion.
- No matching run returns `null`, causing the route to omit the progress field.
- Database errors or malformed aggregate rows throw a sanitized service error. The route catches it, logs only a generic message, preserves `status: pending`, and omits progress.

## Client and UI behavior

`PollOptions.onProgress` receives `Readonly<LongPacketProgress> | null` on each pending poll. A strict client parser accepts only the documented fields and bounds; invalid or absent data produces `null`, which clears stale progress rather than retaining a possibly misleading state.

The primary extraction UI renders a short description such as:

`Clinical mapping 3/8 · Safety review 4/8 · 2 active`

If failures are present it adds `1 awaiting retry/review`. When all chunk work is complete it reports `Finalizing packet review…`; it never calls the overall extraction complete until the terminal API response does. Batch UI stores and shows only this derived label.

## Testing

- Service tests cover tenant/extraction bindings, aggregate-only SQL, valid counts, no run, malformed/inconsistent rows, and database failure.
- Route tests cover authorization, tenant propagation, exact sanitized response shape, no progress for non-long-packet/terminal/no-run cases, and omission on service error.
- Polling tests cover valid progress delivery, invalid/absent progress clearing, and unchanged terminal behavior.
- Pure formatter tests cover mapping/safety counts, active/failed work, finalization, and failed-run wording without exposing internals.
- Focused typecheck/lint plus the existing triage suite verify compatibility.

## Non-goals

No schema migration, worker behavior, retry policy, result retrieval, PHI display, production deployment, commit, push, or AWS call is part of this slice.
