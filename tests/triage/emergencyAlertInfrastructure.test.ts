import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const template = readFileSync(
  resolve(process.cwd(), 'infrastructure/triage-worker/template.yaml'),
  'utf8',
)

describe('emergency alert publisher infrastructure', () => {
  it('defines isolated encrypted work, DLQ, and FIFO delivery queues with TLS enforcement', () => {
    for (const resource of [
      'EmergencyAlertWorkDeadLetterQueue:',
      'EmergencyAlertWorkQueue:',
      'EmergencyAlertDeliveryDeadLetterQueue:',
      'EmergencyAlertDeliveryQueue:',
      'EmergencyAlertQueueTlsPolicy:',
    ]) {
      expect(template).toContain(resource)
    }
    const alertSection = template.slice(
      template.indexOf('EmergencyAlertWorkDeadLetterQueue:'),
    )
    expect(alertSection.match(/SqsManagedSseEnabled: true/g)?.length).toBeGreaterThanOrEqual(3)
    expect(alertSection).toContain('FifoQueue: true')
    expect(alertSection).toContain('ContentBasedDeduplication: true')
    expect(alertSection).toContain("aws:SecureTransport: 'false'")
    const deliveryQueueSection = template.slice(
      template.indexOf('EmergencyAlertDeliveryQueue:'),
      template.indexOf('EmergencyAlertQueueTlsPolicy:'),
    )
    expect(deliveryQueueSection).toContain('VisibilityTimeout: 120')
    expect(deliveryQueueSection).toContain('maxReceiveCount: 10')
  })

  it('creates a scheduled dispatcher and partial-batch publisher with least-privilege queue access', () => {
    expect(template).toContain('EmergencyAlertDispatcherFunction:')
    expect(template).toContain('EmergencyAlertPublisherFunction:')
    expect(template).toContain('EmergencyAlertDeliveryWorkerFunction:')
    expect(template).toContain('EmergencyAlertDeliveryDispatcherFunction:')
    expect(template).toContain(
      'Handler: src/workers/triageEmergencyAlertDispatcher.handler',
    )
    expect(template).toContain(
      'Handler: src/workers/triageEmergencyAlertWorker.handler',
    )
    expect(template).toContain(
      'Handler: src/workers/triageEmergencyAlertDeliveryWorker.handler',
    )
    expect(template).toContain(
      'Handler: src/workers/triageEmergencyAlertDeliveryDispatcher.handler',
    )
    expect(template).toContain('TRIAGE_EMERGENCY_ALERT_WORK_QUEUE_URL:')
    expect(template).toContain('TRIAGE_EMERGENCY_ALERT_DELIVERY_QUEUE_URL:')
    expect(template).toContain('ScheduleExpression: rate(1 minute)')
    expect(template).toContain('FunctionResponseTypes:')
    expect(template).toContain('ReportBatchItemFailures')
    expect(template).toContain('SendOpaqueEmergencyAlerts')
    expect(template).toContain('ConsumeOpaqueEmergencyAlertWork')
    const deliveryWorkerSection = template.slice(
      template.indexOf('EmergencyAlertDeliveryWorkerFunction:'),
      template.indexOf('WorkerLogGroup:'),
    )
    expect(deliveryWorkerSection).toContain('Timeout: 20')
    expect(deliveryWorkerSection).toContain('BatchSize: 1')
    expect(deliveryWorkerSection).toContain(
      "TRIAGE_EMERGENCY_ALERT_DELIVERY_LEASE_SECONDS: '60'",
    )
  })

  it('alarms on DLQ, queue age, publisher errors, delivery backlog, and terminal database failures', () => {
    for (const resource of [
      'EmergencyAlertDeadLetterAlarm:',
      'EmergencyAlertQueueAgeAlarm:',
      'EmergencyAlertPublisherErrorAlarm:',
      'EmergencyAlertDispatcherHeartbeatAlarm:',
      'EmergencyAlertDeliveryAgeAlarm:',
      'EmergencyAlertDeliveryDeadLetterAlarm:',
      'EmergencyAlertDeliveryWorkerErrorAlarm:',
      'EmergencyAlertDeliveryDispatcherErrorAlarm:',
      'EmergencyAlertDeliveryDispatcherHeartbeatAlarm:',
      'EmergencyAlertDeliveryTerminalFailureMetric:',
      'EmergencyAlertDeliveryTerminalFailureAlarm:',
      'EmergencyAlertTerminalFailureMetric:',
      'EmergencyAlertTerminalFailureAlarm:',
    ]) {
      expect(template).toContain(resource)
    }
    expect(template).toContain(
      'triage_emergency_alert_terminal_failure',
    )
    expect(template).toContain(
      'triage_emergency_alert_delivery_terminal_failure',
    )
  })
})
