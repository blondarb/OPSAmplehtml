import {
  CLINICAL_ASSESSMENT_INTERVAL_UNITS,
  CLINICAL_ASSESSMENT_ORIGINS,
  clinicalAssessmentDraftForAction,
  CLINICAL_ASSESSMENT_DEFAULT_LEGACY_TIER,
  clinicalAssessmentTiersForAction,
  IMMEDIATE_CLINICAL_ASSESSMENT_ACTIONS,
  type ClinicalAssessmentDraft,
  NON_NEURO_SPECIALTY_OPTIONS,
  SUBSPECIALTY_OPTIONS,
} from '@/lib/triage/validationTypes'
import { TIER_DISPLAY, type TriageConfidence, type TriageTier } from '@/lib/triage/types'

export type WaitComfort = 'yes' | 'no' | 'uncertain'

const fieldStyle: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', padding: '10px 12px',
  borderRadius: '8px', border: '1px solid #475569', background: '#0f172a',
  color: '#f8fafc', font: 'inherit',
}

export function ValidationReviewForm({
  caseNumber, tier, confidence, waitComfort, reasoning, clinicalAssessment, disabled,
  submitting, onTier, onConfidence, onWaitComfort, onReasoning, onClinicalAssessment,
  onSubmit,
}: {
  caseNumber: number
  tier: TriageTier | ''
  confidence: TriageConfidence | ''
  waitComfort: WaitComfort | ''
  reasoning: string
  clinicalAssessment: ClinicalAssessmentDraft
  disabled: boolean
  submitting: boolean
  onTier: (value: TriageTier | '') => void
  onConfidence: (value: TriageConfidence | '') => void
  onWaitComfort: (value: WaitComfort | '') => void
  onReasoning: (value: string) => void
  onClinicalAssessment: (value: ClinicalAssessmentDraft) => void
  onSubmit: () => void
}) {
  const selection = tier ? TIER_DISPLAY[tier] : null
  const immediate = IMMEDIATE_CLINICAL_ASSESSMENT_ACTIONS.includes(clinicalAssessment.action as typeof IMMEDIATE_CLINICAL_ASSESSMENT_ACTIONS[number])
  const allowedTiers = clinicalAssessmentTiersForAction(clinicalAssessment.action) as readonly TriageTier[]
  const delayedClinicianComparison = clinicalAssessment.action === 'clinician_review_now' && tier === 'urgent'
  const timingComplete = immediate || clinicalAssessment.origin === 'unknown' || (clinicalAssessment.origin !== '' && clinicalAssessment.intervalValue !== '')
  const saveDisabled = disabled || !tier || !confidence || !waitComfort || !clinicalAssessment.action || !timingComplete || submitting
  const updateAssessment = (updates: Partial<ClinicalAssessmentDraft>) => onClinicalAssessment({ ...clinicalAssessment, ...updates })
  const toggleService = (service: string) => updateAssessment({ services: clinicalAssessment.services.includes(service) ? clinicalAssessment.services.filter(item => item !== service) : [...clinicalAssessment.services, service] })
  return <section aria-labelledby="review-form-heading" style={{ background: 'rgba(30, 41, 59, 0.86)', border: '1px solid #334155', borderRadius: '12px', padding: '20px' }}>
    <h2 id="review-form-heading" style={{ margin: '0 0 6px' }}>Your independent label for Case {caseNumber}</h2>
    <p style={{ color: '#cbd5e1' }}>Record your own source-only assessment. This is a review label, not a final clinical disposition. AI output remains hidden until formal unblinding.</p>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px' }}>
      <label>Legacy comparison tier *<select aria-label="Legacy urgency tier" disabled={disabled || !clinicalAssessment.action} value={tier} onChange={(event) => onTier(event.target.value as TriageTier | '')} style={{ ...fieldStyle, marginTop: '6px' }}><option value="">Select action first</option>{allowedTiers.map((item) => <option key={item} value={item}>{TIER_DISPLAY[item].label}</option>)}</select></label>
      <label>Action *<select aria-label="Assessment action" disabled={disabled} value={clinicalAssessment.action} onChange={(event) => { const action = event.target.value as ClinicalAssessmentDraft['action']; onClinicalAssessment(clinicalAssessmentDraftForAction(clinicalAssessment, action)); onTier(action ? CLINICAL_ASSESSMENT_DEFAULT_LEGACY_TIER[action] : ''); onWaitComfort('') }} style={{ ...fieldStyle, marginTop: '6px' }}><option value="">Select action</option><option value="emergency_now">Emergency now</option><option value="clinician_review_now">Clinician review now</option><option value="outpatient_assessment">Outpatient assessment</option><option value="clarify_before_disposition">Clarify before disposition</option></select></label>
      <label>Confidence *<select aria-label="Confidence" disabled={disabled} value={confidence} onChange={(event) => onConfidence(event.target.value as TriageConfidence | '')} style={{ ...fieldStyle, marginTop: '6px' }}><option value="">Select confidence</option><option value="high">High</option><option value="moderate">Moderate</option><option value="low">Low</option></select></label>
    </div>
    <fieldset disabled={disabled} style={{ margin: '18px 0', border: '1px solid #475569', borderRadius: '8px' }}><legend>Latest safe assessment *</legend>{immediate ? <p aria-label="Immediate assessment timing">Immediate actions are recorded at decision time, with a zero-minute interval.</p> : <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px' }}><label>Origin<select aria-label="Assessment timing origin" value={clinicalAssessment.origin} onChange={(event) => { const origin = event.target.value as ClinicalAssessmentDraft['origin']; updateAssessment({ origin, intervalValue: origin === 'unknown' ? '' : clinicalAssessment.intervalValue, anchor: origin === 'unknown' ? '' : clinicalAssessment.anchor }) }} style={{ ...fieldStyle, marginTop: '6px' }}><option value="">Select origin</option>{CLINICAL_ASSESSMENT_ORIGINS.map(origin => <option key={origin} value={origin}>{origin.replaceAll('_', ' ')}</option>)}</select></label>{clinicalAssessment.origin && clinicalAssessment.origin !== 'unknown' && <><label>Bounded interval<select aria-label="Assessment interval value" value={clinicalAssessment.intervalValue} onChange={(event) => updateAssessment({ intervalValue: event.target.value })} style={{ ...fieldStyle, marginTop: '6px' }}><option value="">Select interval</option>{[1,2,3,4,6,8,12,24,48,72,7,14,30,90,180,365].map(value => <option key={value} value={value}>{value}</option>)}</select></label><label>Unit<select aria-label="Assessment interval unit" value={clinicalAssessment.intervalUnit} onChange={(event) => updateAssessment({ intervalUnit: event.target.value as ClinicalAssessmentDraft['intervalUnit'] })} style={{ ...fieldStyle, marginTop: '6px' }}>{CLINICAL_ASSESSMENT_INTERVAL_UNITS.map(unit => <option key={unit} value={unit}>{unit}</option>)}</select></label></>}<label>Anchor (optional)<input aria-label="Assessment anchor" disabled={clinicalAssessment.origin === 'unknown'} maxLength={200} value={clinicalAssessment.anchor} onChange={(event) => updateAssessment({ anchor: event.target.value })} style={{ ...fieldStyle, marginTop: '6px' }} placeholder="e.g., documented prior exam" /></label></div>}</fieldset>
    <fieldset disabled={disabled} style={{ margin: '18px 0', border: '1px solid #475569', borderRadius: '8px' }}><legend>Services to involve (select all that apply)</legend><div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '7px' }}>{[...SUBSPECIALTY_OPTIONS, ...NON_NEURO_SPECIALTY_OPTIONS].map(service => <label key={service}><input type="checkbox" disabled={!clinicalAssessment.services.includes(service) && clinicalAssessment.services.length >= 12} checked={clinicalAssessment.services.includes(service)} onChange={() => toggleService(service)} /> {service}</label>)}</div></fieldset>
    <label>Decisive missing facts (one per line)<textarea aria-label="Decisive missing facts" disabled={disabled} maxLength={5000} value={clinicalAssessment.decisiveMissingFacts} onChange={(event) => updateAssessment({ decisiveMissingFacts: event.target.value })} rows={3} style={{ ...fieldStyle, marginTop: '6px', resize: 'vertical' }} /></label>
    {clinicalAssessment.action && <p style={{ color: '#cbd5e1', margin: '4px 0' }}>The clinical action is the reviewer-owned assessment. The constrained legacy tier is retained only for comparison with historical tier data; it does not override the clinical action.</p>}
    {selection && <fieldset disabled={disabled} style={{ margin: '18px 0', border: '1px solid #475569', borderRadius: '8px' }}><legend>Comfort with the wait for your selected urgency *</legend><p>{delayedClinicianComparison ? 'Clinician review now cannot be marked comfortable with the legacy urgent comparison wait. Select no or uncertain.' : `Your selected ${selection.label} urgency uses this displayed wait: ${selection.timeframe}. This records your comfort with that wait, not a model recommendation.`}</p>{(['yes', 'no', 'uncertain'] as const).filter(item => !delayedClinicianComparison || item !== 'yes').map((item) => <label key={item} style={{ marginRight: '16px' }}><input type="radio" name="comfortable_with_wait" checked={waitComfort === item} onChange={() => onWaitComfort(item)} /> {item === 'yes' ? 'Yes' : item === 'no' ? 'No' : 'Uncertain'}</label>)}</fieldset>}
    <label>Optional reasoning<textarea aria-label="Optional reasoning" disabled={disabled} maxLength={5000} value={reasoning} onChange={(event) => onReasoning(event.target.value)} rows={4} style={{ ...fieldStyle, marginTop: '6px', resize: 'vertical' }} /></label>
    <button type="button" disabled={saveDisabled} onClick={onSubmit} style={{ marginTop: '18px', padding: '11px 16px', border: 0, borderRadius: '8px', background: saveDisabled ? '#475569' : '#7c3aed', color: '#fff', fontWeight: 700 }}>{submitting ? 'Saving…' : 'Save label and continue'}</button>
  </section>
}
