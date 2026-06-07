import { NEURO_FORMULARY } from '@/lib/neuroFormulary'

// =============================================================================
// Sevaro Clinical — ASR Vocabulary Biasing Lexicon
// -----------------------------------------------------------------------------
// General-purpose ASR is weakest on exactly the words that matter most in a
// neurology encounter: drug names, anatomy/symptom terminology, scale names,
// and patient/provider names. A misheard medication or dose is a clinical
// safety issue, not just a transcription-quality one.
//
// This module is the single source of truth for the terms we bias the
// transcription models toward. It feeds:
//   - OpenAI Realtime / Whisper transcription via a `prompt` string
//     (Historian, Intake, Follow-Up voice)
//   - Deepgram Nova-3 via a `keyterm` array (post-recording dictation)
//
// Spec: docs/plans/2026-06-07-asr-vocabulary-biasing-spec.md
// =============================================================================

/**
 * High-stakes neurology terms that general ASR commonly mistranscribes.
 * Drug names come from NEURO_FORMULARY (see getStaticClinicalTerms); this list
 * covers scales/tests, symptoms/exam findings, conditions, and neuroanatomy.
 *
 * Ordered most-valuable-first (scales + cardinal symptoms ahead of rarer exam
 * findings and anatomy) because callers truncate to a budget.
 */
const NEURO_TERMS: readonly string[] = [
  // Scales / tests / procedures (compact, frequently named in intake)
  'MoCA', 'Mini-Cog', 'PHQ-9', 'GAD-7', 'MIDAS', 'HIT-6', 'Epworth', 'MMSE',
  'NIHSS', 'UPDRS', 'EDSS', 'lumbar puncture', 'electromyography',
  'nerve conduction study', 'electroencephalogram',
  // Cardinal / common symptoms
  'migraine', 'vertigo', 'syncope', 'diplopia', 'dysarthria', 'dysphagia',
  'aphasia', 'ataxia', 'paresthesia', 'nystagmus', 'neuropathy', 'radiculopathy',
  'photophobia', 'phonophobia', 'tremor', 'bradykinesia', 'dyskinesia',
  'dystonia', 'rigidity', 'spasticity', 'chorea', 'myoclonus',
  'status epilepticus',
  // Conditions
  'multiple sclerosis', "Parkinson's disease", 'myasthenia gravis',
  'Guillain-Barré syndrome', "Bell's palsy", 'trigeminal neuralgia',
  'essential tremor', "Huntington's disease", 'amyotrophic lateral sclerosis',
  'transient ischemic attack', 'subarachnoid hemorrhage',
  // Neuroanatomy + less common exam findings
  'trigeminal', 'occipital', 'optic neuritis', 'brainstem', 'cerebellum',
  'basal ganglia', 'thalamus', 'hippocampus', 'corpus callosum', 'cauda equina',
  'cranial nerve', 'hemiparesis', 'hemiplegia', 'paraparesis', 'fasciculations',
  'dysmetria', 'dysdiadochokinesia', 'hyperreflexia', 'hyporeflexia', 'clonus',
  'akathisia', 'allodynia', 'hyperalgesia', 'hypoesthesia', 'scotoma',
  'myelopathy', 'plexopathy',
]

/** Round-robin interleave so a budget-trim keeps a mix of both inputs. */
function interleave(a: readonly string[], b: readonly string[]): string[] {
  const out: string[] = []
  const max = Math.max(a.length, b.length)
  for (let i = 0; i < max; i++) {
    if (i < a.length) out.push(a[i])
    if (i < b.length) out.push(b[i])
  }
  return out
}

/** Approximate the token count of a string (~4 chars/token is the usual heuristic). */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

/** Case-insensitive de-dupe that preserves first-seen order. */
function dedupePreserveOrder(terms: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of terms) {
    const term = raw?.trim()
    if (!term) continue
    const key = term.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(term)
  }
  return out
}

/**
 * The static clinical lexicon: the curated neurology terminology and every
 * formulary drug (brand + generic), de-duped.
 *
 * The two categories are interleaved (most-valuable-first within each) because
 * callers truncate to a token/term budget — interleaving keeps a balanced mix
 * of symptoms/scales AND drug names rather than letting one category crowd out
 * the other. The patient's *own* drugs are hoisted ahead of all of this by
 * callers via `extraTerms`, so drug-name safety for the active session is
 * always prioritized; this list is the "background" vocabulary that fills the
 * remaining budget.
 */
export function getStaticClinicalTerms(): string[] {
  const medTerms = NEURO_FORMULARY.flatMap((item) => [item.name, item.generic_name])
  return dedupePreserveOrder(interleave(NEURO_TERMS, medTerms))
}

/**
 * Whisper / OpenAI Realtime transcription `prompt`. Whisper caps the prompt at
 * ~224 tokens, so we frame it briefly and pack terms until the budget is hit.
 * Session-specific `extraTerms` (patient/provider names, the patient's own
 * medication list) go FIRST so they survive truncation — they're the terms most
 * likely to be mistranscribed and most consequential.
 */
export function buildWhisperBiasPrompt(extraTerms: string[] = []): string {
  const frame = 'Neurology visit. Expect clinical terms such as:'
  const TOKEN_BUDGET = 220
  let budget = TOKEN_BUDGET - estimateTokens(frame)

  const ordered = dedupePreserveOrder([...extraTerms, ...getStaticClinicalTerms()])
  const kept: string[] = []
  for (const term of ordered) {
    const cost = estimateTokens(term) + 1 // +1 for the separator
    if (cost > budget) continue
    kept.push(term)
    budget -= cost
  }

  return `${frame} ${kept.join(', ')}.`
}

/**
 * Deepgram Nova-3 `keyterm` array (Keyterm Prompting, English/Nova-3 only).
 * Session-specific terms first, then the static lexicon, capped to keep the
 * request lean.
 */
export function buildDeepgramKeyterms(extraTerms: string[] = [], max = 100): string[] {
  const ordered = dedupePreserveOrder([...extraTerms, ...getStaticClinicalTerms()])
  return ordered.slice(0, max)
}

/**
 * Master switch for ASR vocabulary biasing. Enabled by default; set
 * ASR_VOCAB_BIASING to "false"/"0"/"off" to hot-revert without a code change
 * (e.g. if a transcription endpoint rejects the biasing field).
 */
export function isAsrBiasingEnabled(): boolean {
  const flag = process.env.ASR_VOCAB_BIASING?.trim().toLowerCase()
  return flag !== 'false' && flag !== '0' && flag !== 'off'
}
