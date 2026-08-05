export interface SafetyEvidenceView {
  quote: string
  startOffset: number | null
  endOffset: number | null
  pageNumber: number | null
  syndrome: string
  action: string
  source: 'deterministic' | 'safety_model'
}

export interface SafetyReviewViewModel {
  evidence: SafetyEvidenceView[]
  criticalUnknowns: string[]
  warnings: string[]
  requiresAdjudication: boolean
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : []
}

function collectEvidence(
  branch: unknown,
  source: SafetyEvidenceView['source'],
): SafetyEvidenceView[] {
  if (!isRecord(branch) || !Array.isArray(branch.signals)) return []
  const result: SafetyEvidenceView[] = []
  for (const rawSignal of branch.signals) {
    if (!isRecord(rawSignal) || !Array.isArray(rawSignal.evidence)) continue
    const syndrome =
      typeof rawSignal.syndrome === 'string' ? rawSignal.syndrome : 'unknown'
    const action =
      typeof rawSignal.action === 'string' ? rawSignal.action : 'review'
    for (const rawEvidence of rawSignal.evidence) {
      if (!isRecord(rawEvidence) || typeof rawEvidence.quote !== 'string') {
        continue
      }
      result.push({
        quote: rawEvidence.quote,
        startOffset:
          typeof rawEvidence.startOffset === 'number'
            ? rawEvidence.startOffset
            : null,
        endOffset:
          typeof rawEvidence.endOffset === 'number'
            ? rawEvidence.endOffset
            : null,
        pageNumber:
          typeof rawEvidence.pageNumber === 'number'
            ? rawEvidence.pageNumber
            : null,
        syndrome,
        action,
        source,
      })
    }
  }
  return result
}

/**
 * Whether the hold (if any) was caused, at least in part, by OUR independent
 * safety-model check failing to complete — not by a genuinely thin referral.
 * Exported standalone so a caller that only needs this one fact (e.g.
 * InsufficientDataPanel's cause-honest copy) doesn't have to build the full
 * view model and re-derive it from `warnings` text.
 */
export function hasModelSafetyFailure(safetyReview: unknown): boolean {
  return isRecord(safetyReview) && Boolean(safetyReview.modelSafetyFailure)
}

export function buildSafetyReviewViewModel(
  safetyReview: unknown,
): SafetyReviewViewModel {
  if (!isRecord(safetyReview)) {
    return {
      evidence: [],
      criticalUnknowns: [],
      warnings: [],
      requiresAdjudication: false,
    }
  }

  const deterministic = safetyReview.deterministicGateway
  const modelSafety = safetyReview.modelSafety
  const fusion = isRecord(safetyReview.fusion) ? safetyReview.fusion : null
  const allEvidence = [
    ...collectEvidence(deterministic, 'deterministic'),
    ...collectEvidence(modelSafety, 'safety_model'),
  ]
  const seen = new Set<string>()
  const evidence = allEvidence.filter((item) => {
    const key = [
      item.quote,
      item.startOffset,
      item.endOffset,
      item.pageNumber,
      item.syndrome,
      item.action,
    ].join('|')
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  const criticalUnknowns = isRecord(modelSafety)
    ? asStringArray(modelSafety.criticalUnknowns)
    : []
  const reasons = fusion ? asStringArray(fusion.reasons) : []
  const warnings: string[] = []
  if (safetyReview.modelSafetyFailure) {
    warnings.push('Independent safety-model review failed')
  }
  if (
    reasons.includes('safety_branch_disagreement') ||
    reasons.includes('model_branch_disagreement')
  ) {
    warnings.push('Safety branches disagreed')
  }
  if (safetyReview.adjudicatorFailure) {
    warnings.push('Sparse adjudication failed; conservative hold remains')
  }

  return {
    evidence,
    criticalUnknowns,
    warnings,
    requiresAdjudication: fusion?.adjudicationRequired === true,
  }
}
