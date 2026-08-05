import type { ClinicalExtraction, TriageResult } from '@/lib/triage/types'
import type { HistorianReferralInput } from './referralContext'

/**
 * sessionStorage key for the triage → historian handoff. Bumping the version
 * lets a future shape change ignore payloads written by an older build
 * instead of misreading them.
 */
export const HISTORIAN_REFERRAL_HANDOFF_KEY = 'nn:historian:referral:v1'

const HANDOFF_VERSION = 1 as const

/** A handoff older than this is ignored — see readHistorianHandoff(). */
const STALE_AFTER_MS = 30 * 60 * 1000

/** Presentation-only fields the historian shows in its "loaded from triage" line. */
export interface HistorianHandoffDisplay {
  patientLabel?: string
  tierDisplay?: string
  focusHint?: string
}

export interface HistorianReferralHandoffPayload {
  version: typeof HANDOFF_VERSION
  createdAt: number
  referral: HistorianReferralInput
  display: HistorianHandoffDisplay
}

/**
 * Minimal storage shape (matches the subset of the Web Storage API this
 * module needs). Letting the caller inject it keeps read/write pure enough
 * to unit test without a DOM — production callers default to
 * `window.sessionStorage`.
 */
export interface HandoffStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

/**
 * `window.sessionStorage` when available, else null. Wrapped in try/catch
 * because merely *reading* `window.sessionStorage` throws in some
 * private-mode browsers (Safari), not just calling its methods.
 */
function defaultStorage(): HandoffStorage | null {
  try {
    return typeof window !== 'undefined' ? window.sessionStorage : null
  } catch {
    return null
  }
}

/**
 * Write the triage → historian handoff. Best-effort: sessionStorage can
 * throw (private-mode Safari, quota exceeded), so this never throws back at
 * the caller — it returns whether the write actually landed. A failed write
 * should not block navigation; the historian just falls back to its
 * ordinary, undirected interview.
 */
export function writeHistorianHandoff(
  referral: HistorianReferralInput,
  display: HistorianHandoffDisplay = {},
  storage: HandoffStorage | null = defaultStorage(),
  now: number = Date.now(),
): boolean {
  if (!storage) return false
  const payload: HistorianReferralHandoffPayload = {
    version: HANDOFF_VERSION,
    createdAt: now,
    referral,
    display,
  }
  try {
    storage.setItem(HISTORIAN_REFERRAL_HANDOFF_KEY, JSON.stringify(payload))
    return true
  } catch {
    return false
  }
}

function isHandoffPayload(value: unknown): value is HistorianReferralHandoffPayload {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  return (
    v.version === HANDOFF_VERSION &&
    typeof v.createdAt === 'number' &&
    typeof v.referral === 'object' &&
    v.referral !== null
  )
}

/**
 * Read the triage → historian handoff, one-shot: the key is removed as soon
 * as it is read (successfully or not) so a refresh or a later visit never
 * resurrects stale clinical context into a new patient's interview.
 *
 * Any failure mode — storage unavailable, corrupt JSON, a version mismatch,
 * or a payload older than 30 minutes — is treated identically as "no
 * handoff, start the ordinary interview." None of these are surfaced to the
 * user as an error.
 */
export function readHistorianHandoff(
  storage: HandoffStorage | null = defaultStorage(),
  now: number = Date.now(),
): HistorianReferralHandoffPayload | null {
  if (!storage) return null

  let raw: string | null
  try {
    raw = storage.getItem(HISTORIAN_REFERRAL_HANDOFF_KEY)
  } catch {
    return null
  }
  if (!raw) return null

  // Remove immediately — one-shot applies even if the payload below turns
  // out to be corrupt, stale, or version-mismatched.
  try {
    storage.removeItem(HISTORIAN_REFERRAL_HANDOFF_KEY)
  } catch {
    // Nothing more we can do; the staleness check below still bounds a
    // storage that lets getItem succeed but blocks removeItem.
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }

  if (!isHandoffPayload(parsed)) return null
  if (now - parsed.createdAt > STALE_AFTER_MS) return null

  return parsed
}

/**
 * The "Referral loaded from triage" status line shown next to the historian's
 * "Use this referral" button. Pulled into its own pure function because the
 * failure mode here is easy to reintroduce silently: `focusHint` is often an
 * AI-generated clinical-reason sentence that already ends in a period, and
 * concatenating it directly against a hardcoded trailing sentence doubled
 * the punctuation ("...MS evaluation.. Start the interview below.") —
 * observed in production 2026-08-05. Keeps both the tier AND the focus
 * visible; the focus is the whole point of the handoff, and its silent
 * absence is the failure mode `tests/historian/triageHandoffPayload.test.ts`
 * guards against.
 */
export function formatHandoffLoadedMessage(
  display: HistorianHandoffDisplay | null,
): string {
  if (!display) return 'Referral loaded — start the interview below.'

  const tier = display.tierDisplay?.trim()
  const focus = display.focusHint?.trim().replace(/\.+$/, '')
  const detail = [tier, focus].filter(Boolean).join(': ')

  return detail
    ? `Referral loaded from triage — ${detail}. Start the interview below.`
    : 'Referral loaded — start the interview below.'
}

/**
 * Build the referral payload a scored triage run hands to the historian.
 *
 * Extracted from the click handler ON PURPOSE. The dangerous failure here is
 * silent: if `subspecialty` and `clinicalReasons` both arrive empty,
 * `deriveFocus()` falls back and can end up with NO focus at all — and an
 * unsteered interview looks identical on screen to a steered one. That is not
 * something a render test can catch, so the shape lives in a pure function
 * with tests rather than inline in a component.
 */
export function buildTriageHandoffReferral(
  result: TriageResult,
  extraction: ClinicalExtraction | null,
  originalText: string,
): HistorianReferralInput {
  return {
    noteText: originalText || undefined,
    // `extraction` can be null even with a result set (legacy/non-extraction
    // path) — guard rather than assume it is populated.
    extraction: extraction ? extraction.key_findings : undefined,
    triage: {
      tierDisplay: result.triage_tier_display,
      urgency: result.triage_tier,
      subspecialty: result.subspecialty_recommendation,
      clinicalReasons: result.clinical_reasons,
      redFlags: result.red_flags,
    },
    steer: 'directive',
    // includeRawNote intentionally omitted — defaults to TRUE (see
    // referralContext.ts) because the app is synthetic-data-only today.
    // Do not set it explicitly; flip the default there when real notes arrive.
  }
}
