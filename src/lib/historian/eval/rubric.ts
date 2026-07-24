/**
 * Load, validate, and select the clinician-vetted (eventually — see
 * "unvetted" below) thoroughness rubric files under
 * qa/historian-eval/rubric/ for the AI Historian thoroughness judge
 * (thoroughnessJudge.ts, Historian Validation Suite Task 3).
 *
 * Validator note (interpretation flagged per the task brief's escalation
 * instructions): the brief says to follow whatever JSON-Schema pattern
 * src/lib/triage/sentinel/catalog.ts already uses for cases.json. That file
 * does NOT use ajv (verified — ajv@6.14.0 is present only as an indirect,
 * undeclared transitive dependency, not a package.json dependency of this
 * app, and catalog.ts validates entirely by hand: isRecord/boundedString/
 * enumValue/fail-style helpers). This module follows that ACTUAL pattern
 * (hand-rolled structural validation, mirrored below) rather than adding
 * ajv as a new direct dependency. qa/historian-eval/rubric/rubric.schema.json
 * still exists as a real JSON-Schema document — it is the human-facing spec
 * or a future tooling target — but validateRubric() below is the runtime
 * enforcement, matching the repo's established convention.
 *
 * Loading strategy: rubric JSON files live under qa/ (outside src/), and
 * this module is imported from a live API route (the historian save route,
 * via thoroughnessJudge.ts) that runs in the AWS Amplify SSR Lambda. This
 * repo has an existing, documented gotcha for exactly this shape of problem
 * — see CLAUDE.md's rds-ca-bundle.ts note: "loose .pem files get dropped"
 * from the Lambda bundle when read via fs at runtime. Rather than
 * fs.readFileSync (untested/fragile for this bundling target — nothing in
 * src/ does this today), the rubric files are pulled in via static ES
 * `import … from '…/*.json'` (tsconfig has resolveJsonModule: true; Next's
 * bundler and Vitest/Vite both natively support JSON imports). This bakes
 * the rubric content into the compiled bundle at build time, sidestepping
 * the loose-file bundling problem entirely — the tradeoff is that editing a
 * rubric file requires a rebuild+redeploy to take effect, which is
 * appropriate for reviewed clinical content anyway.
 *
 * Fail-closed but NOT at module-eval time: a malformed rubric file throws
 * from ensureLoaded()/loadRubric() when actually called, never as a
 * side effect of `import`-ing this module. This matters because
 * thoroughnessJudge.ts (and transitively this module) is statically
 * imported at the top of the historian save route — a throw during module
 * evaluation would crash that route's module load entirely, defeating the
 * fail-open guarantee the whole eval pipeline depends on. The actual call
 * site (generateThoroughnessEvaluation, inside runThoroughnessJudge's
 * try/catch) is where a load failure is caught and logged, matching this
 * repo's established generate-can-throw/run-wrapper-catches split (see
 * finalDifferential.ts's TranscriptTooLargeError).
 */

import baseRubricJson from '../../../../qa/historian-eval/rubric/base-neuro-hpi.json'
import acuteStrokeJson from '../../../../qa/historian-eval/rubric/syndromes/acute-stroke.json'
import firstSeizureJson from '../../../../qa/historian-eval/rubric/syndromes/first-seizure.json'
import migraineChronicJson from '../../../../qa/historian-eval/rubric/syndromes/migraine-chronic.json'
import msRelapseJson from '../../../../qa/historian-eval/rubric/syndromes/ms-relapse.json'
import peripheralNeuropathyJson from '../../../../qa/historian-eval/rubric/syndromes/peripheral-neuropathy.json'

// ── Public types ─────────────────────────────────────────────────────────────

export type SyndromeId =
  | 'acute-stroke'
  | 'first-seizure'
  | 'migraine-chronic'
  | 'ms-relapse'
  | 'peripheral-neuropathy'

export const KNOWN_SYNDROMES: readonly SyndromeId[] = [
  'acute-stroke',
  'first-seizure',
  'migraine-chronic',
  'ms-relapse',
  'peripheral-neuropathy',
]

