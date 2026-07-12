export interface EmergencyAlertMessage {
  alert_id: string
  action_id: string
  severity: 'emergency'
  level: 0 | 1 | 2 | 3
}

export interface SerializableEmergencyAlert {
  alertId: string
  actionId: string
  severity: 'emergency'
  level: 0 | 1 | 2 | 3
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const EXPECTED_KEYS = ['action_id', 'alert_id', 'level', 'severity']
const MAX_MESSAGE_BYTES = 256

export class EmergencyAlertMessageError extends Error {
  readonly name = 'EmergencyAlertMessageError'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function parseEmergencyAlertMessage(
  body: string,
): EmergencyAlertMessage {
  if (
    typeof body !== 'string' ||
    body.length === 0 ||
    Buffer.byteLength(body, 'utf8') > MAX_MESSAGE_BYTES
  ) {
    throw new EmergencyAlertMessageError('Invalid emergency alert message.')
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(body) as unknown
  } catch {
    throw new EmergencyAlertMessageError('Invalid emergency alert message.')
  }
  if (!isRecord(parsed)) {
    throw new EmergencyAlertMessageError('Invalid emergency alert message.')
  }
  const keys = Object.keys(parsed).sort()
  if (
    keys.length !== EXPECTED_KEYS.length ||
    keys.some((key, index) => key !== EXPECTED_KEYS[index]) ||
    typeof parsed.alert_id !== 'string' ||
    !UUID_PATTERN.test(parsed.alert_id) ||
    typeof parsed.action_id !== 'string' ||
    !UUID_PATTERN.test(parsed.action_id) ||
    parsed.severity !== 'emergency' ||
    !Number.isSafeInteger(parsed.level) ||
    Number(parsed.level) < 0 ||
    Number(parsed.level) > 3
  ) {
    throw new EmergencyAlertMessageError('Invalid emergency alert message.')
  }
  return {
    alert_id: parsed.alert_id.toLowerCase(),
    action_id: parsed.action_id.toLowerCase(),
    severity: 'emergency',
    level: Number(parsed.level) as 0 | 1 | 2 | 3,
  }
}

export function serializeEmergencyAlertMessage(
  input: SerializableEmergencyAlert,
): string {
  const body = JSON.stringify({
    alert_id: input.alertId.toLowerCase(),
    action_id: input.actionId.toLowerCase(),
    severity: input.severity,
    level: input.level,
  })
  parseEmergencyAlertMessage(body)
  return body
}
