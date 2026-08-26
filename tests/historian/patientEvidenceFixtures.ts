import { COMPREHENSIVE_PATIENT_EVIDENCE_PLAN } from '@/lib/historian/patientEvidenceController'

const OPEN_DETAIL_ANSWERS: Readonly<Record<string, string>> = {
  referral_reason: 'Synthetic recurring headaches led to this referral.',
  patient_reported_age: '45 years old.',
  symptom_description: 'A steady synthetic headache.',
  symptom_onset: 'Three months ago.',
  symptom_onset_context: 'While resting at home.',
  symptom_typical_evolution: 'It begins mildly, builds, and then fades.',
  symptom_most_recent: 'Yesterday.',
  symptom_location: 'Across the forehead.',
  symptom_frequency: 'Once each week.',
  symptom_episode_duration: 'About one hour.',
  symptom_course: 'It has stayed about the same.',
  symptom_severity: 'Seven out of ten.',
  symptom_triggers: 'Bright light can bring it on.',
  symptom_relief: 'Rest in a quiet room helps.',
  symptom_treatments_tried: 'Rest has been tried.',
  associated_symptoms: 'Mild nausea happens at the same time.',
  functional_impact: 'It makes household chores slower.',
  functional_sleep_impact: 'It makes falling asleep harder.',
  functional_work_impact: 'It makes computer work slower.',
  neurologic_weakness_detail: 'The synthetic weakness affects the left hand.',
  past_medical_history: 'A synthetic history of high blood pressure.',
  past_hospitalizations: 'One synthetic overnight hospital stay.',
  past_surgical_history: 'One synthetic prior operation.',
  medications: 'One synthetic daily medication.',
  medication_doses: 'One synthetic tablet each morning.',
  medication_adherence: 'It is taken every morning.',
  medication_side_effects: 'Mild synthetic stomach upset.',
  allergies: 'One synthetic medication allergy.',
  allergy_reactions: 'A synthetic rash.',
  living_situation: 'With family.',
  occupation: 'Office work.',
  alcohol_use: 'One drink per month.',
  prior_studies: 'A synthetic brain scan.',
  prior_study_timing: 'Last month.',
  prior_study_location: 'At a synthetic outpatient imaging center.',
  prior_study_results: 'The patient was told it showed no urgent finding.',
  patient_goals: 'A clearer plan for the neurology visit.',
  patient_questions: 'Whether any additional testing is needed.',
}

export function syntheticPatientAnswer(
  obligationId: string,
  mode: 'baseline' | 'maximal' = 'baseline',
): string {
  const obligation = COMPREHENSIVE_PATIENT_EVIDENCE_PLAN.find(
    (candidate) => candidate.id === obligationId,
  )
  if (!obligation) throw new Error(`Unknown synthetic evidence obligation: ${obligationId}`)

  if (obligation.responseContract === 'binary') {
    // Keep the active-emergency screen negative even in the maximal fixture;
    // the maximal path exercises every conditional without simulating an
    // emergency that would correctly end the runtime acceptance session.
    return mode === 'maximal' && obligation.id !== 'red_flags' ? 'Yes.' : 'No.'
  }
  if (mode === 'baseline' && obligation.responseContract === 'open_none_allowed') {
    return 'None.'
  }
  const answer = OPEN_DETAIL_ANSWERS[obligation.id]
  if (!answer) throw new Error(`Missing synthetic detail answer for ${obligation.id}`)
  return answer
}