export type RubricSeverity = 'critical' | 'important' | 'minor'

export type RubricDimension =
  | 'oldcarts'
  | 'red_flags'
  | 'pmh_meds_allergies'
  | 'fh_sh'
  | 'question_quality'
  | 'closure'

const KNOWN_SEVERITIES: readonly RubricSeverity[] = ['critical', 'important', 'minor']
const KNOWN_DIMENSIONS: readonly RubricDimension[] = [
  'oldcarts',
  'red_flags',
  'pmh_meds_allergies',
  'fh_sh',
  'question_quality',
  'closure',
]

export interface RubricCriticalQuestion {
  id: string
  question: string
  severity: RubricSeverity
  /**
   * Optional 2-5 conservative lexical substrings (see
   * qa/historian-eval/rubric/rubric.schema.json for the full contract).
   * Populated only on some severity:'critical' items in the syndrome
   * files. Consumed by deterministicChecks.ts's computeCriticalCoverage as
   * an independent, imperfect coverage screen — thoroughnessJudge.ts never
   * clamps the judge's score on this alone (see its trust-boundary
   * comment); it only surfaces a coverage_disagreement signal.
   */
  coverage_hints?: string[]
}

export interface RubricFile {
  version: string
  syndrome: SyndromeId | null
  vetted_by: string | null
  vetted_date: string | null
  critical_questions: RubricCriticalQuestion[]
  expected_dimensions: RubricDimension[]
}

export interface LoadedRubric {
  base: RubricFile
  syndrome: RubricFile | null
  syndromeId: SyndromeId | null
  /** True when the base rubric OR the selected syndrome rubric (if any) has vetted_by === null. */
  unvetted: boolean
  /** Combined provenance id — "base.version" alone, or "base.version+syndrome.version". */
  rubricVersion: string
  /** base's critical_questions followed by syndrome's (if any), each tagged with its origin. */
  criticalQuestions: (RubricCriticalQuestion & { source: 'base' | 'syndrome' })[]
}

/**
 * Plain-English disease-name synonyms per syndrome, used by
 * deterministicChecks.ts to build its diagnosis-leak lexicon
 * ("disease names from rubric syndromes" per the task brief) — sourced
 * from this module rather than re-hardcoded, since this is the module that
 * owns syndrome identity.
 */
export const SYNDROME_DISEASE_NAMES: Record<SyndromeId, string[]> = {
  'acute-stroke': ['stroke', 'cerebrovascular accident', 'cva', 'tia'],
  'first-seizure': ['seizure disorder', 'epilepsy', 'seizures'],
  'migraine-chronic': ['migraine', 'migraines'],
  'ms-relapse': ['multiple sclerosis', 'ms relapse'],
  'peripheral-neuropathy': ['neuropathy', 'peripheral neuropathy'],
}

// ── Hand-rolled structural validation (mirrors src/lib/triage/sentinel/catalog.ts) ──

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function fail(path: string, reason: string): never {
  throw new Error(`Invalid rubric ${path}: ${reason}`)
}

/** additionalProperties:false enforcement (mirrors rubric.schema.json) — rejects any key not in `allowedKeys`. */
function assertNoUnknownKeys(value: Record<string, unknown>, allowedKeys: readonly string[], path: string): void {
  for (const key of Object.keys(value)) {
    if (!allowedKeys.includes(key)) {
      fail(path, `has unrecognized property "${key}"`)
    }
  }
}

const TOP_LEVEL_KEYS = [
  '_note',
  'version',
  'syndrome',
  'vetted_by',
  'vetted_date',
  'critical_questions',
  'expected_dimensions',
] as const

const CRITICAL_QUESTION_KEYS = ['id', 'question', 'severity', 'coverage_hints'] as const

const REQUIRED_NOTE = '[training knowledge — Steve to vet]'

