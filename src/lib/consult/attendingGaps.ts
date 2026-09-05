export interface AttendingTurn {
  role: 'user' | 'assistant'
  text: string
}

export function getAttendingConfig(): { enabled: boolean; interval: number } {
  const raw = process.env.HISTORIAN_ATTENDING_INTERVAL
  const interval = raw && /^\d+$/.test(raw) ? Number(raw) : NaN
  return {
    enabled: process.env.HISTORIAN_ATTENDING_ENABLED === 'true',
    interval: Number.isSafeInteger(interval) && interval > 0 ? interval : 2,
  }
}

export function shouldRunAttending(input: {
  enabled: boolean
  interval: number
  localizerCycle: number | undefined
  transcriptTurnCount: number
  safetyEscalated: boolean
}): boolean {
  const { enabled, interval, localizerCycle, transcriptTurnCount, safetyEscalated } = input
  if (!enabled || safetyEscalated || transcriptTurnCount < 6) return false
  return typeof localizerCycle === 'number'
    ? localizerCycle % interval === 0
    : transcriptTurnCount % (interval * 2) === 0
}

/** Keep a contiguous suffix of whole turns; budget includes role labels/newlines.
 * An oversized newest turn yields an empty window rather than a misleading fragment.
 */
export function buildAttendingTranscriptWindow(turns: AttendingTurn[], maxChars = 60_000) {
  let start = turns.length
  let chars = 0
  while (start > 0) {
    const turn = turns[start - 1]
    const cost = `${turn.role === 'user' ? 'Patient' : 'Historian'}: ${turn.text}`.length
      + (start < turns.length ? 1 : 0)
    if (chars + cost > maxChars) break
    chars += cost
    start--
  }
  return { window: turns.slice(start), dropped_turns: start }
}
