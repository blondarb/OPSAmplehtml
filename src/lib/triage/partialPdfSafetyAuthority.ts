import {
  EMERGENCY_GATEWAY_VERSION,
  runEmergencyGateway,
  type EmergencyGatewayResult,
  type GatewayEvidence,
  type GatewayLexicalHit,
  type GatewaySignal,
} from './emergencyGateway'
import {
  MAX_PDF_PAGE_COUNT,
  type PartialParsedFile,
} from './fileParser'
import { FILE_CONSTRAINTS } from './types'

const MAX_PARTIAL_PDF_PAGES = MAX_PDF_PAGE_COUNT
const PARTIAL_PDF_PAGE_SEPARATOR = '\n\n'
const MAX_PARTIAL_PDF_SENTENCE_SPANS = 50_000
const MAX_PARTIAL_PDF_SIGNALS = 16
const MAX_PARTIAL_PDF_LEXICAL_HITS = 2_000
const MAX_PARTIAL_PDF_EVIDENCE_PER_SIGNAL = 32
const MAX_PARTIAL_PDF_EVIDENCE_QUOTE_CHARACTERS = 2_000
const MAX_PARTIAL_PDF_FILENAME_CHARACTERS = 512
const MAX_CANONICAL_PARTIAL_ARTIFACT_DEPTH = 32
const MAX_CANONICAL_PARTIAL_ARTIFACT_NODES = 100_000
const MAX_SERIALIZED_PARTIAL_ARTIFACT_CHARACTERS =
  FILE_CONSTRAINTS.MAX_FILE_SIZE_BYTES

const PARTIAL_PDF_EVIDENCE_ANCHOR =
  /\b(?:sudden|abrupt|acute|aphasia|facial droop|weakness|numbness|vision loss|blindness|thunderclap|worst headache|status epilepticus|seiz|cauda equina|saddle anesthesia|urinary retention|unresponsive|confusion|meningitis|encephalitis|papilledema|shunt|dysphagia|breathing|suicidal|homicidal)\b/i

const SOURCE_PAGE_KEYS = [
  'documentId',
  'extractionConfidence',
  'extractionMethod',
  'pageNumber',
  'text',
] as const

const COVERAGE_REPORT_KEYS = [
  'availablePageNumbers',
  'missingPageNumbers',
  'nativeTextCharacterCount',
  'reason',
  'status',
  'totalPageCount',
] as const

const GATEWAY_EVIDENCE_KEYS = [
  'documentId',
  'endOffset',
  'extractionConfidence',
  'extractionMethod',
  'packetId',
  'pageNumber',
  'quote',
  'startOffset',
] as const

const GATEWAY_SIGNAL_KEYS = [
  'action',
  'assertion',
  'code',
  'evidence',
  'experiencer',
  'source',
  'syndrome',
  'temporality',
] as const

const GATEWAY_LEXICAL_HIT_KEYS = [
  'action',
  'assertion',
  'code',
  'evidence',
  'experiencer',
  'matchedRule',
  'source',
  'suppressed',
  'syndrome',
  'temporality',
] as const

const GATEWAY_RESULT_KEYS = [
  'carePathway',
  'failureCode',
  'lexicalHits',
  'reviewRequirement',
  'schedulingLocked',
  'signals',
  'status',
  'version',
] as const

type PersistedPartialPdfPage = {
  documentId: string
  pageNumber: number
  text: string
  extractionMethod: 'native_text'
  extractionConfidence: null
}

export interface ValidatedPartialPdfManifest {
  readonly totalPageCount: number
  readonly availablePageNumbers: readonly number[]
  readonly missingPageNumbers: readonly number[]
}

export type PersistedPartialPdfSafetyDecision =
  | { readonly kind: 'not_partial_pdf' }
  | {
      readonly kind: 'valid'
      readonly reason: 'ocr_required'
      readonly manifest: ValidatedPartialPdfManifest
      readonly gateway?: EmergencyGatewayResult
    }
  | {
      readonly kind: 'invalid'
      readonly reason:
        | 'source_extraction_manifest_invalid'
        | 'source_extraction_packet_safety_invalid'
      readonly gateway?: EmergencyGatewayResult
    }

export type PartialPdfEmergencyScreenDecision =
  | {
      readonly kind: 'valid'
      readonly sourceFilename: string
      readonly gateway?: EmergencyGatewayResult
    }
  | {
      readonly kind: 'invalid'
      readonly reason:
        | 'partial_pdf_manifest_invalid'
        | 'partial_pdf_safety_scan_failed'
    }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

