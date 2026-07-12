import {
  serializeEmergencyAlertMessage,
  type SerializableEmergencyAlert,
} from './triageEmergencyAlertMessage'

const MAX_SQS_BATCH_SIZE = 10
const DEFAULT_DISPATCH_LIMIT = 500

export interface EmergencyAlertDispatchEntry {
  id: string
  body: string
}

export interface EmergencyAlertDispatcherDependencies {
  enqueueDueReminders: (
    limit: number,
  ) => Promise<SerializableEmergencyAlert[]>
  listDispatchableAlerts: (
    limit: number,
  ) => Promise<SerializableEmergencyAlert[]>
  sendBatch: (
    entries: EmergencyAlertDispatchEntry[],
  ) => Promise<{ failedEntryIds: string[] }>
}

export interface EmergencyAlertDispatchSummary {
  remindersCreated: number
  discovered: number
  enqueued: number
  batchCount: number
}

export class EmergencyAlertDispatchError extends Error {
  readonly name = 'EmergencyAlertDispatchError'
}

function boundedLimit(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1 || value > 1_000) {
    throw new EmergencyAlertDispatchError('Emergency alert dispatch limit is invalid.')
  }
  return value
}

function chunks<T>(items: T[], size: number): T[][] {
  const output: T[][] = []
  for (let index = 0; index < items.length; index += size) {
    output.push(items.slice(index, index + size))
  }
  return output
}

export async function dispatchEmergencyActionAlerts(
  dependencies: EmergencyAlertDispatcherDependencies,
  requestedLimit = DEFAULT_DISPATCH_LIMIT,
): Promise<EmergencyAlertDispatchSummary> {
  const limit = boundedLimit(requestedLimit)
  const reminders = await dependencies.enqueueDueReminders(limit)
  const listed = await dependencies.listDispatchableAlerts(limit)
  const unique = new Map<string, SerializableEmergencyAlert>()
  for (const item of listed) {
    const body = serializeEmergencyAlertMessage(item)
    const parsed = JSON.parse(body) as { alert_id: string; action_id: string }
    unique.set(`${parsed.alert_id}\u0000${parsed.action_id}`, item)
  }
  const work = [...unique.values()]
  if (work.length === 0) {
    return {
      remindersCreated: reminders.length,
      discovered: 0,
      enqueued: 0,
      batchCount: 0,
    }
  }

  let enqueued = 0
  let batchCount = 0
  for (const batch of chunks(work, MAX_SQS_BATCH_SIZE)) {
    const entries = batch.map((item) => ({
      id: item.alertId,
      body: serializeEmergencyAlertMessage(item),
    }))
    const response = await dependencies.sendBatch(entries)
    const failed = new Set(response.failedEntryIds)
    if (
      response.failedEntryIds.some(
        (entryId) => !entries.some((entry) => entry.id === entryId),
      )
    ) {
      throw new EmergencyAlertDispatchError(
        'Emergency alert queue returned an unknown failed entry.',
      )
    }
    enqueued += entries.filter((entry) => !failed.has(entry.id)).length
    batchCount += 1
    if (failed.size > 0) {
      throw new EmergencyAlertDispatchError(
        'Emergency alert queue batch was only partially accepted.',
      )
    }
  }

  return {
    remindersCreated: reminders.length,
    discovered: work.length,
    enqueued,
    batchCount,
  }
}
