import type { EmergencySyndrome } from '../emergencyGateway'
import type {
  LongPacketPlannerOptions,
  LongPacketSourceDocument,
} from '../longPacketPlanner'
import type { CarePathway } from '../types'
import type {
  SentinelCatalog,
  SentinelCase,
  SentinelClinicalClass,
  SentinelExecutionMode,
  SentinelExpectation,
  SentinelInput,
  SentinelReleaseGate,
  SentinelReleaseGateSet,
} from './types'

export const SENTINEL_SYNDROMES = [
  'acute_cerebrovascular',
  'intracranial_hemorrhage_or_sah',
  'status_or_recurrent_seizure',
  'acute_spinal_cord_or_cauda_equina',
  'autonomic_dysreflexia',
  'acute_cns_infection',
  'raised_intracranial_pressure',
  'neuromuscular_respiratory_or_bulbar_failure',
  'acute_vision_threat',
  'altered_mental_status_or_coma',
  'traumatic_neurologic_deterioration',
  'suicide_or_violence_risk',
  'other_time_critical',
] as const satisfies readonly EmergencySyndrome[]

const CARE_PATHWAYS = [
  'emergency_now',
  'same_day_clinician_review',
  'expedited_outpatient',
  'routine_outpatient',
  'redirect',
  'undetermined',
] as const satisfies readonly CarePathway[]

const CLINICAL_CLASSES = [
  'time_critical',
  'same_day',
  'routine',
  'manual_hold',
] as const satisfies readonly SentinelClinicalClass[]

const EXECUTION_MODES = [
  'offline_deterministic',
  'live_ensemble',
] as const satisfies readonly SentinelExecutionMode[]

const GATE_METRICS = [
  'emergency_under_triage_count',
  'invalid_time_critical_evidence_count',
  'unevaluated_offline_case_count',
  'hard_negative_false_alert_rate',
  'manual_hold_rate',
] as const

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function fail(path: string, reason: string): never {
  throw new Error(`Invalid sentinel ${path}: ${reason}`)
}

function boundedString(
  value: unknown,
  path: string,
  maxLength = 2_000,
): string {
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    value.length > maxLength
  ) {
    fail(path, `must be a non-empty string of at most ${maxLength} characters`)
  }
  return value
}

function stringArray(
  value: unknown,
  path: string,
  options: { maxItems?: number; pattern?: RegExp } = {},
): string[] {
  const maxItems = options.maxItems ?? 50
  if (!Array.isArray(value) || value.length > maxItems) {
    fail(path, `must be an array with at most ${maxItems} items`)
  }
  const parsed = value.map((item, index) => {
    const text = boundedString(item, `${path}[${index}]`, 120)
    if (options.pattern && !options.pattern.test(text)) {
      fail(`${path}[${index}]`, 'has an invalid format')
    }
    return text
  })
  if (new Set(parsed).size !== parsed.length) {
    fail(path, 'must not contain duplicates')
  }
  return parsed
}

function enumValue<T extends string>(
  value: unknown,
  allowed: readonly T[],
  path: string,
): T {
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    fail(path, `must be one of ${allowed.join(', ')}`)
  }
  return value as T
}

function parsePage(
  value: unknown,
  path: string,
  expectedPageNumber: number,
): LongPacketSourceDocument['pages'][number] {
  if (!isRecord(value)) fail(path, 'must be an object')
  if (value.pageNumber !== expectedPageNumber) {
    fail(`${path}.pageNumber`, `must be ${expectedPageNumber}`)
  }
  const text = boundedString(value.text, `${path}.text`, 100_000)
  const extractionMethod = enumValue(
    value.extractionMethod,
    ['native_text', 'ocr'] as const,
    `${path}.extractionMethod`,
  )
  const confidence = value.extractionConfidence
  if (
    confidence !== null &&
    (typeof confidence !== 'number' ||
      !Number.isFinite(confidence) ||
      confidence < 0 ||
      confidence > 1)
  ) {
    fail(`${path}.extractionConfidence`, 'must be null or a number from 0 to 1')
  }
  return {
    pageNumber: expectedPageNumber,
    text,
    extractionMethod,
    extractionConfidence: confidence as number | null,
  }
}