type PersistedJsonParse =
  | { readonly ok: true; readonly value: unknown }
  | { readonly ok: false }

function parsePersistedJSON(value: unknown): PersistedJsonParse {
  if (typeof value !== 'string') return { ok: true, value }
  if (value.length > MAX_SERIALIZED_PARTIAL_ARTIFACT_CHARACTERS) {
    return { ok: false }
  }
  try {
    return { ok: true, value: JSON.parse(value) }
  } catch {
    return { ok: false }
  }
}

export function canonicalPartialPdfSourceFilename(
  value: unknown,
): string | undefined {
  if (typeof value !== 'string') return undefined
  const canonical = value.trim()
  return canonical &&
    canonical.length <= MAX_PARTIAL_PDF_FILENAME_CHARACTERS &&
    canonical.toLowerCase().endsWith('.pdf')
    ? canonical
    : undefined
}

function hasExactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
): boolean {
  const keys = Object.keys(value).sort()
  return (
    keys.length === expected.length &&
    keys.every((key, index) => key === expected[index])
  )
}

function isPartialPdfCandidate(row: Record<string, unknown>): boolean {
  if (row.coverage_status !== 'failed') return false
  const parsedReport = parsePersistedJSON(row.coverage_report)
  const reportSaysOcr =
    parsedReport.ok &&
    isRecord(parsedReport.value) &&
    parsedReport.value.reason === 'ocr_required'
  const filenameLooksLikePdf =
    canonicalPartialPdfSourceFilename(row.source_filename) !== undefined
  return reportSaysOcr || filenameLooksLikePdf
}

function parseAvailablePages(
  row: Record<string, unknown>,
): PersistedPartialPdfPage[] | undefined {
  if (
    typeof row.text_input !== 'string' ||
    !row.text_input.trim() ||
    row.text_input.length > FILE_CONSTRAINTS.MAX_PACKET_TEXT_LENGTH
  ) {
    return undefined
  }
  const parsedSourcePages = parsePersistedJSON(row.source_pages)
  const parsed = parsedSourcePages.ok ? parsedSourcePages.value : undefined
  if (
    !Array.isArray(parsed) ||
    parsed.length < 1 ||
    parsed.length > MAX_PARTIAL_PDF_PAGES
  ) {
    return undefined
  }

  const pages: PersistedPartialPdfPage[] = []
  let priorPageNumber = 0
  for (const candidate of parsed) {
    if (
      !isRecord(candidate) ||
      !hasExactKeys(candidate, SOURCE_PAGE_KEYS) ||
      candidate.documentId !== 'document-1' ||
      !Number.isSafeInteger(candidate.pageNumber) ||
      (candidate.pageNumber as number) < 1 ||
      (candidate.pageNumber as number) > MAX_PARTIAL_PDF_PAGES ||
      (candidate.pageNumber as number) <= priorPageNumber ||
      typeof candidate.text !== 'string' ||
      !candidate.text ||
      candidate.text !== candidate.text.trim() ||
      candidate.extractionMethod !== 'native_text' ||
      candidate.extractionConfidence !== null
    ) {
      return undefined
    }
    const page: PersistedPartialPdfPage = {
      documentId: 'document-1',
      pageNumber: candidate.pageNumber as number,
      text: candidate.text,
      extractionMethod: 'native_text',
      extractionConfidence: null,
    }
    pages.push(page)
    priorPageNumber = page.pageNumber
  }

  return pages.map((page) => page.text).join('\n\n') === row.text_input
    ? pages
    : undefined
}

function parseStrictIncreasingPageNumbers(
  value: unknown,
  totalPageCount: number,
): number[] | undefined {
  if (!Array.isArray(value) || value.length < 1) return undefined
  const pageNumbers: number[] = []
  let prior = 0
  for (const pageNumber of value) {
    if (
      !Number.isSafeInteger(pageNumber) ||
      pageNumber < 1 ||
      pageNumber > totalPageCount ||
      pageNumber <= prior
    ) {
      return undefined
    }
    pageNumbers.push(pageNumber)
    prior = pageNumber
  }
  return pageNumbers
}

function arraysEqual(
  left: readonly number[],
  right: readonly number[],
): boolean {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  )
}

