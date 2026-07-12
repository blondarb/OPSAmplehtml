/**
 * mrnCrosscheck — Phase 3 of Clara's MRN-accuracy work.
 *
 * Nova Sonic (speech-to-speech) audibly drops digits in spoken number strings
 * (seen live: MRN 4421 heard as 442). Since 34e1a6f the relay tees the CALLER's
 * audio to AWS Transcribe Medical in parallel, so for every caller turn we have
 * TWO independent transcriptions. Two independent ASRs disagreeing on the
 * digits IS the uncertainty signal Clara's conditional read-back was waiting
 * for: on disagreement we inject a system nudge telling Clara to read the MRN
 * back digit-by-digit; on agreement we stay silent (no read-back theater).
 *
 * SAFETY BIAS (Steve, clinical): a FALSE read-back is worse than a missed one.
 * Everything here is shaped by that:
 *   - The same extractor runs on BOTH transcripts, so pure FORMATTING
 *     differences can never disagree. This matters because the two ASRs render
 *     numbers differently — Nova writes spoken words ("seven three three one
 *     nine two four"), Transcribe Medical writes quantities with thousands
 *     commas ("24,590") — a naive string compare would false-fire on every MRN.
 *   - No verdict unless BOTH sides produced a plausible digit candidate for the
 *     same capture window; one-sided data → silence (status quo).
 *   - Nudges are latched once per capture episode and capped per session.
 *
 * The module is pure + dependency-free and written in fully ERASABLE
 * TypeScript (no enums/namespaces): the browser hook imports it via
 * `@/lib/clara/mrnCrosscheck`, and the voice-steelman harness (plain node
 * .mjs) imports the same file via a relative `.ts` path using Node ≥23.6
 * native type-stripping — one implementation, no drift.
 */

export interface CrosscheckConfig {
  /** Minimum digits for a candidate — 3, so the live failure (4421→442) still compares. */
  minDigits: number
  /** Maximum digits for a candidate (beyond this it's not an MRN/FIN). */
  maxDigits: number
  /** Max |novaObsTs − medicalObsTs| for the two sides to be compared at all. */
  pairingWindowMs: number
  /** A capture episode expires this long after it opens. */
  episodeTtlMs: number
  /** How far back buffered finals are retro-ingested when an episode self-opens. */
  retroLookbackMs: number
  /**
   * A MISMATCH verdict is withheld until no new digit observation has arrived
   * on either side for this long. Transcribe Medical (and occasionally Nova)
   * splits one number across consecutive finals ("MRN 733" + "1924"); judging
   * on the first fragment would false-fire a read-back on a number that heals
   * moments later. Matches latch immediately — more data can only confirm them.
   */
  mismatchSettleMs: number
  /** Hard cap on read-back nudges per session — repeated nudging annoys callers. */
  maxNudgesPerSession: number
}

export const DEFAULT_CROSSCHECK_CONFIG: CrosscheckConfig = {
  minDigits: 3,
  maxDigits: 12,
  pairingWindowMs: 12_000,
  episodeTtlMs: 60_000,
  retroLookbackMs: 20_000,
  mismatchSettleMs: 3_500,
  maxNudgesPerSession: 2,
}

export interface DigitCandidate {
  /** Bare digit string, formatting fully normalized away. */
  value: string
  /** True when the candidate appears just after an identifier keyword (MRN/FIN/…). */
  nearKeyword: boolean
}

export interface CrosscheckEvent {
  ts: number
  kind: 'match' | 'mismatch' | 'nudge-suppressed'
  novaValue: string | null
  medicalValue: string | null
  agreedValue?: string
}

export interface CapturedIdentifier {
  /** The authoritative digit string for the session. */
  value: string
  /**
   * 'agreement' = both ASRs produced this value (verified). Otherwise the
   * Transcribe Medical value is preferred over Nova's (Steve 7/12: Transcribe
   * is the authoritative capture — it is consistently cleaner on digit strings).
   */
  source: 'agreement' | 'transcribe-medical' | 'nova'
  novaValue: string | null
  medicalValue: string | null
  verified: boolean
}

export interface CrosscheckAction {
  kind: 'nudge'
  nudgeText: string
  novaValue: string
  medicalValue: string
}