/**
 * Validate an unknown JSON value against the rubric shape (see
 * qa/historian-eval/rubric/rubric.schema.json for the human-readable spec
 * this mirrors). Throws a descriptive Error on any structural problem;
 * never silently coerces bad clinical content into something plausible.
 */
export function validateRubric(value: unknown, sourceLabel: string): RubricFile {
  if (!isRecord(value)) fail(sourceLabel, 'must be an object')
  assertNoUnknownKeys(value, TOP_LEVEL_KEYS, sourceLabel)

  if (value._note !== REQUIRED_NOTE) {
    fail(`${sourceLabel}._note`, `must be the literal string "${REQUIRED_NOTE}"`)
  }

  if (typeof value.version !== 'string' || !/^[a-z][a-z0-9-]*-v[0-9]+$/.test(value.version)) {
    fail(`${sourceLabel}.version`, 'must be a string matching <slug>-v<N>, e.g. "stroke-v1"')
  }

  const syndromeRaw = value.syndrome
  if (
    syndromeRaw !== null &&
    !(typeof syndromeRaw === 'string' && (KNOWN_SYNDROMES as readonly string[]).includes(syndromeRaw))
  ) {
    fail(`${sourceLabel}.syndrome`, `must be null or one of ${KNOWN_SYNDROMES.join(', ')}`)
  }

  if (value.vetted_by !== null && typeof value.vetted_by !== 'string') {
    fail(`${sourceLabel}.vetted_by`, 'must be null or a string')
  }

  if (
    value.vetted_date !== null &&
    (typeof value.vetted_date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value.vetted_date))
  ) {
    fail(`${sourceLabel}.vetted_date`, 'must be null or an ISO date string (YYYY-MM-DD)')
  }

  if (!Array.isArray(value.critical_questions) || value.critical_questions.length === 0) {
    fail(`${sourceLabel}.critical_questions`, 'must be a non-empty array')
  }
  const seenIds = new Set<string>()
  const critical_questions: RubricCriticalQuestion[] = value.critical_questions.map((raw, i) => {
    const path = `${sourceLabel}.critical_questions[${i}]`
    if (!isRecord(raw)) fail(path, 'must be an object')
    assertNoUnknownKeys(raw, CRITICAL_QUESTION_KEYS, path)
    if (typeof raw.id !== 'string' || !/^[a-z][a-z0-9-]*$/.test(raw.id)) {
      fail(`${path}.id`, 'must be a lowercase-kebab-case string')
    }
    if (seenIds.has(raw.id)) fail(`${path}.id`, `duplicate id "${raw.id}" within ${sourceLabel}`)
    seenIds.add(raw.id)
    if (typeof raw.question !== 'string' || !raw.question.trim()) {
      fail(`${path}.question`, 'must be a non-empty string')
    }
    if (typeof raw.severity !== 'string' || !(KNOWN_SEVERITIES as readonly string[]).includes(raw.severity)) {
      fail(`${path}.severity`, `must be one of ${KNOWN_SEVERITIES.join(', ')}`)
    }

    let coverage_hints: string[] | undefined
    if (raw.coverage_hints !== undefined) {
      if (!Array.isArray(raw.coverage_hints) || raw.coverage_hints.length < 2 || raw.coverage_hints.length > 5) {
        fail(`${path}.coverage_hints`, 'must be an array of 2 to 5 strings when present')
      }
      coverage_hints = raw.coverage_hints.map((h: unknown, hi: number) => {
        if (typeof h !== 'string' || !h.trim()) {
          fail(`${path}.coverage_hints[${hi}]`, 'must be a non-empty string')
        }
        return h
      })
    }

    return {
      id: raw.id,
      question: raw.question,
      severity: raw.severity as RubricSeverity,
      ...(coverage_hints ? { coverage_hints } : {}),
    }
  })

  if (!Array.isArray(value.expected_dimensions) || value.expected_dimensions.length === 0) {
    fail(`${sourceLabel}.expected_dimensions`, 'must be a non-empty array')
  }
  const seenDims = new Set<string>()
  const expected_dimensions: RubricDimension[] = value.expected_dimensions.map((raw, i) => {
    const path = `${sourceLabel}.expected_dimensions[${i}]`
    if (typeof raw !== 'string' || !(KNOWN_DIMENSIONS as readonly string[]).includes(raw)) {
      fail(path, `must be one of ${KNOWN_DIMENSIONS.join(', ')}`)
    }
    if (seenDims.has(raw)) fail(path, `duplicate dimension "${raw}"`)
    seenDims.add(raw)
    return raw as RubricDimension
  })

  return {
    version: value.version,
    syndrome: syndromeRaw as SyndromeId | null,
    vetted_by: value.vetted_by as string | null,
    vetted_date: value.vetted_date as string | null,
    critical_questions,
    expected_dimensions,
  }
}