function validateCoverageManifest(
  row: Record<string, unknown>,
  pages: readonly PersistedPartialPdfPage[],
): ValidatedPartialPdfManifest | undefined {
  const parsedReport = parsePersistedJSON(row.coverage_report)
  const report = parsedReport.ok ? parsedReport.value : undefined
  const textInput = row.text_input
  if (
    typeof textInput !== 'string' ||
    !isRecord(report) ||
    !hasExactKeys(report, COVERAGE_REPORT_KEYS) ||
    report.status !== 'failed' ||
    report.reason !== 'ocr_required' ||
    !Number.isSafeInteger(report.totalPageCount) ||
    (report.totalPageCount as number) < 1 ||
    (report.totalPageCount as number) > MAX_PARTIAL_PDF_PAGES ||
    report.nativeTextCharacterCount !== textInput.length ||
    row.original_text_length !== textInput.length ||
    row.ingestion_mode !== 'legacy_unknown' ||
    row.packet_plan !== null ||
    row.source_sha256 !== null ||
    canonicalPartialPdfSourceFilename(row.source_filename) !==
      row.source_filename
  ) {
    return undefined
  }

  const totalPageCount = report.totalPageCount as number
  const availablePageNumbers = parseStrictIncreasingPageNumbers(
    report.availablePageNumbers,
    totalPageCount,
  )
  const missingPageNumbers = parseStrictIncreasingPageNumbers(
    report.missingPageNumbers,
    totalPageCount,
  )
  const sourcePageNumbers = pages.map((page) => page.pageNumber)
  if (
    !availablePageNumbers ||
    !missingPageNumbers ||
    !arraysEqual(availablePageNumbers, sourcePageNumbers) ||
    availablePageNumbers.length + missingPageNumbers.length !== totalPageCount
  ) {
    return undefined
  }

  const available = new Set(availablePageNumbers)
  const missing = new Set(missingPageNumbers)
  for (let pageNumber = 1; pageNumber <= totalPageCount; pageNumber += 1) {
    if (available.has(pageNumber) === missing.has(pageNumber)) return undefined
  }

  return Object.freeze({
    totalPageCount,
    availablePageNumbers: Object.freeze([...availablePageNumbers]),
    missingPageNumbers: Object.freeze([...missingPageNumbers]),
  })
}

function evidenceMatchesPage(
  evidence: GatewayEvidence,
  page: PersistedPartialPdfPage,
): boolean {
  return (
    evidence.packetId === null &&
    evidence.documentId === page.documentId &&
    evidence.pageNumber === page.pageNumber &&
    evidence.extractionMethod === page.extractionMethod &&
    evidence.extractionConfidence === page.extractionConfidence &&
    Number.isSafeInteger(evidence.startOffset) &&
    Number.isSafeInteger(evidence.endOffset) &&
    evidence.startOffset >= 0 &&
    evidence.endOffset > evidence.startOffset &&
    evidence.endOffset <= page.text.length &&
    page.text.slice(evidence.startOffset, evidence.endOffset) === evidence.quote
  )
}

function gatewayEvidenceIsPageBound(
  gateway: EmergencyGatewayResult,
  pages: readonly PersistedPartialPdfPage[],
): boolean {
  const pageByNumber = new Map(pages.map((page) => [page.pageNumber, page]))
  const evidence = [
    ...gateway.signals.flatMap((signal) => signal.evidence),
    ...gateway.lexicalHits.flatMap((hit) => hit.evidence),
  ]
  return evidence.every((item) => {
    const page =
      item.pageNumber === null ? undefined : pageByNumber.get(item.pageNumber)
    return page !== undefined && evidenceMatchesPage(item, page)
  })
}

interface ContiguousPageRun {
  readonly text: string
  readonly pages: readonly {
    readonly page: PersistedPartialPdfPage
    readonly runStartOffset: number
    readonly runEndOffset: number
  }[]
}

function buildContiguousPageRun(
  pages: readonly PersistedPartialPdfPage[],
): ContiguousPageRun {
  let cursor = 0
  const spans: Array<ContiguousPageRun['pages'][number]> = []
  const textParts: string[] = []
  for (const page of pages) {
    if (textParts.length > 0) {
      textParts.push(PARTIAL_PDF_PAGE_SEPARATOR)
      cursor += PARTIAL_PDF_PAGE_SEPARATOR.length
    }
    const runStartOffset = cursor
    textParts.push(page.text)
    cursor += page.text.length
    spans.push({ page, runStartOffset, runEndOffset: cursor })
  }
  return { text: textParts.join(''), pages: spans }
}

