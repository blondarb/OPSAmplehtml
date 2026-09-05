import clinicalPolicyCatalog from '../../../../qa/triage-sentinel/clinical-policy-cases.json'
import { parseSentinelCatalog } from './catalog'

export interface ClinicalPolicySource {
  id: string
  title: string
  referralText: string
  decisionAt: string | null
}

const parsedCatalog = parseSentinelCatalog(clinicalPolicyCatalog)
export const CLINICAL_POLICY_CATALOG_ID = parsedCatalog.catalogId

export const CLINICAL_POLICY_SOURCES: readonly ClinicalPolicySource[] = Object.freeze(
  parsedCatalog.cases.flatMap(item =>
    item.input.kind === 'note'
      ? [Object.freeze({ id: item.id, title: item.title, referralText: item.input.text, decisionAt: item.decisionAt ?? null })]
      : [],
  ),
)

export function findClinicalPolicySource(input: {
  referralText: string
  patientAge: number | null
  patientSex: string | null
}): ClinicalPolicySource | null {
  if (input.patientAge !== null || input.patientSex !== null) return null
  return (
    CLINICAL_POLICY_SOURCES.find(
      (item) => item.referralText === input.referralText,
    ) ?? null
  )
}