/**
 * Throws if two entries share a `version` string (review fix, minor b) —
 * rubric_version is a stable provenance id (historian_evaluations.
 * rubric_version); a collision would make two DIFFERENT rubric contents
 * indistinguishable in that column. Exported so it's independently unit-
 * testable with a synthetic duplicate (rubric.test.ts) in addition to
 * being enforced for real by ensureLoaded() below on every real load.
 */
export function assertUniqueRubricVersions(entries: { label: string; version: string }[]): void {
  const seen = new Map<string, string>()
  for (const entry of entries) {
    const existing = seen.get(entry.version)
    if (existing) {
      fail(
        'rubric versions',
        `duplicate version "${entry.version}" used by both "${existing}" and "${entry.label}"`,
      )
    }
    seen.set(entry.version, entry.label)
  }
}

// ── Lazy, memoized load of the real files (see module doc for why this is
//    not eager module-eval-time validation) ─────────────────────────────────

let _base: RubricFile | null = null
let _syndromes: Record<SyndromeId, RubricFile> | null = null
let _loadError: Error | null = null

function ensureLoaded(): { base: RubricFile; syndromes: Record<SyndromeId, RubricFile> } {
  if (_base && _syndromes) return { base: _base, syndromes: _syndromes }
  if (_loadError) throw _loadError
  try {
    const base = validateRubric(baseRubricJson, 'qa/historian-eval/rubric/base-neuro-hpi.json')
    const syndromes: Record<SyndromeId, RubricFile> = {
      'acute-stroke': validateRubric(
        acuteStrokeJson,
        'qa/historian-eval/rubric/syndromes/acute-stroke.json',
      ),
      'first-seizure': validateRubric(
        firstSeizureJson,
        'qa/historian-eval/rubric/syndromes/first-seizure.json',
      ),
      'migraine-chronic': validateRubric(
        migraineChronicJson,
        'qa/historian-eval/rubric/syndromes/migraine-chronic.json',
      ),
      'ms-relapse': validateRubric(msRelapseJson, 'qa/historian-eval/rubric/syndromes/ms-relapse.json'),
      'peripheral-neuropathy': validateRubric(
        peripheralNeuropathyJson,
        'qa/historian-eval/rubric/syndromes/peripheral-neuropathy.json',
      ),
    }
    assertUniqueRubricVersions([
      { label: 'base-neuro-hpi.json', version: base.version },
      ...KNOWN_SYNDROMES.map((id) => ({ label: `syndromes/${id}.json`, version: syndromes[id].version })),
    ])
    _base = base
    _syndromes = syndromes
    return { base, syndromes }
  } catch (err) {
    _loadError = err instanceof Error ? err : new Error(String(err))
    throw _loadError
  }
}

/** Every rubric file (base + each syndrome), for enumeration/testing/tooling. */
export function listAllRubricFiles(): { label: string; rubric: RubricFile }[] {
  const { base, syndromes } = ensureLoaded()
  return [
    { label: 'base-neuro-hpi.json', rubric: base },
    ...KNOWN_SYNDROMES.map((id) => ({ label: `syndromes/${id}.json`, rubric: syndromes[id] })),
  ]
}

// ── Syndrome detection from a chief-complaint string ─────────────────────────