function contiguousPageRuns(
  pages: readonly PersistedPartialPdfPage[],
): ContiguousPageRun[] {
  const runs: ContiguousPageRun[] = []
  let current: PersistedPartialPdfPage[] = []
  for (const page of pages) {
    const previous = current.at(-1)
    if (previous && page.pageNumber !== previous.pageNumber + 1) {
      runs.push(buildContiguousPageRun(current))
      current = []
    }
    current.push(page)
  }
  if (current.length > 0) runs.push(buildContiguousPageRun(current))
  return runs
}

function boundedPageEvidence(input: {
  evidence: GatewayEvidence
  page: PersistedPartialPdfPage
  startOffset: number
  endOffset: number
}): GatewayEvidence {
  const fullQuote = input.page.text.slice(input.startOffset, input.endOffset)
  const anchorOffset = fullQuote.search(PARTIAL_PDF_EVIDENCE_ANCHOR)
  const excerptOffset =
    fullQuote.length <= MAX_PARTIAL_PDF_EVIDENCE_QUOTE_CHARACTERS
      ? 0
      : Math.max(
          0,
          Math.min(
            fullQuote.length - MAX_PARTIAL_PDF_EVIDENCE_QUOTE_CHARACTERS,
            anchorOffset >= 0 ? anchorOffset - 500 : 0,
          ),
        )
  const startOffset = input.startOffset + excerptOffset
  const endOffset = Math.min(
    input.endOffset,
    startOffset + MAX_PARTIAL_PDF_EVIDENCE_QUOTE_CHARACTERS,
  )
  return {
    ...input.evidence,
    packetId: null,
    documentId: input.page.documentId,
    pageNumber: input.page.pageNumber,
    startOffset,
    endOffset,
    quote: input.page.text.slice(startOffset, endOffset),
    extractionMethod: input.page.extractionMethod,
    extractionConfidence: input.page.extractionConfidence,
  }
}

function mapRunEvidenceToPages(
  evidence: GatewayEvidence,
  run: ContiguousPageRun,
): GatewayEvidence[] | undefined {
  if (
    evidence.packetId !== null ||
    evidence.documentId !== null ||
    evidence.pageNumber !== null ||
    !Number.isSafeInteger(evidence.startOffset) ||
    !Number.isSafeInteger(evidence.endOffset) ||
    evidence.startOffset < 0 ||
    evidence.endOffset <= evidence.startOffset ||
    evidence.endOffset > run.text.length ||
    run.text.slice(evidence.startOffset, evidence.endOffset) !== evidence.quote
  ) {
    return undefined
  }
  const mapped: GatewayEvidence[] = []
  for (const span of run.pages) {
    const intersectionStart = Math.max(
      evidence.startOffset,
      span.runStartOffset,
    )
    const intersectionEnd = Math.min(evidence.endOffset, span.runEndOffset)
    if (intersectionEnd <= intersectionStart) continue
    mapped.push(
      boundedPageEvidence({
        evidence,
        page: span.page,
        startOffset: intersectionStart - span.runStartOffset,
        endOffset: intersectionEnd - span.runStartOffset,
      }),
    )
  }
  return mapped.length > 0 ? mapped : undefined
}

function pageEvidenceIdentity(evidence: GatewayEvidence): string {
  return [
    evidence.documentId ?? '',
    evidence.pageNumber ?? '',
    evidence.startOffset,
    evidence.endOffset,
  ].join(':')
}

function remapRunSignal<T extends GatewaySignal>(
  signal: T,
  run: ContiguousPageRun,
): T | undefined {
  const mapped: GatewayEvidence[] = []
  const seen = new Set<string>()
  for (const evidence of signal.evidence) {
    const pageEvidence = mapRunEvidenceToPages(evidence, run)
    if (!pageEvidence) return undefined
    for (const item of pageEvidence) {
      const identity = pageEvidenceIdentity(item)
      if (seen.has(identity)) continue
      seen.add(identity)
      mapped.push(item)
      if (mapped.length >= MAX_PARTIAL_PDF_EVIDENCE_PER_SIGNAL) break
    }
    if (mapped.length >= MAX_PARTIAL_PDF_EVIDENCE_PER_SIGNAL) break
  }
  return mapped.length > 0
    ? ({ ...signal, evidence: mapped } as T)
    : undefined
}

