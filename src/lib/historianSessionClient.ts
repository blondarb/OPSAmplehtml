import type { HistorianSessionType } from '@/lib/historianTypes'

interface HistorianSessionRequestOptions {
  sessionType: HistorianSessionType
  referralReason?: string
  patientContext?: string
  provider?: 'nova' | 'openai'
  consultId?: string
}

export function buildHistorianSessionRequest(
  options: HistorianSessionRequestOptions,
) {
  return {
    sessionType: options.sessionType,
    referralReason: options.referralReason,
    patientContext: options.patientContext,
    provider: options.provider,
    ...(options.consultId ? { consult_id: options.consultId } : {}),
  }
}

export function buildHistorianRenewalRequest(
  sessionType: HistorianSessionType,
  consultId?: string,
) {
  return {
    sessionType,
    ...(consultId ? { consult_id: consultId } : {}),
  }
}