function parseDocuments(value: unknown, path: string): LongPacketSourceDocument[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 50) {
    fail(path, 'must contain 1 to 50 documents')
  }
  return value.map((rawDocument, documentIndex) => {
    const itemPath = `${path}[${documentIndex}]`
    if (!isRecord(rawDocument)) fail(itemPath, 'must be an object')
    const packetId = boundedString(rawDocument.packetId, `${itemPath}.packetId`, 120)
    const documentId = boundedString(
      rawDocument.documentId,
      `${itemPath}.documentId`,
      120,
    )
    const expectedDocumentCount = value.length
    if (rawDocument.expectedDocumentCount !== expectedDocumentCount) {
      fail(
        `${itemPath}.expectedDocumentCount`,
        `must be ${expectedDocumentCount}`,
      )
    }
    if (rawDocument.documentOrder !== documentIndex + 1) {
      fail(`${itemPath}.documentOrder`, `must be ${documentIndex + 1}`)
    }
    if (!Array.isArray(rawDocument.pages) || rawDocument.pages.length === 0) {
      fail(`${itemPath}.pages`, 'must contain at least one page')
    }
    if (rawDocument.expectedPageCount !== rawDocument.pages.length) {
      fail(
        `${itemPath}.expectedPageCount`,
        `must be ${rawDocument.pages.length}`,
      )
    }
    return {
      packetId,
      expectedDocumentCount,
      documentId,
      documentOrder: documentIndex + 1,
      expectedPageCount: rawDocument.pages.length,
      pages: rawDocument.pages.map((page, pageIndex) =>
        parsePage(page, `${itemPath}.pages[${pageIndex}]`, pageIndex + 1),
      ),
    }
  })
}

function parseInput(value: unknown, path: string): SentinelInput {
  if (!isRecord(value)) fail(path, 'must be an object')
  const kind = value.kind
  if (kind === 'note') {
    return {
      kind,
      text: boundedString(value.text, `${path}.text`, 200_000),
      sourceStyle: enumValue(
        value.sourceStyle,
        ['short_rural', 'standard'] as const,
        `${path}.sourceStyle`,
      ),
    }
  }
  if (kind === 'packet') {
    let chunkOptions: LongPacketPlannerOptions | undefined
    if (value.chunkOptions !== undefined) {
      if (!isRecord(value.chunkOptions)) {
        fail(`${path}.chunkOptions`, 'must be an object')
      }
      const maxChunkCharacters = value.chunkOptions.maxChunkCharacters
      const overlapCharacters = value.chunkOptions.overlapCharacters
      if (
        !Number.isSafeInteger(maxChunkCharacters) ||
        !Number.isSafeInteger(overlapCharacters) ||
        (maxChunkCharacters as number) < 2 ||
        (overlapCharacters as number) < 1 ||
        (overlapCharacters as number) >= (maxChunkCharacters as number)
      ) {
        fail(
          `${path}.chunkOptions`,
          'must contain valid integer maxChunkCharacters and overlapCharacters',
        )
      }
      chunkOptions = {
        maxChunkCharacters: maxChunkCharacters as number,
        overlapCharacters: overlapCharacters as number,
      }
    }
    return {
      kind,
      packetStyle: enumValue(
        value.packetStyle,
        ['mayo_like', 'tertiary_long', 'standard'] as const,
        `${path}.packetStyle`,
      ),
      documents: parseDocuments(value.documents, `${path}.documents`),
      ...(chunkOptions ? { chunkOptions } : {}),
    }
  }
  if (kind === 'missing') {
    return {
      kind,
      reason: boundedString(value.reason, `${path}.reason`, 500),
    }
  }
  return fail(`${path}.kind`, 'must be note, packet, or missing')
}

function parseExpectation(value: unknown, path: string): SentinelExpectation {
  if (!isRecord(value)) fail(path, 'must be an object')
  const pathway = enumValue(value.pathway, CARE_PATHWAYS, `${path}.pathway`)
  if (!Array.isArray(value.acceptablePathways) || value.acceptablePathways.length === 0) {
    fail(`${path}.acceptablePathways`, 'must contain at least one pathway')
  }
  const acceptablePathways = value.acceptablePathways.map((item, index) =>
    enumValue(item, CARE_PATHWAYS, `${path}.acceptablePathways[${index}]`),
  )
  if (!acceptablePathways.includes(pathway)) {
    fail(`${path}.acceptablePathways`, 'must include the expected pathway')
  }
  if (!Array.isArray(value.requiredSyndromes)) {
    fail(`${path}.requiredSyndromes`, 'must be an array')
  }
  if (
    value.forbiddenSyndromes !== undefined &&
    !Array.isArray(value.forbiddenSyndromes)
  ) {
    fail(`${path}.forbiddenSyndromes`, 'must be an array when provided')
  }
  const requiredSyndromes = value.requiredSyndromes.map((item, index) =>
    enumValue(item, SENTINEL_SYNDROMES, `${path}.requiredSyndromes[${index}]`),
  )
  const forbiddenSyndromes = (value.forbiddenSyndromes ?? []).map(
    (item, index) =>
      enumValue(
        item,
        SENTINEL_SYNDROMES,
        `${path}.forbiddenSyndromes[${index}]`,
      ),
  )
  if (requiredSyndromes.some((item) => forbiddenSyndromes.includes(item))) {
    fail(
      `${path}.forbiddenSyndromes`,
      'must not overlap requiredSyndromes',
    )
  }
  return {
    clinicalClass: enumValue(
      value.clinicalClass,
      CLINICAL_CLASSES,
      `${path}.clinicalClass`,
    ),
    pathway,
    acceptablePathways: [...new Set(acceptablePathways)],
    requiredSyndromes: [...new Set(requiredSyndromes)],
    ...(forbiddenSyndromes.length > 0
      ? { forbiddenSyndromes: [...new Set(forbiddenSyndromes)] }
      : {}),
  }
}