function remapRunGateway(
  gateway: EmergencyGatewayResult,
  run: ContiguousPageRun,
): EmergencyGatewayResult | undefined {
  const signals = gateway.signals.map((signal) =>
    remapRunSignal(signal, run),
  )
  const lexicalHits = gateway.lexicalHits.map((hit) =>
    remapRunSignal(hit, run),
  )
  if (
    signals.some((signal) => signal === undefined) ||
    lexicalHits.some((hit) => hit === undefined)
  ) {
    return undefined
  }
  return {
    ...gateway,
    signals: signals as GatewaySignal[],
    lexicalHits: lexicalHits as GatewayLexicalHit[],
  }
}

function signalRank(signal: GatewaySignal): number {
  if (signal.action === 'emergency_now' && signal.assertion === 'present') {
    return 2
  }
  if (
    signal.action === 'immediate_clinician_review' &&
    signal.assertion === 'uncertain'
  ) {
    return 1
  }
  return 0
}

function mergeBoundedSignals(
  left: GatewaySignal,
  right: GatewaySignal,
): GatewaySignal {
  const dominant = signalRank(right) > signalRank(left) ? right : left
  const secondary = dominant === right ? left : right
  const evidence: GatewayEvidence[] = []
  const seen = new Set<string>()
  for (const item of [...dominant.evidence, ...secondary.evidence]) {
    const identity = pageEvidenceIdentity(item)
    if (seen.has(identity)) continue
    seen.add(identity)
    evidence.push(item)
    if (evidence.length >= MAX_PARTIAL_PDF_EVIDENCE_PER_SIGNAL) break
  }
  return { ...dominant, evidence }
}

function mergePositiveRunGateways(
  gateways: readonly EmergencyGatewayResult[],
): EmergencyGatewayResult | undefined {
  const signalsBySyndrome = new Map<string, GatewaySignal>()
  const lexicalHits: GatewayLexicalHit[] = []
  const seenLexicalEvidence = new Set<string>()
  for (const gateway of gateways) {
    if (
      gateway.carePathway !== 'emergency_now' &&
      gateway.carePathway !== 'same_day_clinician_review'
    ) {
      continue
    }
    for (const signal of gateway.signals) {
      const existing = signalsBySyndrome.get(signal.syndrome)
      signalsBySyndrome.set(
        signal.syndrome,
        existing ? mergeBoundedSignals(existing, signal) : signal,
      )
    }
    if (lexicalHits.length >= MAX_PARTIAL_PDF_LEXICAL_HITS) continue
    const orderedHits = [...gateway.lexicalHits].sort(
      (left, right) =>
        Number(right.matchedRule && !right.suppressed) -
        Number(left.matchedRule && !left.suppressed),
    )
    for (const hit of orderedHits) {
      if (lexicalHits.length >= MAX_PARTIAL_PDF_LEXICAL_HITS) break
      const identity = hit.evidence.map(pageEvidenceIdentity).join('|')
      if (seenLexicalEvidence.has(identity)) continue
      seenLexicalEvidence.add(identity)
      lexicalHits.push(hit)
    }
  }
  const signals = [...signalsBySyndrome.values()].slice(
    0,
    MAX_PARTIAL_PDF_SIGNALS,
  )
  const emergency = signals.some(
    (signal) =>
      signal.action === 'emergency_now' && signal.assertion === 'present',
  )
  const sameDay = signals.some(
    (signal) =>
      signal.action === 'immediate_clinician_review' &&
      signal.assertion === 'uncertain',
  )
  if (!emergency && !sameDay) return undefined
  return {
    status: 'completed',
    failureCode: null,
    carePathway: emergency
      ? 'emergency_now'
      : 'same_day_clinician_review',
    reviewRequirement: emergency
      ? 'emergency_action'
      : 'immediate_clinician_review',
    schedulingLocked: true,
    signals,
    lexicalHits,
    version: EMERGENCY_GATEWAY_VERSION,
  }
}

