import { describe, expect, it } from 'vitest'
import { resolveLocalizerSessionId } from '@/lib/historian/localizerSessionKey'

/**
 * Covers the localizer session-key precedence fix: useRealtimeSession's two
 * localizer fetches (steer + detail) now key on the server-minted historian
 * session id (serverSessionIdRef.current) instead of options.consultId ??
 * 'ephemeral'. On /patient/historian there is no consult, so every call was
 * previously keyed 'ephemeral' — never matching historian_sessions.id — so
 * historian_localizer_results never joined for patient-route runs on
 * /rnd/historian (PR #231 made the localizer route upsert by sessionId and
 * the runs route join on historian_sessions.id::text).
 */
describe('resolveLocalizerSessionId', () => {
  it('prefers the server-minted historian session id when present', () => {
    expect(resolveLocalizerSessionId('server-session-1', 'consult-1')).toBe('server-session-1')
  })

  it('falls back to the consult id when no server session id has been minted yet', () => {
    expect(resolveLocalizerSessionId(null, 'consult-1')).toBe('consult-1')
    expect(resolveLocalizerSessionId(undefined, 'consult-1')).toBe('consult-1')
  })

  it('falls back to \'ephemeral\' when neither a server session id nor a consult id is available', () => {
    expect(resolveLocalizerSessionId(null, null)).toBe('ephemeral')
    expect(resolveLocalizerSessionId(undefined, undefined)).toBe('ephemeral')
    expect(resolveLocalizerSessionId(null, undefined)).toBe('ephemeral')
  })
})
