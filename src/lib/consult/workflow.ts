import type { ConsultStatus } from './types'

export type ConsultStepId = 'triage' | 'historian' | 'patient_tools' | 'report'

export interface ConsultHistorianGate {
  allowed: boolean
  reason?: string
}

const HISTORIAN_STATUSES: ConsultStatus[] = [
  'triage_complete',
  'intake_pending',
  'intake_in_progress',
  'intake_complete',
  'historian_pending',
  'historian_in_progress',
]

export function getConsultActiveStep(
  status: ConsultStatus | null,
  historianGate?: ConsultHistorianGate,
): ConsultStepId {
  if (!status || status === 'triage_pending') return 'triage'
  if (HISTORIAN_STATUSES.includes(status)) {
    return historianGate?.allowed ? 'historian' : 'triage'
  }
  if (status === 'historian_complete') return 'patient_tools'
  return 'report'
}

const STEP_ORDER: ConsultStepId[] = [
  'triage',
  'historian',
  'patient_tools',
  'report',
]

export function isConsultStepComplete(
  stepId: ConsultStepId,
  status: ConsultStatus | null,
  historianGate?: ConsultHistorianGate,
): boolean {
  if (!status) return false
  const activeStep = getConsultActiveStep(status, historianGate)
  return STEP_ORDER.indexOf(activeStep) > STEP_ORDER.indexOf(stepId)
}