function exceedsPartialPdfSentenceSpanBudget(
  pages: readonly PersistedPartialPdfPage[],
): boolean {
  let spans = 0
  for (const page of pages) {
    let hasContent = false
    for (const character of page.text) {
      if (
        character === '.' ||
        character === '!' ||
        character === '?' ||
        character === ';' ||
        character === '\n'
      ) {
        if (!hasContent) continue
        spans += 1
        if (spans > MAX_PARTIAL_PDF_SENTENCE_SPANS) return true
        hasContent = false
      } else if (!/\s/.test(character)) {
        hasContent = true
      }
    }
    if (hasContent) {
      spans += 1
      if (spans > MAX_PARTIAL_PDF_SENTENCE_SPANS) return true
    }
  }
  return false
}

function screenAvailablePageRuns(
  pages: readonly PersistedPartialPdfPage[],
): { readonly ok: true; readonly gateway?: EmergencyGatewayResult } | {
  readonly ok: false
} {
  if (exceedsPartialPdfSentenceSpanBudget(pages)) return { ok: false }
  const results: EmergencyGatewayResult[] = []
  for (const run of contiguousPageRuns(pages)) {
    const gateway = runEmergencyGateway(run.text, undefined, {
      maxSentenceSpans: MAX_PARTIAL_PDF_SENTENCE_SPANS,
      maxLexicalHits: MAX_PARTIAL_PDF_LEXICAL_HITS,
      maxEvidencePerSyndrome: MAX_PARTIAL_PDF_EVIDENCE_PER_SIGNAL * 2,
    })
    if (gateway.status !== 'completed') return { ok: false }
    const remapped = remapRunGateway(gateway, run)
    if (!remapped || !gatewayEvidenceIsPageBound(remapped, pages)) {
      return { ok: false }
    }
    results.push(remapped)
  }
  const gateway = mergePositiveRunGateways(results)
  return gateway ? { ok: true, gateway } : { ok: true }
}

export function screenPartialPdfEmergencyGateway(
  partial: PartialParsedFile,
): PartialPdfEmergencyScreenDecision {
  const sourceFilename = canonicalPartialPdfSourceFilename(partial.filename)
  if (
    partial.sourceType !== 'pdf' ||
    !sourceFilename ||
    !partial.text.trim() ||
    partial.text.length > FILE_CONSTRAINTS.MAX_PACKET_TEXT_LENGTH ||
    !Number.isSafeInteger(partial.totalPageCount) ||
    partial.totalPageCount < 1 ||
    partial.totalPageCount > MAX_PARTIAL_PDF_PAGES ||
    partial.pages.length < 1 ||
    partial.missingPageNumbers.length < 1 ||
    partial.pages.length + partial.missingPageNumbers.length !==
      partial.totalPageCount ||
    partial.pages.map((page) => page.text).join('\n\n') !== partial.text
  ) {
    return { kind: 'invalid', reason: 'partial_pdf_manifest_invalid' }
  }

  const pages: PersistedPartialPdfPage[] = []
  const available = new Set<number>()
  let priorPageNumber = 0
  for (const page of partial.pages) {
    if (
      !Number.isSafeInteger(page.pageNumber) ||
      page.pageNumber < 1 ||
      page.pageNumber > partial.totalPageCount ||
      page.pageNumber <= priorPageNumber ||
      !page.text.trim() ||
      page.text !== page.text.trim() ||
      page.extractionMethod !== 'native_text' ||
      page.extractionConfidence !== null
    ) {
      return { kind: 'invalid', reason: 'partial_pdf_manifest_invalid' }
    }
    pages.push({
      documentId: 'document-1',
      pageNumber: page.pageNumber,
      text: page.text,
      extractionMethod: 'native_text',
      extractionConfidence: null,
    })
    available.add(page.pageNumber)
    priorPageNumber = page.pageNumber
  }

  const missing = new Set<number>()
  let priorMissingPageNumber = 0
  for (const pageNumber of partial.missingPageNumbers) {
    if (
      !Number.isSafeInteger(pageNumber) ||
      pageNumber < 1 ||
      pageNumber > partial.totalPageCount ||
      pageNumber <= priorMissingPageNumber ||
      available.has(pageNumber)
    ) {
      return { kind: 'invalid', reason: 'partial_pdf_manifest_invalid' }
    }
    missing.add(pageNumber)
    priorMissingPageNumber = pageNumber
  }
  if (available.size + missing.size !== partial.totalPageCount) {
    return { kind: 'invalid', reason: 'partial_pdf_manifest_invalid' }
  }
  for (let pageNumber = 1; pageNumber <= partial.totalPageCount; pageNumber += 1) {
    if (available.has(pageNumber) === missing.has(pageNumber)) {
      return { kind: 'invalid', reason: 'partial_pdf_manifest_invalid' }
    }
  }

  const screen = screenAvailablePageRuns(pages)
  if (!screen.ok) {
    return { kind: 'invalid', reason: 'partial_pdf_safety_scan_failed' }
  }
  return {
    kind: 'valid',
    sourceFilename,
    ...(screen.gateway ? { gateway: screen.gateway } : {}),
  }
}