/**
 * Keyword lists used only to PICK a syndrome rubric from free-text chief
 * complaint — not clinical content itself, so not subject to the
 * vetted-rubric-content rules above. Deliberately conservative: ties or a
 * zero-hit chief complaint fall back to base-only (see detectSyndrome)
 * rather than guessing.
 */
const SYNDROME_KEYWORDS: Record<SyndromeId, string[]> = {
  'acute-stroke': [
    'stroke',
    'weakness',
    'slurred',
    'slurring',
    'facial droop',
    'droop',
    'difficulty speaking',
    'trouble speaking',
    'garbled speech',
    'numbness on one side',
    'weakness on one side',
    'one-sided',
    'tia',
    'hemiparesis',
  ],
  'first-seizure': [
    'seizure',
    'convulsion',
    'convulsing',
    'shaking all over',
    'shaking',
    'blacked out',
    'loss of consciousness',
    'jerking',
    "don't remember",
    'tongue',
  ],
  'migraine-chronic': ['headache', 'migraine'],
  'ms-relapse': [
    'bladder',
    'optic neuritis',
    'vision loss',
    'multiple sclerosis',
    'numbness',
    'tingling',
    'legs',
  ],
  'peripheral-neuropathy': ['neuropathy', 'burning', 'feet', 'stocking', 'glove', 'numbness', 'tingling'],
}

/**
 * Score every known syndrome's keyword list against a chief-complaint
 * string (case-insensitive substring match, unique-keyword-hit count).
 * Returns the single best-scoring syndrome, or null when there are zero
 * hits or a tie for the best score (ambiguous — caller falls back to the
 * base rubric alone rather than guessing wrong).
 */
export function detectSyndrome(chiefComplaint: string | undefined | null): SyndromeId | null {
  if (!chiefComplaint || !chiefComplaint.trim()) return null
  const text = chiefComplaint.toLowerCase()

  let best: SyndromeId | null = null
  let bestScore = 0
  let tied = false

  for (const syndrome of KNOWN_SYNDROMES) {
    const score = SYNDROME_KEYWORDS[syndrome].reduce(
      (acc, kw) => acc + (text.includes(kw.toLowerCase()) ? 1 : 0),
      0,
    )
    if (score > bestScore) {
      best = syndrome
      bestScore = score
      tied = false
    } else if (score > 0 && score === bestScore) {
      tied = true
    }
  }

  return bestScore === 0 || tied ? null : best
}

// ── Public loader ─────────────────────────────────────────────────────────────

function isKnownSyndrome(value: string): value is SyndromeId {
  return (KNOWN_SYNDROMES as readonly string[]).includes(value)
}

/**
 * Load the base rubric plus (when resolvable) one syndrome rubric.
 *
 * Selection: an explicit, recognized `syndrome` id wins; otherwise falls
 * back to chiefComplaint-based detectSyndrome(); otherwise base-only.
 */
export function loadRubric(input: { syndrome?: string; chiefComplaint?: string } = {}): LoadedRubric {
  const { base, syndromes } = ensureLoaded()

  let syndromeId: SyndromeId | null = null
  if (input.syndrome && isKnownSyndrome(input.syndrome)) {
    syndromeId = input.syndrome
  } else if (input.chiefComplaint) {
    syndromeId = detectSyndrome(input.chiefComplaint)
  }

  const syndrome = syndromeId ? syndromes[syndromeId] : null
  const unvetted = base.vetted_by === null || (syndrome ? syndrome.vetted_by === null : false)
  const rubricVersion = syndrome ? `${base.version}+${syndrome.version}` : base.version

  const criticalQuestions: (RubricCriticalQuestion & { source: 'base' | 'syndrome' })[] = [
    ...base.critical_questions.map((q) => ({ ...q, source: 'base' as const })),
    ...(syndrome ? syndrome.critical_questions.map((q) => ({ ...q, source: 'syndrome' as const })) : []),
  ]

  return { base, syndrome, syndromeId, unvetted, rubricVersion, criticalQuestions }
}
