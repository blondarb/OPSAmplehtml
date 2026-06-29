/**
 * Neuro FAQ Voice — specialty config seam.
 *
 * POC SKELETON. The whole pipeline is specialty-agnostic; only the corpus, the
 * red-flag banks, and (later) the ASR vocab terms are specialty-specific. This
 * registry makes a urology/OAB variant a DATA SWAP, not a fork.
 *
 * Active specialty is selected by the FAQ_SPECIALTY env var (default 'neuro').
 * See PRD §11.1 (specialty portability).
 */

import neuroSeed from '@/data/faq/neuro-faq-seed.json'
import oabSeed from '@/data/faq/oab-faq-seed.json'
import type { FaqEntry, RedFlagBank, SpecialtyConfig, SpecialtyId } from './types'

// ── Cross-specialty shared banks (apply to EVERY specialty) ──────────────────

/** Self-harm / harm-to-others — universal. Seeded from useRealtimeSession SAFETY_KEYWORDS. */
export const SHARED_SELF_HARM: RedFlagBank = {
  category: 'self_harm',
  selfHarm: true,
  patterns: [
    /kill myself/, /want to die/, /hurt myself/, /end my life/,
    /\bsuicid/, /self-?harm/, /don'?t want to (live|be here)/,
    /hurt someone/, /kill someone/,
  ],
}

/** Generic acute emergencies — universal. */
export const SHARED_ACUTE: RedFlagBank = {
  category: 'acute',
  patterns: [
    /can'?t breathe/, /chest pain/, /passing out/, /unconscious/,
    /unresponsive/, /getting worse (fast|quickly)/,
  ],
}

/** Out-of-scope (clinical judgment) — same across specialties. */
export const SHARED_OUT_OF_SCOPE: RegExp[] = [
  /change my (dose|dosage|medication)/, /(increase|decrease|double) my (dose|medication)/,
  /skip my (pill|dose|medication)/, /stop taking my/,
  /should i (go to|stop|start|take|change)/,
  /is my .* getting worse/, /do i (still )?need (my|the)/,
  /is this (a )?side effect/, /is this normal for my/,
]

// ── Neuro-specific banks ─────────────────────────────────────────────────────

const NEURO_STROKE: RedFlagBank = {
  category: 'stroke',
  patterns: [
    /face (is )?(drooping|droop|numb)/, /one side (of my|is)/,
    /slurred speech/, /can'?t (speak|talk|understand|see)/,
    /sudden (numbness|weakness|vision|dizziness)/,
    /weak(ness)? in my (arm|leg|face)/, /can'?t (lift|move) my (arm|leg)/,
    /lost (my )?(vision|balance)/, /worst headache of my life/,
    /thunderclap/, /sudden severe headache/, /am i having a stroke/,
  ],
}

const NEURO_SEIZURE: RedFlagBank = {
  category: 'seizure',
  patterns: [
    /having a seizure/, /won'?t stop shaking/, /seizure won'?t stop/,
    /\bseizing\b/, /convulsing/, /seizure (lasting|longer than|for more than)/,
    /back to back seizures/, /won'?t wake up/,
  ],
}

// ── Urology / OAB-specific banks ─────────────────────────────────────────────

const URO_RETENTION: RedFlagBank = {
  category: 'urinary_retention',
  patterns: [
    /can'?t (urinate|pee|go|pass urine)/, /unable to (urinate|pee|pass urine)/,
    /nothing (comes|is coming) out/, /bladder (is )?(full|bursting)/,
    /haven'?t (peed|urinated) (all day|in hours)/,
  ],
}

const URO_HEMATURIA: RedFlagBank = {
  category: 'gross_hematuria',
  patterns: [
    /blood in my (urine|pee)/, /passing (blood )?clots/, /peeing blood/,
    /urine is (red|bloody)/,
  ],
}

const URO_UROSEPSIS: RedFlagBank = {
  category: 'urosepsis',
  patterns: [
    /fever (and|with) (flank|back|side) pain/, /(flank|back|side) pain (and|with) (fever|chills)/,
    /chills and (back|flank) pain/, /shaking chills/,
  ],
}

// ── Registry ─────────────────────────────────────────────────────────────────

export const SPECIALTIES: Record<SpecialtyId, SpecialtyConfig> = {
  neuro: {
    id: 'neuro',
    label: 'Neurology',
    redFlagBanks: [NEURO_STROKE, NEURO_SEIZURE],
    outOfScopePatterns: [],
    corpus: (neuroSeed as { entries: FaqEntry[] }).entries,
  },
  oab: {
    id: 'oab',
    label: 'Urology / Overactive Bladder',
    redFlagBanks: [URO_RETENTION, URO_HEMATURIA, URO_UROSEPSIS],
    outOfScopePatterns: [],
    corpus: (oabSeed as { entries: FaqEntry[] }).entries,
  },
}

export function getActiveSpecialtyId(): SpecialtyId {
  const env = (process.env.FAQ_SPECIALTY || 'neuro').toLowerCase()
  return env === 'oab' ? 'oab' : 'neuro'
}

export function getActiveSpecialty(): SpecialtyConfig {
  return SPECIALTIES[getActiveSpecialtyId()]
}

/** All red-flag banks for a specialty: shared self-harm + acute, then specialty-specific. */
export function getRedFlagBanks(cfg: SpecialtyConfig): RedFlagBank[] {
  return [SHARED_SELF_HARM, SHARED_ACUTE, ...cfg.redFlagBanks]
}

/** All out-of-scope patterns for a specialty: shared + specialty-specific. */
export function getOutOfScopePatterns(cfg: SpecialtyConfig): RegExp[] {
  return [...SHARED_OUT_OF_SCOPE, ...cfg.outOfScopePatterns]
}
