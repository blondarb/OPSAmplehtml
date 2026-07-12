export const SCANNED_PACKET_COMPLETION_API =
  'StartDocumentTextDetection' as const

export type ScannedPacketCompletionStatus = 'SUCCEEDED' | 'FAILED' | 'ERROR'

export interface ScannedPacketCompletionMessage {
  jobId: string
  status: ScannedPacketCompletionStatus
  api: typeof SCANNED_PACKET_COMPLETION_API
  ingestionId: string
  timestamp: number
  documentLocation: {
    bucket: string
    key: string
  }
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const JOB_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/
const BUCKET_PATTERN = /^(?!\d{1,3}(?:\.\d{1,3}){3}$)(?!.*\.\.)(?!.*\.-)(?!.*-\.)[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/
const EXPECTED_KEYS = [
  'API',
  'DocumentLocation',
  'JobId',
  'JobTag',
  'Status',
  'Timestamp',
]
const EXPECTED_LOCATION_KEYS = ['S3Bucket', 'S3ObjectName']
const MAX_MESSAGE_BYTES = 4_096

export class ScannedPacketCompletionMessageError extends Error {
  readonly name = 'ScannedPacketCompletionMessageError'

  constructor() {
    super('Invalid scanned-packet completion message.')
  }
}

function invalid(): never {
  throw new ScannedPacketCompletionMessageError()
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function exactKeys(record: Record<string, unknown>, expected: string[]): boolean {
  const keys = Object.keys(record).sort()
  return (
    keys.length === expected.length &&
    keys.every((key, index) => key === expected[index])
  )
}

export function parseScannedPacketCompletionMessage(
  body: string,
): ScannedPacketCompletionMessage {
  if (
    typeof body !== 'string' ||
    body.length === 0 ||
    Buffer.byteLength(body, 'utf8') > MAX_MESSAGE_BYTES
  ) {
    invalid()
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(body) as unknown
  } catch {
    invalid()
  }
  if (!isRecord(parsed) || !exactKeys(parsed, EXPECTED_KEYS)) invalid()
  if (
    typeof parsed.JobId !== 'string' ||
    !JOB_ID_PATTERN.test(parsed.JobId) ||
    parsed.API !== SCANNED_PACKET_COMPLETION_API ||
    (parsed.Status !== 'SUCCEEDED' &&
      parsed.Status !== 'FAILED' &&
      parsed.Status !== 'ERROR') ||
    typeof parsed.JobTag !== 'string' ||
    !UUID_PATTERN.test(parsed.JobTag) ||
    !Number.isSafeInteger(parsed.Timestamp) ||
    (parsed.Timestamp as number) < 1 ||
    !isRecord(parsed.DocumentLocation) ||
    !exactKeys(parsed.DocumentLocation, EXPECTED_LOCATION_KEYS)
  ) {
    invalid()
  }

  const ingestionId = (parsed.JobTag as string).toLowerCase()
  const location = parsed.DocumentLocation as Record<string, unknown>
  const expectedKey = new RegExp(
    `^quarantine/${ingestionId.replaceAll('-', '\\-')}/source\\.(?:pdf|tiff)$`,
  )
  if (
    typeof location.S3Bucket !== 'string' ||
    !BUCKET_PATTERN.test(location.S3Bucket) ||
    typeof location.S3ObjectName !== 'string' ||
    !expectedKey.test(location.S3ObjectName)
  ) {
    invalid()
  }

  return {
    jobId: parsed.JobId as string,
    status: parsed.Status as ScannedPacketCompletionStatus,
    api: SCANNED_PACKET_COMPLETION_API,
    ingestionId,
    timestamp: parsed.Timestamp as number,
    documentLocation: {
      bucket: location.S3Bucket,
      key: location.S3ObjectName,
    },
  }
}