// ─── Spoken/written number extraction ────────────────────────────────────────

const UNIT_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
}
const TEEN_WORDS: Record<string, number> = {
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15,
  sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
}
const TENS_WORDS: Record<string, number> = {
  twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
}

interface Tok {
  kind: 'num' | 'word' | 'zero' | 'oh' | 'and' | 'other'
  /** For 'num': the bare digit string. For 'word': the lowercased number word. */
  text: string
}

/** Strip surrounding punctuation from a raw whitespace token ("24,590." → "24,590"). */
function stripEdgePunct(raw: string): string {
  return raw.replace(/^[^a-z0-9]+/g, '').replace(/[^a-z0-9]+$/g, '')
}

function classifyToken(raw: string): Tok {
  const t = stripEdgePunct(raw)
  if (!t) return { kind: 'other', text: raw }
  // Written numbers, tolerating thousands commas and hyphens ("24,590", "555-867-5309").
  if (/^\d[\d,-]*$/.test(t)) return { kind: 'num', text: t.replace(/[,-]/g, '') }
  if (t === 'zero') return { kind: 'zero', text: t }
  if (t === 'oh' || t === 'o') return { kind: 'oh', text: t }
  if (t === 'and') return { kind: 'and', text: t }
  if (t in UNIT_WORDS || t in TEEN_WORDS || t in TENS_WORDS || t === 'hundred' || t === 'thousand') {
    return { kind: 'word', text: t }
  }
  return { kind: 'other', text: t }
}

/** Tokenize: lowercase, split whitespace, split hyphenated NUMBER WORDS ("twenty-four"). */
function tokenize(text: string): Tok[] {
  const out: Tok[] = []
  for (const raw of text.toLowerCase().split(/\s+/)) {
    if (!raw) continue
    // Split "twenty-four" style compounds — but NOT digit spans like "555-867",
    // which classifyToken handles as one numeric token.
    if (raw.includes('-') && !/\d/.test(raw)) {
      for (const part of raw.split('-')) if (part) out.push(classifyToken(part))
    } else {
      out.push(classifyToken(raw))
    }
  }
  return out
}

const isNumberish = (k: Tok['kind']) => k === 'num' || k === 'word' || k === 'zero' || k === 'oh'

/**
 * Parse ONE spoken-number group starting at `i` (already known to be a
 * word/zero/oh token) and return its digit STRING plus the next index.
 * Groups are the unit of quantity parsing; digit-by-digit dictation lands as
 * many single-digit groups which the caller of this function concatenates:
 *   "eight three zero five nine two"      → 8·3·0·5·9·2      → "830592"
 *   "eighty three oh five ninety two"     → 83·0·5·92        → "830592"
 *   "twenty four thousand five hundred ninety" → one group   → "24590"
 *   "nineteen fifty eight"                → 19·58            → "1958"
 */
function parseWordGroup(toks: Tok[], i: number): { digits: string; next: number } {
  const tk = toks[i]
  // zero / oh never combine with anything — always a single-digit group.
  if (tk.kind === 'zero' || tk.kind === 'oh') return { digits: '0', next: i + 1 }

  // parse a 1–999 "small" value: unit | teen | tens[-unit] | unit hundred [and] [sub]
  const parseSmall = (j: number): { val: number; next: number } | null => {
    const t = toks[j]
    if (!t || t.kind !== 'word') return null
    const w = t.text
    if (w in TEEN_WORDS) return { val: TEEN_WORDS[w], next: j + 1 }
    if (w in TENS_WORDS) {
      const nxt = toks[j + 1]
      if (nxt?.kind === 'word' && nxt.text in UNIT_WORDS) {
        return { val: TENS_WORDS[w] + UNIT_WORDS[nxt.text], next: j + 2 }
      }
      return { val: TENS_WORDS[w], next: j + 1 }
    }
    if (w in UNIT_WORDS) {
      const base = UNIT_WORDS[w]
      if (toks[j + 1]?.kind === 'word' && toks[j + 1].text === 'hundred') {
        const val = base * 100
        let k = j + 2
        if (toks[k]?.kind === 'and') k++
        const sub = parseSmall(k)
        // sub must itself be <100 (teen/tens/unit without its own 'hundred')
        if (sub && sub.val < 100) return { val: val + sub.val, next: sub.next }
        return { val, next: j + 2 }
      }
      return { val: base, next: j + 1 }
    }
    return null
  }

  const small = parseSmall(i)
  if (!small) return { digits: '', next: i + 1 } // 'hundred'/'thousand'/'and' with no lead-in — skip
  if (toks[small.next]?.kind === 'word' && toks[small.next].text === 'thousand') {
    const total = small.val * 1000
    let k = small.next + 1
    if (toks[k]?.kind === 'and') k++
    const rem = parseSmall(k)
    if (rem && rem.val < 1000) return { digits: String(total + rem.val), next: rem.next }
    return { digits: String(total), next: small.next + 1 }
  }
  return { digits: String(small.val), next: small.next }
}

