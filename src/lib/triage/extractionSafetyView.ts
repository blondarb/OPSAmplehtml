import type { ClinicalExtraction } from './types'

export interface ExtractionSafetyEvidenceView {
  code: string
  syndrome: string
  action: string
  quote: string
  documentId: string | null
  pageNumber: number | null
  startOffset: number
  endOffset: number
}

export interface ExtractionSafetyView {
  severity: 'emergency' | 'immediate_review' | 'none'
  requiresImmediateAction: boolean
  title: string
  message: string
  evidence: ExtractionSafetyEvidenceView[]
}

export function buildExtractionSafetyView(
  extraction: ClinicalExtraction,
): ExtractionSafetyView {
  const safety = extraction.packet_safety
  const evidence =
    safety?.signals.flatMap((signal) =>
      signal.evidence.map((item) => ({
        code: signal.code,
        syndrome: signal.syndrome,
        action: signal.action,
        ...item,
      })),
    ) ?? []

  if (safety?.care_pathway === 'emergency_now') {
    return {
      severity: 'emergency',
      requiresImmediateAction: true,
      title: 'Emergency safety signal in the complete source',
      message:
        'Do not wait for routine extraction review or scheduling. Create and complete the emergency review workflow now.',
      evidence,
    }
  }
  if (
    safety?.care_pathway === 'same_day_clinician_review' ||
    safety?.care_pathway === 'undetermined' ||
    safety?.clinician_hold
  ) {
    return {
      severity: 'immediate_review',
      requiresImmediateAction: true,
      title: 'Immediate clinician review required',
      message:
        'The source contains a possible time-critical signal, conflict, critical unknown, or unresolved safety hold.',
      evidence,
    }
  }
  return {
    severity: 'none',
    requiresImmediateAction: false,
    title: '',
    message: '',
    evidence: [],
  }
}

export function shouldAutoCreateSafetyWorkflow(
  extraction: ClinicalExtraction,
): boolean {
  return buildExtractionSafetyView(extraction).requiresImmediateAction
}
