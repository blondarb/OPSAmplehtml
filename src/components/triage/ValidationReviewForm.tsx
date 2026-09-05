import {
  NON_NEURO_SPECIALTY_OPTIONS,
  SUBSPECIALTY_OPTIONS,
} from '@/lib/triage/validationTypes'
import { TIER_DISPLAY, type TriageConfidence, type TriageTier } from '@/lib/triage/types'

export type WaitComfort = 'yes' | 'no' | 'uncertain'

const tiers: readonly TriageTier[] = [
  'emergent', 'urgent', 'semi_urgent', 'routine_priority', 'routine',
  'non_urgent', 'insufficient_data',
]

const fieldStyle: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', padding: '10px 12px',
  borderRadius: '8px', border: '1px solid #475569', background: '#0f172a',
  color: '#f8fafc', font: 'inherit',
}

export function ValidationReviewForm({
  caseNumber, tier, destination, confidence, waitComfort, reasoning, disabled,
  submitting, onTier, onDestination, onConfidence, onWaitComfort, onReasoning,
  onSubmit,
}: {
  caseNumber: number
  tier: TriageTier | ''
  destination: string
  confidence: TriageConfidence | ''
  waitComfort: WaitComfort | ''
  reasoning: string
  disabled: boolean
  submitting: boolean
  onTier: (value: TriageTier | '') => void
  onDestination: (value: string) => void
  onConfidence: (value: TriageConfidence | '') => void
  onWaitComfort: (value: WaitComfort | '') => void
  onReasoning: (value: string) => void
  onSubmit: () => void
}) {
  const selection = tier ? TIER_DISPLAY[tier] : null
  const saveDisabled = disabled || !tier || !confidence || !waitComfort || submitting
  return <section aria-labelledby="review-form-heading" style={{ background: 'rgba(30, 41, 59, 0.86)', border: '1px solid #334155', borderRadius: '12px', padding: '20px' }}>
    <h2 id="review-form-heading" style={{ margin: '0 0 6px' }}>Your independent label for Case {caseNumber}</h2>
    <p style={{ color: '#cbd5e1' }}>Select your own urgency and destination. AI output remains hidden until formal unblinding.</p>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px' }}>
      <label>Urgency *<select aria-label="Urgency" disabled={disabled} value={tier} onChange={(event) => onTier(event.target.value as TriageTier | '')} style={{ ...fieldStyle, marginTop: '6px' }}><option value="">Select urgency</option>{tiers.map((item) => <option key={item} value={item}>{TIER_DISPLAY[item].label}</option>)}</select></label>
      <label>Destination<select aria-label="Destination" disabled={disabled} value={destination} onChange={(event) => onDestination(event.target.value)} style={{ ...fieldStyle, marginTop: '6px' }}><option value="uncertain">Uncertain / clinician follow-up</option>{SUBSPECIALTY_OPTIONS.map((item) => <option key={item} value={item}>{item}</option>)}{NON_NEURO_SPECIALTY_OPTIONS.map((item) => <option key={item} value={`redirect:${item}`}>Redirect: {item}</option>)}</select></label>
      <label>Confidence *<select aria-label="Confidence" disabled={disabled} value={confidence} onChange={(event) => onConfidence(event.target.value as TriageConfidence | '')} style={{ ...fieldStyle, marginTop: '6px' }}><option value="">Select confidence</option><option value="high">High</option><option value="moderate">Moderate</option><option value="low">Low</option></select></label>
    </div>
    {selection && <fieldset disabled={disabled} style={{ margin: '18px 0', border: '1px solid #475569', borderRadius: '8px' }}><legend>Comfort with the wait for your selected urgency *</legend><p>Your selected {selection.label} urgency uses this displayed wait: {selection.timeframe}. This records your comfort with that wait, not a model recommendation.</p>{(['yes', 'no', 'uncertain'] as const).map((item) => <label key={item} style={{ marginRight: '16px' }}><input type="radio" name="comfortable_with_wait" checked={waitComfort === item} onChange={() => onWaitComfort(item)} /> {item === 'yes' ? 'Yes' : item === 'no' ? 'No' : 'Uncertain'}</label>)}</fieldset>}
    <label>Optional reasoning<textarea aria-label="Optional reasoning" disabled={disabled} maxLength={5000} value={reasoning} onChange={(event) => onReasoning(event.target.value)} rows={4} style={{ ...fieldStyle, marginTop: '6px', resize: 'vertical' }} /></label>
    <button type="button" disabled={saveDisabled} onClick={onSubmit} style={{ marginTop: '18px', padding: '11px 16px', border: 0, borderRadius: '8px', background: saveDisabled ? '#475569' : '#7c3aed', color: '#fff', fontWeight: 700 }}>{submitting ? 'Saving…' : 'Save label and continue'}</button>
  </section>
}