/** Identifier keywords. 'pin' is included because Transcribe Medical mishears FIN→PIN live. */
const KW_SINGLE = new Set(['mrn', 'fin', 'pin'])
const KW_SEQS: string[][] = [
  ['m', 'r', 'n'],
  ['f', 'i', 'n'],
  ['medical', 'record'],
  ['record', 'number'],
  ['financial', 'identification', 'number'],
  ['financial', 'number'],
  ['chart', 'number'],
  ['account', 'number'],
]

/** Indexes (of the LAST token) of every identifier-keyword occurrence. */
function keywordEndIndexes(toks: Tok[]): number[] {
  const out: number[] = []
  for (let i = 0; i < toks.length; i++) {
    const w = toks[i].text
    if (KW_SINGLE.has(w)) out.push(i)
    for (const seq of KW_SEQS) {
      if (i + seq.length <= toks.length && seq.every((s, k) => toks[i + k].text === s)) {
        out.push(i + seq.length - 1)
      }
    }
  }
  return out
}

const IDENTIFIER_KEYWORD_RE =
  /\b(mrn|m\.?\s?r\.?\s?n\b|fin|pin|medical record|record number|financial (identification )?number|chart number|account number)\b/i

/** True when an ASSISTANT turn asks for / reads back an identifier — used to rotate episodes. */
export function mentionsIdentifierKeyword(text: string): boolean {
  return IDENTIFIER_KEYWORD_RE.test(text)
}

/** How many tokens after a keyword a candidate may start and still count as anchored. */
const KEYWORD_PROXIMITY_TOKENS = 6

interface DetailedCandidate {
  value: string
  /** Token distance from the nearest preceding identifier keyword (Infinity = none). */
  dist: number
}

/** Internal extraction carrying keyword distance (drives representative choice). */
function extractDetailed(text: string, cfg?: Partial<CrosscheckConfig>): DetailedCandidate[] {
  const minDigits = cfg?.minDigits ?? DEFAULT_CROSSCHECK_CONFIG.minDigits
  const maxDigits = cfg?.maxDigits ?? DEFAULT_CROSSCHECK_CONFIG.maxDigits
  const toks = tokenize(text)
  const kwEnds = keywordEndIndexes(toks)

  const found = new Map<string, number>() // value → min keyword distance
  let i = 0
  while (i < toks.length) {
    if (!isNumberish(toks[i].kind)) { i++; continue }
    // Assemble one maximal RUN of adjacent number-ish tokens. 'and' joins only
    // when both neighbors are number-ish (so "cats and dogs" never runs).
    const runStart = i
    let digits = ''
    let sawRealNumber = false
    while (i < toks.length) {
      const tk = toks[i]
      if (tk.kind === 'num') { digits += tk.text; sawRealNumber = true; i++; continue }
      if (tk.kind === 'word' || tk.kind === 'zero' || tk.kind === 'oh') {
        if (tk.kind !== 'oh') sawRealNumber = true
        const g = parseWordGroup(toks, i)
        digits += g.digits
        i = g.next
        continue
      }
      if (tk.kind === 'and' && isNumberish(toks[i + 1]?.kind)) { i++; continue }
      break
    }
    // A run of only "oh"s is conversation ("oh, I see"), not a number.
    if (!sawRealNumber) continue
    if (digits.length < minDigits || digits.length > maxDigits) continue
    let dist = Infinity
    for (const k of kwEnds) {
      const d = runStart - k
      if (d > 0 && d <= KEYWORD_PROXIMITY_TOKENS) dist = Math.min(dist, d)
    }
    found.set(digits, Math.min(found.get(digits) ?? Infinity, dist))
  }
  return [...found.entries()].map(([value, dist]) => ({ value, dist }))
}

