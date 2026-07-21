/**
 * Structural integrity checks for AI Historian transcripts.
 *
 * Pure, side-effect-free validation used in two places: (1) the durable
 * transcript-flush pipeline can sanity-check a batch before/after insert,
 * and (2) the save route runs it as a cross-check between the client's
 * final `transcript` array and the durable `historian_transcript_events`
 * event log (see save/route.ts).
 *
 * IMPORTANT: issue messages must never embed entry.text — they may
 * eventually be logged server-side, and patient utterance text must never
 * be logged (see CLAUDE.md clinical-safety rules). Every message below is
 * built only from structural facts (index, seq, timestamp, role).
 */
import type { HistorianTranscriptEntry } from '@/lib/historianTypes'

const KNOWN_ROLES = new Set(['assistant', 'user'])

export interface TranscriptValidationResult {
  valid: boolean
  issues: string[]
}

export function validateTranscript(
  entries: HistorianTranscriptEntry[],
): TranscriptValidationResult {
  const issues: string[] = []

  // ── per-entry checks: role, text, non-negative timestamp ──
  entries.forEach((entry, index) => {
    if (!KNOWN_ROLES.has(entry.role)) {
      issues.push(`unknown role "${String(entry.role)}" at index ${index}`)
    }
    if (!entry.text || !entry.text.trim()) {
      issues.push(`empty text at index ${index}`)
    }
    if (typeof entry.timestamp !== 'number' || Number.isNaN(entry.timestamp)) {
      issues.push(`missing/invalid timestamp at index ${index}`)
    } else if (entry.timestamp < 0) {
      issues.push(`negative timestamp at index ${index}: ${entry.timestamp}`)
    }
  })

  // ── cross-entry checks: timestamp monotonicity ──
  for (let i = 1; i < entries.length; i++) {
    const prev = entries[i - 1].timestamp
    const curr = entries[i].timestamp
    if (typeof prev === 'number' && typeof curr === 'number' && curr < prev) {
      issues.push(`timestamp not monotonic at index ${i}: ${prev} -> ${curr}`)
    }
  }

  // ── seq checks: only meaningful when at least two entries carry a seq.
  // Legacy transcripts (saved before `seq` existed) omit it entirely on
  // every entry — that is NOT an integrity issue, just an older transcript.
  const seqPositions = entries
    .map((entry, index) => ({ index, seq: entry.seq }))
    .filter((p): p is { index: number; seq: number } => typeof p.seq === 'number')

  if (seqPositions.length >= 2) {
    const seen = new Map<number, number>() // seq -> first index seen
    let prevSeq: number | null = null
    for (const { index, seq } of seqPositions) {
      if (seen.has(seq)) {
        issues.push(`duplicate seq ${seq} at index ${index} (first seen at index ${seen.get(seq)})`)
      } else {
        seen.set(seq, index)
      }
      // A duplicate (seq === prevSeq) is reported above and must not also
      // be reported as out-of-order; only a strictly-decreasing seq is.
      if (prevSeq !== null && seq < prevSeq) {
        issues.push(`seq out of order at index ${index}: ${prevSeq} -> ${seq}`)
      }
      prevSeq = seq
    }
  }

  return { valid: issues.length === 0, issues }
}