function isStringIn<T extends string>(
  value: unknown,
  choices: readonly T[],
): value is T {
  return typeof value === 'string' && choices.includes(value as T)
}

function parseEvidence(
  value: unknown,
  pages: readonly PersistedPartialPdfPage[],
): GatewayEvidence | undefined {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, GATEWAY_EVIDENCE_KEYS) ||
    typeof value.quote !== 'string' ||
    value.quote.length > MAX_PARTIAL_PDF_EVIDENCE_QUOTE_CHARACTERS
  ) {
    return undefined
  }
  const evidence = value as unknown as GatewayEvidence
  const page =
    evidence.pageNumber === null
      ? undefined
      : pages.find((candidate) => candidate.pageNumber === evidence.pageNumber)
  return page && evidenceMatchesPage(evidence, page) ? evidence : undefined
}

function parseSignal(
  value: unknown,
  pages: readonly PersistedPartialPdfPage[],
  expectedKeys: readonly string[] = GATEWAY_SIGNAL_KEYS,
): GatewaySignal | undefined {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, expectedKeys) ||
    typeof value.code !== 'string' ||
    !value.code ||
    typeof value.syndrome !== 'string' ||
    value.source !== 'deterministic' ||
    !isStringIn(value.action, [
      'emergency_now',
      'immediate_clinician_review',
    ] as const) ||
    !isStringIn(value.assertion, [
      'present',
      'negated',
      'uncertain',
      'conditional',
    ] as const) ||
    !isStringIn(value.temporality, [
      'current',
      'recent',
      'historical',
      'unknown',
    ] as const) ||
    !isStringIn(value.experiencer, [
      'patient',
      'family',
      'other',
      'unknown',
    ] as const) ||
    !Array.isArray(value.evidence) ||
    value.evidence.length < 1 ||
    value.evidence.length > MAX_PARTIAL_PDF_EVIDENCE_PER_SIGNAL
  ) {
    return undefined
  }
  const evidence = value.evidence.map((item) => parseEvidence(item, pages))
  if (evidence.some((item) => item === undefined)) return undefined
  return { ...value, evidence } as unknown as GatewaySignal
}

function parseLexicalHit(
  value: unknown,
  pages: readonly PersistedPartialPdfPage[],
): GatewayLexicalHit | undefined {
  const signal = parseSignal(value, pages, GATEWAY_LEXICAL_HIT_KEYS)
  return signal &&
    isRecord(value) &&
    typeof value.matchedRule === 'boolean' &&
    typeof value.suppressed === 'boolean'
    ? ({ ...signal, matchedRule: value.matchedRule, suppressed: value.suppressed } as GatewayLexicalHit)
    : undefined
}

function parsePersistedActionableGateway(
  value: unknown,
  pages: readonly PersistedPartialPdfPage[],
): EmergencyGatewayResult | undefined {
  const parsedValue = parsePersistedJSON(value)
  const parsed = parsedValue.ok ? parsedValue.value : undefined
  if (
    !isRecord(parsed) ||
    !hasExactKeys(parsed, GATEWAY_RESULT_KEYS) ||
    parsed.status !== 'completed' ||
    parsed.failureCode !== null ||
    (parsed.carePathway !== 'emergency_now' &&
      parsed.carePathway !== 'same_day_clinician_review') ||
    parsed.reviewRequirement !==
      (parsed.carePathway === 'emergency_now'
        ? 'emergency_action'
        : 'immediate_clinician_review') ||
    parsed.schedulingLocked !== true ||
    parsed.version !== EMERGENCY_GATEWAY_VERSION ||
    !Array.isArray(parsed.signals) ||
    parsed.signals.length < 1 ||
    parsed.signals.length > MAX_PARTIAL_PDF_SIGNALS ||
    !Array.isArray(parsed.lexicalHits) ||
    parsed.lexicalHits.length > MAX_PARTIAL_PDF_LEXICAL_HITS
  ) {
    return undefined
  }
  const signals = parsed.signals.map((signal) => parseSignal(signal, pages))
  const lexicalHits = parsed.lexicalHits.map((hit) =>
    parseLexicalHit(hit, pages),
  )
  if (
    signals.some((signal) => signal === undefined) ||
    lexicalHits.some((hit) => hit === undefined)
  ) {
    return undefined
  }
  const gateway = {
    ...parsed,
    signals,
    lexicalHits,
  } as unknown as EmergencyGatewayResult
  const supportingSignal = gateway.signals.some((signal) =>
    gateway.carePathway === 'emergency_now'
      ? signal.action === 'emergency_now' && signal.assertion === 'present'
      : signal.action === 'immediate_clinician_review' &&
        signal.assertion === 'uncertain',
  )
  return supportingSignal && gatewayEvidenceIsPageBound(gateway, pages)
    ? gateway
    : undefined
}