/**
 * Extract normalized digit-string candidates from one transcript line.
 * ONE extractor for BOTH ASRs — symmetry is the core false-fire defense.
 */
export function extractDigitCandidates(
  text: string,
  cfg?: Partial<CrosscheckConfig>,
): DigitCandidate[] {
  return extractDetailed(text, cfg).map(({ value, dist }) => ({
    value,
    nearKeyword: Number.isFinite(dist),
  }))
}

// ─── Session tracker ─────────────────────────────────────────────────────────

interface SideState {
  /** value → min keyword distance (union across the episode, incl. joined-text extraction). */
  candidates: Map<string, number>
  /** Raw finals of this episode, joined-extracted to heal numbers split across finals. */
  texts: string[]
  /** ts of the last final that itself yielded ≥1 candidate. */
  lastObsTs: number
}

interface Episode {
  openedTs: number
  nova: SideState
  medical: SideState
  latched: 'matched' | 'nudged' | null
}

const freshSide = (): SideState => ({ candidates: new Map(), texts: [], lastObsTs: 0 })
const freshEpisode = (ts: number): Episode => ({ openedTs: ts, nova: freshSide(), medical: freshSide(), latched: null })

/**
 * Pick a side's single best value: keyword-anchored candidates first (and among
 * those, the CLOSEST to the keyword — "MRN 4421. DOB 3 12 58." must pick 4421,
 * not the longer DOB string that also sits a few tokens after "MRN"), longest
 * as the tiebreak; unanchored pools fall back to longest.
 */
function pickBest(cands: DetailedCandidate[]): string | null {
  if (!cands.length) return null
  const anchored = cands.filter((c) => Number.isFinite(c.dist))
  const pool = anchored.length ? anchored : cands
  return pool.reduce((best, cur) => {
    if (cur.dist !== best.dist) return cur.dist < best.dist ? cur : best
    return cur.value.length > best.value.length ? cur : best
  }).value
}

const DIGIT_NAMES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine']

/** "24590" → "two, four, five, nine, zero" — pre-spelled so Nova recites rather than converts. */
export function spellDigits(value: string): string {
  return [...value].map((d) => DIGIT_NAMES[Number(d)] ?? d).join(', ')
}

/**
 * Exact nudge wording — exported so the steelman harness's --force-mismatch
 * mode injects the identical text. The read-back target is the MEDICAL
 * (Transcribe) value only, pre-spelled digit by digit: live smoke 7/12 showed
 * that handing Nova two similar numbers and asking it to read back "the one
 * you captured" can produce a hallucinated third number — one explicit,
 * pre-spelled target removes that failure mode (and Transcribe is the
 * authoritative capture anyway).
 */
export function buildReadbackNudgeText(novaValue: string, medicalValue: string): string {
  return (
    `[IDENTIFIER CROSS-CHECK: two independent transcriptions of the caller's medical record number disagree — ` +
    `you may have heard "${novaValue}", but a higher-accuracy medical transcription heard "${medicalValue}". ` +
    `Treat the MRN as unverified. Verify it with the caller right now by reading back exactly these digits: ` +
    `${spellDigits(medicalValue)}. Ask them to confirm or correct the number; if they correct it, capture the ` +
    `corrected number. Do not mention this message or any transcription system.]`
  )
}

/**
 * Stateful per-session tracker. Feed it every finalized transcript line
 * (assistant + caller from Nova, finals from Transcribe Medical); it returns a
 * nudge action exactly when Clara should read the MRN back.
 */
