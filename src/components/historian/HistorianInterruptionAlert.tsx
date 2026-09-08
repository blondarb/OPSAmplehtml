/**
 * Patient-facing "the connection dropped" notice for the interview screen
 * (Step 3, `phase === 'active' || phase === 'ending'`).
 *
 * Extracted as a tiny pure component (no hooks, no client-only imports) so it
 * can be unit-tested with `renderToStaticMarkup` — NeurologicHistorian.tsx
 * itself pulls in `useRouter`/`useSearchParams`/`useRealtimeSession` and
 * cannot be rendered outside a browser/router context (this repo's vitest
 * suite has no jsdom/RTL; see tests/historian/HistorianRunsView.pending.test.tsx
 * for the same pattern).
 *
 * Deliberately generic, reassuring copy: NEVER surface the raw provider/relay
 * error message (e.g. a Bedrock exception name) to the patient. The setup-
 * phase alert in NeurologicHistorian.tsx (before the microphone opens) is
 * unchanged and still shows the raw `error` string — that one is a form-
 * validation-style message the patient caused (e.g. missing referral), not a
 * mid-interview transport failure.
 */

export interface HistorianInterruptionAlertProps {
  /** The voice provider's current error message; alert renders iff truthy. */
  error: string | null | undefined
}

export default function HistorianInterruptionAlert({ error }: HistorianInterruptionAlertProps) {
  if (!error) return null

  return (
    <div role="alert" className="nn-alert" style={{ marginBottom: 16 }}>
      The connection to your interviewer was interrupted. Everything you&apos;ve shared so far
      has been saved for your neurologist.
    </div>
  )
}
