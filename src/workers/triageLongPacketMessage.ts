export const LONG_PACKET_WORK_MESSAGE_VERSION = 1 as const

export type LongPacketWorkKind = 'chunk' | 'finalize'

export interface LongPacketWorkMessage {
  version: typeof LONG_PACKET_WORK_MESSAGE_VERSION
  kind: LongPacketWorkKind
  job_id: string
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const EXPECTED_KEYS = ['job_id', 'kind', 'version']
const MAX_MESSAGE_BYTES = 256

export class LongPacketWorkMessageError extends Error {
  readonly name = 'LongPacketWorkMessageError'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function parseLongPacketWorkMessage(
  body: string,
): LongPacketWorkMessage {
  if (
    typeof body !== 'string' ||
    body.length === 0 ||
    Buffer.byteLength(body, 'utf8') > MAX_MESSAGE_BYTES
  ) {
    throw new LongPacketWorkMessageError('Invalid durable work message.')
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(body) as unknown
  } catch {
    throw new LongPacketWorkMessageError('Invalid durable work message.')
  }

  if (!isRecord(parsed)) {
    throw new LongPacketWorkMessageError('Invalid durable work message.')
  }

  const keys = Object.keys(parsed).sort()
  if (
    keys.length !== EXPECTED_KEYS.length ||
    keys.some((key, index) => key !== EXPECTED_KEYS[index]) ||
    parsed.version !== LONG_PACKET_WORK_MESSAGE_VERSION ||
    (parsed.kind !== 'chunk' && parsed.kind !== 'finalize') ||
    typeof parsed.job_id !== 'string' ||
    !UUID_PATTERN.test(parsed.job_id)
  ) {
    throw new LongPacketWorkMessageError('Invalid durable work message.')
  }

  return {
    version: LONG_PACKET_WORK_MESSAGE_VERSION,
    kind: parsed.kind,
    job_id: parsed.job_id.toLowerCase(),
  }
}

export function serializeLongPacketWorkMessage(input: {
  kind: LongPacketWorkKind
  jobId: string
}): string {
  if (!UUID_PATTERN.test(input.jobId)) {
    throw new LongPacketWorkMessageError('Invalid durable work identifier.')
  }
  return JSON.stringify({
    version: LONG_PACKET_WORK_MESSAGE_VERSION,
    kind: input.kind,
    job_id: input.jobId.toLowerCase(),
  } satisfies LongPacketWorkMessage)
}