function canonicalize(
  value: unknown,
  budget: { nodes: number },
  depth = 0,
): unknown {
  budget.nodes += 1
  if (
    budget.nodes > MAX_CANONICAL_PARTIAL_ARTIFACT_NODES ||
    depth > MAX_CANONICAL_PARTIAL_ARTIFACT_DEPTH
  ) {
    throw new Error('Partial PDF canonical comparison limit exceeded.')
  }
  if (Array.isArray(value)) {
    return value.map((item) => canonicalize(item, budget, depth + 1))
  }
  if (!isRecord(value)) return value
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, canonicalize(value[key], budget, depth + 1)]),
  )
}

function canonicalEquals(left: unknown, right: unknown): boolean {
  try {
    const leftCanonical = JSON.stringify(canonicalize(left, { nodes: 0 }))
    const rightCanonical = JSON.stringify(canonicalize(right, { nodes: 0 }))
    return (
      leftCanonical.length <= MAX_SERIALIZED_PARTIAL_ARTIFACT_CHARACTERS &&
      rightCanonical.length <= MAX_SERIALIZED_PARTIAL_ARTIFACT_CHARACTERS &&
      leftCanonical === rightCanonical
    )
  } catch {
    return false
  }
}

function strongerGateway(
  left: EmergencyGatewayResult | undefined,
  right: EmergencyGatewayResult | undefined,
): EmergencyGatewayResult | undefined {
  if (left?.carePathway === 'emergency_now') return left
  if (right?.carePathway === 'emergency_now') return right
  return left ?? right
}

export function validatePersistedPartialPdfSafety(
  value: unknown,
): PersistedPartialPdfSafetyDecision {
  if (!isRecord(value) || !isPartialPdfCandidate(value)) {
    return { kind: 'not_partial_pdf' }
  }

  const pages = parseAvailablePages(value)
  if (!pages) {
    return {
      kind: 'invalid',
      reason: 'source_extraction_manifest_invalid',
    }
  }

  const screen = screenAvailablePageRuns(pages)
  const persistedGateway = parsePersistedActionableGateway(
    value.packet_emergency_result,
    pages,
  )
  const safetyGateway = strongerGateway(
    screen.ok ? screen.gateway : undefined,
    persistedGateway,
  )
  const manifest = validateCoverageManifest(value, pages)
  if (!manifest) {
    return {
      kind: 'invalid',
      reason: 'source_extraction_manifest_invalid',
      ...(safetyGateway ? { gateway: safetyGateway } : {}),
    }
  }
  if (!screen.ok) {
    return {
      kind: 'invalid',
      reason: 'source_extraction_packet_safety_invalid',
      ...(persistedGateway ? { gateway: persistedGateway } : {}),
    }
  }

  const expectedArtifactMatches = screen.gateway
    ? persistedGateway !== undefined &&
      canonicalEquals(persistedGateway, screen.gateway)
    : value.packet_emergency_result === null ||
      value.packet_emergency_result === undefined
  if (!expectedArtifactMatches) {
    return {
      kind: 'invalid',
      reason: 'source_extraction_packet_safety_invalid',
      ...(safetyGateway ? { gateway: safetyGateway } : {}),
    }
  }

  return {
    kind: 'valid',
    reason: 'ocr_required',
    manifest,
    ...(screen.gateway ? { gateway: screen.gateway } : {}),
  }
}
