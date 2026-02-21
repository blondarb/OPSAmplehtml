/**
 * Test Fixture: Migraine New Consult
 * Realistic clinical data for a new neurology consult — chronic migraine patient
 * Used to test merge engine with all three data sources populated
 */

import type {
  ManualNoteData,
  ChartPrepOutput,
  VisitAIOutput,
  ComprehensiveNoteData,
  ScaleResult,
  DiagnosisEntry,
  ImagingStudyEntry,
  RecommendationItem,
} from '@/lib/note-merge/types'

// ========================================
// Manual Data — clinician-entered before visit
// ========================================
export const manualData: ManualNoteData = {
  chiefComplaint: 'Chronic migraines with increasing frequency',
  hpi: 'Patient reports worsening headaches over the past 6 months. Now experiencing 12-15 headache days per month, up from 4-5 per month one year ago. Headaches are bilateral, throbbing, moderate to severe intensity (7-8/10). Associated with photophobia, phonophobia, and occasional nausea. Triggers include stress, weather changes, and poor sleep. Currently taking sumatriptan 100mg PRN which provides partial relief. No aura.',
  ros: 'Positive for headaches as above. Denies vision changes, numbness, tingling, weakness, dizziness. Reports mild neck stiffness with headaches. Sleep is poor, averaging 5-6 hours per night. Denies depression but reports frustration with headache burden.',
  physicalExam: '',
  assessment: 'Chronic migraine without aura, likely medication overuse component given frequency of triptan use',
  plan: 'Consider preventive therapy',
  vitals: { bp: '128/82', hr: '72', temp: '98.4', weight: '165', bmi: '26.3' },
}

// ========================================
// Chart Prep Data — AI summary from prior records
// ========================================
export const chartPrepData: ChartPrepOutput = {
  patientSummary: 'Sarah Chen is a 34-year-old female with a 18-year history of episodic migraines since age 16, now transforming to chronic pattern. Previously managed with OTC analgesics and PRN sumatriptan. No prior preventive therapy trials. Family history significant for migraines in mother and maternal aunt. MRI brain (2024-08) was normal. No history of seizures or other neurological conditions. Current medications: sumatriptan 100mg PRN (using 10-12 times/month), ibuprofen 400mg PRN, oral contraceptive.',
  suggestedHPI: 'Based on prior records: 18-year migraine history beginning at age 16. Initially episodic (3-4/month), now chronic pattern with 12-15 headache days/month over past 6 months. Prior normal MRI brain (Aug 2024). Current acute therapy: sumatriptan 100mg PRN, used 10-12 times/month, suggesting possible medication overuse headache component.',
  keyConsiderations: 'High triptan use frequency (10-12/month) exceeds the 10-day threshold for medication overuse headache. No prior preventive therapy trials. Normal MRI brain from 2024 provides reassurance. OCP use may be contributing factor. MIDAS score from intake questionnaire may help quantify disability.',
  suggestedAssessment: 'Chronic migraine without aura (ICD-10 G43.709) with probable medication overuse headache (G44.40). Episodic migraines have transformed over 18 years, now meeting chronic criteria (>15 headache days/month for >3 months). Triptan overuse (>10 days/month) likely contributing to headache chronification.',
  suggestedPlan: '1. Begin preventive therapy — consider CGRP monoclonal antibody (e.g., erenumab 70mg monthly) given frequency and disability level. 2. Triptan detox — reduce sumatriptan use to <10 days/month with bridge therapy (naproxen 500mg). 3. Headache diary for 4 weeks. 4. Follow-up in 6-8 weeks to assess preventive efficacy.',
}

