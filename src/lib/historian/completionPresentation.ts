import type { HistorianTerminationReason } from '@/lib/historianTypes'

export interface HistorianPatientCompletionPresentation {
  title: string
  body: string
  tone: 'success' | 'warning'
}

export function historianPatientCompletionPresentation(
  endedEarly: boolean,
  terminationReason: HistorianTerminationReason,
): HistorianPatientCompletionPresentation {
  if (!endedEarly) {
    return {
      title: 'Interview Complete',
      body: 'Thank you for completing the intake interview. Your physician will review this information before your appointment.',
      tone: 'success',
    }
  }

  if (terminationReason === 'provider_error' || terminationReason === 'transport_lost') {
    return {
      title: 'Partial interview saved',
      body: 'The microphone or voice connection stopped. Your answers through the last confirmed turn were saved for your physician to review. The clinic may ask you to complete a new interview.',
      tone: 'warning',
    }
  }

  if (terminationReason === 'unresponsive') {
    return {
      title: 'Partial interview saved',
      body: 'The interview ended after the system could no longer hear a response. Your answers through the last confirmed turn were saved for your physician to review.',
      tone: 'warning',
    }
  }

  if (terminationReason === 'hard_stop') {
    return {
      title: 'Interview saved at the time limit',
      body: 'The answers collected through the final confirmed turn were saved for your physician to review.',
      tone: 'warning',
    }
  }

  if (terminationReason === 'safety_escalated') {
    return {
      title: 'Interview saved for urgent review',
      body: 'The answers collected through the final confirmed turn were saved and the safety escalation was recorded.',
      tone: 'warning',
    }
  }

  return {
    title: 'Interview saved',
    body: 'The answers you provided were saved for your physician to review.',
    tone: 'warning',
  }
}
