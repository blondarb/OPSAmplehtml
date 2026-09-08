/**
 * Localizer session-id precedence.
 *
 * The localizer route (src/app/api/ai/historian/localizer/route.ts) upserts
 * historian_localizer_results keyed by the sessionId it is sent (migration
 * 064, PR #231), and the /rnd/historian runs route joins that table on
 * historian_sessions.id::text. On /patient/historian there is no consult, so
 * the pre-existing `options.consultId ?? 'ephemeral'` key was always
 * 'ephemeral' for that route — never matching a real historian_sessions.id —
 * so patient-route runs never showed live-localizer Signals on
 * /rnd/historian.
 *
 * The server-minted historian session id (POST /api/ai/historian/session's
 * `sessionId`, stored in useRealtimeSession's serverSessionIdRef) is what
 * becomes historian_sessions.id at save time, and it's also what
 * persistLocalizerResults' consult-linked lookup already expects
 * (`neurology_consults.historian_session_id = sessionId`) — so it is the
 * correct key for both the standalone and consult-linked cases. Fall back to
 * consultId, then 'ephemeral', only when no server id has been minted yet
 * (e.g. the very first localizer run racing session mint).
 */
export function resolveLocalizerSessionId(
  serverSessionId: string | null | undefined,
  consultId: string | null | undefined,
): string {
  return serverSessionId ?? consultId ?? 'ephemeral'
}