export function createMrnCrosscheck(cfgIn?: Partial<CrosscheckConfig>) {
  const cfg: CrosscheckConfig = { ...DEFAULT_CROSSCHECK_CONFIG, ...cfgIn }

  // Rolling buffers of recent finals so an episode that opens LATE (e.g. Nova
  // garbled the word "MRN" but Transcribe heard it) can retro-ingest what the
  // other side already said.
  let recentUser: { text: string; ts: number }[] = []
  let recentMedical: { text: string; ts: number }[] = []

  let episode: Episode | null = null
  let nudgeCount = 0
  const events: CrosscheckEvent[] = []
  /** Latest verdict-produced capture (match or mismatch) — beats the fallback. */
  let verdictCaptured: CapturedIdentifier | null = null
  /** Best-effort capture when no verdict ever fires (one-sided data). */
  let lastNovaRep: string | null = null
  let lastMedicalRep: string | null = null

  const prune = (ts: number) => {
    recentUser = recentUser.filter((e) => ts - e.ts <= cfg.retroLookbackMs)
    recentMedical = recentMedical.filter((e) => ts - e.ts <= cfg.retroLookbackMs)
    if (episode && ts - episode.openedTs > cfg.episodeTtlMs) episode = null
  }

  const sideDetailed = (side: SideState): DetailedCandidate[] =>
    [...side.candidates.entries()].map(([value, dist]) => ({ value, dist }))

  const ingestIntoEpisode = (side: SideState, text: string, ts: number) => {
    side.texts.push(text)
    const own = extractDetailed(text, cfg)
    if (own.length) side.lastObsTs = ts
    // Joined extraction heals a number split across consecutive ASR finals
    // ("MRN 733" + "1924" → "7331924"). Extra joined values can only ADD to the
    // set — under intersection semantics that can only prevent a false
    // mismatch, never cause one.
    const joined = side.texts.length > 1 ? extractDetailed(side.texts.join(' '), cfg) : []
    for (const c of [...own, ...joined]) {
      side.candidates.set(c.value, Math.min(side.candidates.get(c.value) ?? Infinity, c.dist))
    }
  }

  const evaluate = (ts: number): CrosscheckAction | null => {
    if (!episode) return null
    const { nova, medical } = episode
    if (!nova.candidates.size || !medical.candidates.size) return null
    if (Math.abs(nova.lastObsTs - medical.lastObsTs) > cfg.pairingWindowMs) return null

    // When BOTH sides anchored a candidate to an identifier keyword, compare
    // only each side's CLOSEST-anchored candidates — an agreeing DOB/phone
    // number that also sits near the keyword must not mask a genuine MRN
    // disagreement. Otherwise fall back to the full sets (conservative: more
    // ways to agree → fewer false nudges).
    const novaAll = sideDetailed(nova)
    const medAll = sideDetailed(medical)
    const novaAnchored = novaAll.filter((c) => Number.isFinite(c.dist))
    const medAnchored = medAll.filter((c) => Number.isFinite(c.dist))
    const bothAnchored = novaAnchored.length > 0 && medAnchored.length > 0
    const atMinDist = (cands: DetailedCandidate[]) => {
      const min = Math.min(...cands.map((c) => c.dist))
      return cands.filter((c) => c.dist === min)
    }
    const novaCmp = bothAnchored ? atMinDist(novaAnchored) : novaAll
    const medCmp = bothAnchored ? atMinDist(medAnchored) : medAll
    const medValues = new Set(medCmp.map((c) => c.value))
    const common = novaCmp.map((c) => c.value).filter((v) => medValues.has(v))

    const novaRep = pickBest(novaAll)
    const medicalRep = pickBest(medAll)

    if (common.length) {
      const agreed = common.reduce((a, b) => (b.length > a.length ? b : a))
      const already = episode.latched
      episode.latched = 'matched'
      verdictCaptured = { value: agreed, source: 'agreement', novaValue: novaRep, medicalValue: medicalRep, verified: true }
      // Post-nudge agreement (caller confirmed/corrected within the same
      // episode) still records a match — the capture is now verified.
      if (already !== 'matched') {
        events.push({ ts, kind: 'match', novaValue: novaRep, medicalValue: medicalRep, agreedValue: agreed })
      }
      return null
    }

    if (episode.latched) return null // one verdict per episode — never re-nudge the same disagreement
    // Withhold the mismatch while fragments may still be landing: the verdict
    // only stands once both sides have been quiet for mismatchSettleMs. The
    // eventual nudge fires on whatever event arrives next past the window —
    // typically Clara's own next reply (noteAssistantTurn evaluates too), so a
    // genuine disagreement costs at most one conversational beat.
    if (ts - Math.max(nova.lastObsTs, medical.lastObsTs) < cfg.mismatchSettleMs) return null
    episode.latched = 'nudged'
    verdictCaptured = {
      value: medicalRep as string, // medical side non-empty here
      source: 'transcribe-medical',
      novaValue: novaRep,
      medicalValue: medicalRep,
      verified: false,
    }
    if (nudgeCount >= cfg.maxNudgesPerSession) {
      events.push({ ts, kind: 'nudge-suppressed', novaValue: novaRep, medicalValue: medicalRep })
      return null
    }
    nudgeCount++
    events.push({ ts, kind: 'mismatch', novaValue: novaRep, medicalValue: medicalRep })
    return {
      kind: 'nudge',
      nudgeText: buildReadbackNudgeText(novaRep ?? '', medicalRep ?? ''),
      novaValue: novaRep ?? '',
      medicalValue: medicalRep ?? '',
    }
  }

  const ingest = (
    which: 'nova' | 'medical',
    text: string,
    ts: number,
  ): CrosscheckAction | null => {
    prune(ts)
    const buf = which === 'nova' ? recentUser : recentMedical
    buf.push({ text, ts })

    const cands = extractDetailed(text, cfg)
    if (cands.length) {
      const rep = pickBest(cands)
      if (which === 'nova') lastNovaRep = rep
      else lastMedicalRep = rep
    }

    if (!episode) {
      // Self-open: a keyword-anchored candidate ("…MRN 830592…") starts a
      // capture window even if Clara never asked — callers front-load.
      if (!cands.some((c) => Number.isFinite(c.dist))) return null
      episode = freshEpisode(ts)
      for (const e of [...recentUser].sort((a, b) => a.ts - b.ts)) ingestIntoEpisode(episode.nova, e.text, e.ts)
      for (const e of [...recentMedical].sort((a, b) => a.ts - b.ts)) ingestIntoEpisode(episode.medical, e.text, e.ts)
      return evaluate(ts)
    }

    ingestIntoEpisode(which === 'nova' ? episode.nova : episode.medical, text, ts)
    return evaluate(ts)
  }

  return {
    /**
     * Assistant turns never contribute digit candidates (Clara's own
     * read-back/recap speaks the number!) — they OPEN the capture window when
     * none is active (Clara asking "name, MRN, age?" precedes a caller reply
     * of bare digits neither ASR keyword-anchors), and they give a settled
     * mismatch its chance to fire (Clara's reply is often the first event past
     * the settle window). Crucially an active episode is NEVER wiped: Clara
     * habitually ECHOES identifiers while moving on ("I've got Robert Chan,
     * FIN alpha bravo…"), and treating that as a fresh window silently
     * discarded a genuine pending mismatch in live smoke 7/12. The
     * post-read-back correction loop doesn't need a wipe — the nudge latch
     * blocks repeat nudges, and in-episode agreement on the corrected number
     * verifies the capture.
     */
    noteAssistantTurn(text: string, ts: number): CrosscheckAction | null {
      prune(ts)
      if (!episode && mentionsIdentifierKeyword(text)) {
        episode = freshEpisode(ts)
        return null
      }
      return evaluate(ts)
    },
    noteUserTurn(text: string, ts: number): CrosscheckAction | null {
      return ingest('nova', text, ts)
    },
    noteMedicalSegment(text: string, ts: number): CrosscheckAction | null {
      return ingest('medical', text, ts)
    },
    getCapturedIdentifier(): CapturedIdentifier | null {
      if (verdictCaptured) return verdictCaptured
      if (lastMedicalRep) {
        return { value: lastMedicalRep, source: 'transcribe-medical', novaValue: lastNovaRep, medicalValue: lastMedicalRep, verified: false }
      }
      if (lastNovaRep) {
        return { value: lastNovaRep, source: 'nova', novaValue: lastNovaRep, medicalValue: null, verified: false }
      }
      return null
    },
    getEvents(): CrosscheckEvent[] {
      return [...events]
    },
  }
}