function parseCase(value: unknown, path: string): SentinelCase {
  if (!isRecord(value)) fail(path, 'must be an object')
  if (value.synthetic !== true) fail(`${path}.synthetic`, 'must be true')
  const syndrome =
    value.syndrome === null
      ? null
      : enumValue(value.syndrome, SENTINEL_SYNDROMES, `${path}.syndrome`)
  if (typeof value.hardNegative !== 'boolean') {
    fail(`${path}.hardNegative`, 'must be boolean')
  }
  if (!Array.isArray(value.executionModes) || value.executionModes.length === 0) {
    fail(`${path}.executionModes`, 'must contain at least one mode')
  }
  return {
    id: boundedString(value.id, `${path}.id`, 100),
    title: boundedString(value.title, `${path}.title`, 240),
    synthetic: true,
    syndrome,
    hardNegative: value.hardNegative,
    tags: stringArray(value.tags, `${path}.tags`, {
      pattern: /^[a-z][a-z0-9_]{0,79}$/,
    }),
    executionModes: [
      ...new Set(
        value.executionModes.map((item, index) =>
          enumValue(item, EXECUTION_MODES, `${path}.executionModes[${index}]`),
        ),
      ),
    ],
    input: parseInput(value.input, `${path}.input`),
    expected: parseExpectation(value.expected, `${path}.expected`),
  }
}

export function parseSentinelCatalog(value: unknown): SentinelCatalog {
  if (!isRecord(value)) fail('catalog', 'must be an object')
  if (value.schemaVersion !== '1.0') {
    fail('catalog.schemaVersion', 'must be 1.0')
  }
  if (value.synthetic !== true) {
    fail('catalog.synthetic', 'must be true for PHI-free sentinel data')
  }
  if (!Array.isArray(value.cases) || value.cases.length === 0) {
    fail('catalog.cases', 'must contain at least one case')
  }
  const cases = value.cases.map((item, index) =>
    parseCase(item, `catalog.cases[${index}]`),
  )
  const ids = new Set<string>()
  for (const item of cases) {
    if (ids.has(item.id)) fail('catalog.cases', `duplicate case id ${item.id}`)
    ids.add(item.id)
  }
  return {
    schemaVersion: '1.0',
    catalogId: boundedString(value.catalogId, 'catalog.catalogId', 120),
    synthetic: true,
    description: boundedString(value.description, 'catalog.description', 1_000),
    cases,
  }
}

function parseReleaseGate(value: unknown, path: string): SentinelReleaseGate {
  if (!isRecord(value)) fail(path, 'must be an object')
  if (value.scope !== 'synthetic_software_release_only') {
    fail(`${path}.scope`, 'must be synthetic_software_release_only')
  }
  if (typeof value.threshold !== 'number' || !Number.isFinite(value.threshold)) {
    fail(`${path}.threshold`, 'must be a finite number')
  }
  return {
    id: boundedString(value.id, `${path}.id`, 100),
    scope: 'synthetic_software_release_only',
    metric: enumValue(value.metric, GATE_METRICS, `${path}.metric`),
    operator: enumValue(value.operator, ['lte', 'gte', 'eq'] as const, `${path}.operator`),
    threshold: value.threshold,
    description: boundedString(value.description, `${path}.description`, 500),
  }
}

export function parseSentinelReleaseGates(
  value: unknown,
): SentinelReleaseGateSet {
  if (!isRecord(value)) fail('release gates', 'must be an object')
  if (value.schemaVersion !== '1.0') {
    fail('release gates.schemaVersion', 'must be 1.0')
  }
  if (
    value.scope !== 'synthetic_software_release_only' ||
    value.clinicalValidationClaim !== false
  ) {
    fail(
      'release gates',
      'must be synthetic software release gates with clinicalValidationClaim=false',
    )
  }
  if (!Array.isArray(value.gates) || value.gates.length === 0) {
    fail('release gates.gates', 'must contain at least one gate')
  }
  const gates = value.gates.map((gate, index) =>
    parseReleaseGate(gate, `release gates.gates[${index}]`),
  )
  if (new Set(gates.map((gate) => gate.id)).size !== gates.length) {
    fail('release gates.gates', 'contains duplicate gate ids')
  }
  return {
    schemaVersion: '1.0',
    gateSetId: boundedString(value.gateSetId, 'release gates.gateSetId', 120),
    scope: 'synthetic_software_release_only',
    clinicalValidationClaim: false,
    gates,
  }
}