// ========================================
// Visit AI Data — extracted from visit recording
// ========================================
export const visitAIData: VisitAIOutput = {
  hpiFromVisit: 'Patient describes headaches as bilateral, pressure-like with throbbing quality, intensity 7-8/10. Headaches last 8-12 hours untreated. Frequency has increased from 4-5/month to 12-15/month over the past 6 months. Associated symptoms include light and sound sensitivity, nausea without vomiting. No aura or visual disturbance. Triggers include work stress, barometric pressure changes, poor sleep, and skipped meals. Sumatriptan provides partial relief within 1-2 hours but headache often returns. Patient reports using sumatriptan approximately every other day. No ER visits for headache. Headaches are significantly impacting work — missed 3 days last month.',
  rosFromVisit: 'Constitutional: Reports fatigue, poor sleep (5-6 hrs/night). HEENT: Positive for bilateral headaches as described. No vision changes. Neurological: No numbness, tingling, weakness, or gait difficulty. No speech problems. Psychiatric: Denies depression, reports anxiety and frustration related to headaches. Musculoskeletal: Bilateral neck and trapezius tightness with headaches.',
  examFromVisit: 'General: Alert, well-appearing, in no acute distress. HEENT: Normocephalic, atraumatic. No temporal artery tenderness. Cranial Nerves: II-XII intact. Pupils equal, round, reactive to light. Extraocular movements full without nystagmus. Facial sensation and strength symmetric. Motor: 5/5 strength bilateral upper and lower extremities. Normal tone. Sensory: Intact to light touch throughout. Reflexes: 2+ and symmetric bilateral. Coordination: Finger-to-nose and heel-to-shin normal. Gait: Normal tandem gait. Neck: Mild bilateral trapezius tenderness to palpation. No cervical lymphadenopathy.',
  assessmentFromVisit: 'Chronic migraine without aura with medication overuse headache. Patient meets ICHD-3 criteria for chronic migraine (headache on 15+ days/month for >3 months with migraine features on at least 8 days). Concurrent medication overuse headache with triptan use >10 days/month for >3 months. No red flags on examination.',
  planFromVisit: 'Starting erenumab (Aimovig) 70mg subcutaneous injection monthly as preventive therapy. Patient to reduce triptan use — target less than 10 days per month. Bridge with naproxen 500mg BID PRN for headache days when not using triptan. Start headache diary. Discussed sleep hygiene. Return in 6 weeks for reassessment. Consider MIDAS reassessment at follow-up. Will discuss with patient whether to continue OCP or switch formulation.',
  transcriptSegments: [
    { speaker: 'provider', text: 'Good morning Sarah. Tell me about your headaches.', timestamp: '00:00:15' },
    { speaker: 'patient', text: 'They have been getting so much worse. I used to get maybe four or five a month but now its almost every other day.', timestamp: '00:00:22' },
    { speaker: 'provider', text: 'When did you notice this change?', timestamp: '00:00:45' },
    { speaker: 'patient', text: 'Probably about six months ago. It has been gradually getting worse.', timestamp: '00:00:50' },
  ],
}

// ========================================
// Scales — from patient questionnaire
// ========================================
export const scales: ScaleResult[] = [
  {
    scaleId: 'phq9',
    scaleName: 'Patient Health Questionnaire-9',
    abbreviation: 'PHQ-9',
    rawScore: 8,
    maxScore: 27,
    interpretation: 'Mild depression',
    severity: 'mild',
    completedAt: '2026-02-20T09:15:00Z',
  },
  {
    scaleId: 'midas',
    scaleName: 'Migraine Disability Assessment',
    abbreviation: 'MIDAS',
    rawScore: 32,
    maxScore: undefined,
    interpretation: 'Grade III — Moderate Disability',
    severity: 'moderate',
    completedAt: '2026-02-20T09:20:00Z',
  },
]

// ========================================
// Diagnoses
// ========================================
export const diagnoses: DiagnosisEntry[] = [
  { id: 'dx1', name: 'Chronic migraine without aura', icd10: 'G43.709', isPrimary: true, category: 'Headache' },
  { id: 'dx2', name: 'Medication overuse headache', icd10: 'G44.40', isPrimary: false, category: 'Headache' },
]

// ========================================
// Imaging
// ========================================
export const imagingStudies: ImagingStudyEntry[] = [
  {
    id: 'img1',
    studyType: 'MRI Brain without contrast',
    date: '2024-08-15',
    impression: 'normal',
    findings: 'No acute intracranial abnormality. No mass, hemorrhage, or midline shift. Normal ventricular size. No white matter lesions.',
  },
]

