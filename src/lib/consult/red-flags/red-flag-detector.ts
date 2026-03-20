import { RED_FLAG_DEFINITIONS } from './red-flag-definitions'
import type {
  DetectedFlag,
  RedFlagDetection,
  RedFlagSeverity,
  EscalationTier,
} from './red-flag-types'

const SEVERITY_RANK: Record<RedFlagSeverity, number> = {
  critical: 3,
  high: 2,
  moderate: 1,
}

const TIER_RANK: Record<EscalationTier, number> = {
  immediate: 4,
  urgent: 3,
  same_day: 2,
  routine: 1,
}

/**
 * Extract a short snippet around a match index for context display.
 */
function extractSnippet(text: string, matchIndex: number, radius = 80): string {
  const start = Math.max(0, matchIndex - radius)
  const end = Math.min(text.length, matchIndex + radius)
  const snippet = text.slice(start, end).trim()
  return start > 0 ? `…${snippet}` : snippet
}

/**
 * Run keyword-based red flag detection against a transcript.
 *
 * @param transcriptText  Raw transcript from the historian session
 * @param consultId       ID of the associated consult record
 * @returns               RedFlagDetection result (never throws)
 */
export function detectRedFlags(
  transcriptText: string,
  consultId: string,
): RedFlagDetection {
  const normalized = transcriptText.toLowerCase()
  const detected: DetectedFlag[] = []

  for (const flag of RED_FLAG_DEFINITIONS) {
    let bestMatch: { pattern: string; index: number; confidence: number } | null = null

    for (const pattern of flag.patterns) {
      const idx = normalized.indexOf(pattern.toLowerCase())
      if (idx === -1) continue

      // Higher confidence for longer, more specific matches
      const confidence = Math.min(0.5 + pattern.split(' ').length * 0.1, 0.95)

      if (!bestMatch || confidence > bestMatch.confidence) {
        bestMatch = { pattern, index: idx, confidence }
      }
    }

    if (bestMatch) {
      detected.push({
        flag,
        matched_pattern: bestMatch.pattern,
        confidence: bestMatch.confidence,
        context_snippet: extractSnippet(transcriptText, bestMatch.index),
      })
    }
  }

  // Deduplicate: keep highest-confidence match per flag id
  const unique = new Map<string, DetectedFlag>()
  for (const d of detected) {
    const existing = unique.get(d.flag.id)
    if (!existing || d.confidence > existing.confidence) {
      unique.set(d.flag.id, d)
    }
  }

  const deduplicated = Array.from(unique.values()).sort(
    (a, b) => SEVERITY_RANK[b.flag.severity] - SEVERITY_RANK[a.flag.severity],
  )

  const highest = deduplicated[0] ?? null

  return {
    consult_id: consultId,
    transcript_text: transcriptText,
    detected_flags: deduplicated,
    highest_severity: highest ? highest.flag.severity : null,
    recommended_escalation_tier: highest ? highest.flag.escalation_tier : null,
    detected_at: new Date().toISOString(),
  }
}

/**
 * Determine the highest escalation tier across all detected flags.
 */
export function resolveEscalationTier(detection: RedFlagDetection): EscalationTier | null {
  if (detection.detected_flags.length === 0) return null

  return detection.detected_flags.reduce<EscalationTier>((best, d) => {
    return TIER_RANK[d.flag.escalation_tier] > TIER_RANK[best]
      ? d.flag.escalation_tier
      : best
  }, 'routine')
}