// ========================================
// Recommendations
// ========================================
export const recommendations: RecommendationItem[] = [
  {
    category: 'Medications',
    items: ['Start erenumab (Aimovig) 70mg SC monthly', 'Bridge therapy: naproxen 500mg BID PRN', 'Reduce sumatriptan to <10 days/month'],
    priority: 'routine',
  },
  {
    category: 'Patient Education',
    items: ['Headache diary', 'Sleep hygiene counseling', 'Trigger avoidance strategies'],
    priority: 'routine',
  },
  {
    category: 'Follow-up',
    items: ['Return visit in 6 weeks', 'MIDAS reassessment at follow-up'],
    priority: 'routine',
  },
]

// ========================================
// Comprehensive Note Data — all sources combined
// ========================================
export const comprehensiveData: ComprehensiveNoteData = {
  manualData,
  chartPrepData,
  visitAIData,
  scales,
  diagnoses,
  imagingStudies,
  recommendations,
  patient: {
    name: 'Sarah Chen',
    dob: '1992-03-14',
    mrn: 'MRN-00012345',
    age: 33,
    gender: 'Female',
  },
  visit: {
    date: '2026-02-20',
    type: 'New Consult',
    provider: 'Dr. James Wilson',
    location: 'Neurology Clinic',
  },
}

// ========================================
// Subset fixtures for specific test scenarios
// ========================================

/** Manual data only — no AI sources */
export const manualOnlyData: ComprehensiveNoteData = {
  manualData,
  chartPrepData: null,
  visitAIData: null,
  patient: comprehensiveData.patient,
  visit: comprehensiveData.visit,
}

/** Chart prep only — no visit AI or manual content */
export const chartPrepOnlyData: ComprehensiveNoteData = {
  manualData: {
    chiefComplaint: 'Chronic migraines',
    hpi: '',
    ros: '',
    physicalExam: '',
    assessment: '',
    plan: '',
  },
  chartPrepData,
  visitAIData: null,
  patient: comprehensiveData.patient,
  visit: comprehensiveData.visit,
}

/** Visit AI only — no chart prep or detailed manual content */
export const visitAIOnlyData: ComprehensiveNoteData = {
  manualData: {
    chiefComplaint: 'Chronic migraines',
    hpi: '',
    ros: '',
    physicalExam: '',
    assessment: '',
    plan: '',
  },
  chartPrepData: null,
  visitAIData,
  patient: comprehensiveData.patient,
  visit: comprehensiveData.visit,
}

/** Data with marker-contaminated fields (tests marker stripping) */
export const markerContaminatedData: ManualNoteData = {
  chiefComplaint: 'Chronic migraines',
  hpi: 'Patient reports worsening headaches.\n--- Visit AI ---\nPatient describes bilateral throbbing headaches 7-8/10.\n--- End Visit AI ---',
  ros: '--- Chart Prep ---\nPrior records note photophobia and phonophobia.\n--- End Chart Prep ---\nDenies vision changes.',
  physicalExam: '',
  assessment: '--- Visit AI ---\nChronic migraine without aura with medication overuse.\n--- End Visit AI ---',
  plan: 'Consider preventive therapy.\n--- Visit AI ---\nStart erenumab 70mg monthly.\n--- End Visit AI ---',
}

/** Conflicting data between sources (tests conflict resolution) */
export const conflictingChartPrep: ChartPrepOutput = {
  patientSummary: 'Patient with history of left-sided migraines.',
  suggestedHPI: 'Left-sided migraines, throbbing quality.',
  keyConsiderations: 'Left lateralization suggests possible cluster component.',
  suggestedAssessment: 'Left-sided chronic migraine',
}

export const conflictingVisitAI: VisitAIOutput = {
  hpiFromVisit: 'Patient reports bilateral headaches, predominantly right-sided.',
  assessmentFromVisit: 'Bilateral chronic migraine, right-sided predominance.',
}
