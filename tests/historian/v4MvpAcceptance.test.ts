import { describe, expect, it } from 'vitest'

import {
  COMPREHENSIVE_HISTORY_DOMAINS,
  type HistorianTranscriptEntry,
} from '@/lib/historianTypes'
import {
  LIVE_REVIEW_DEPTH_DIMENSIONS,
  parseLiveInterviewReviewV2,
  type LiveInterviewReviewArtifactV2,
} from '@/lib/historian/liveReviewContract'
import { createMedicationReconciliationState } from '@/lib/historian/medicationReconciliation'
import {
  buildWithheldFinalDifferential,
  deriveDiagnosticSufficiency,
} from '@/lib/historian/diagnosticSufficiency'

interface SyntheticNeurologyCase {
  id: string
  answers: string[]
}

const CASES: SyntheticNeurologyCase[] = [
  {
    id: 'recurrent_headache',
    answers: [
      'Synthetic recurrent headaches are the main concern, and the goal is to understand why they are increasing.',
      'They began gradually eight months ago and increased from monthly to twice weekly over the last six weeks.',
      'The pain is throbbing over the right temple, usually seven out of ten, and lasts four to six hours.',
      'Light and sound sensitivity and nausea occur, without weakness, speech change, fever, or loss of awareness.',
      'I miss about one work shift each month and need to lie in a dark room during the worst attacks.',
      'There was no sudden worst headache, head injury, pregnancy, cancer history, or immune suppression.',
      'Sleep loss and skipped meals can precede attacks, while hydration sometimes helps.',
      'A prior trial of physical therapy did not change the headaches.',
      'A synthetic brain MRI last year was reported as unrevealing, and there has been no lumbar puncture.',
      'There is a family history of similar headaches, but no known family stroke or seizure disorder.',
      'I do not use tobacco or recreational drugs, and I drink one caffeinated beverage most days.',
      'There are no current medicines to reconcile, no allergies reported, and nothing else I wanted to add.',
    ],
  },
  {
    id: 'episodic_loss_of_awareness',
    answers: [
      'The concern is three synthetic episodes of lost awareness, and the goal is to identify what these events represent.',
      'The first was four months ago and the most recent was two weeks ago, without events between them.',
      'A witness described staring followed by bilateral stiffening for about one minute.',
      'I was confused and tired for thirty minutes afterward, without a warning sensation or remembered speech.',
      'One event caused a minor tongue injury, but there was no fall, driving crash, or prolonged weakness.',
      'The events followed sleep deprivation, with no fever, alcohol withdrawal, or new substance exposure.',
      'There is no known meningitis, major head injury, developmental disorder, or prior childhood seizure.',
      'I stopped driving after the most recent event and need family help with transportation.',
      'A synthetic routine EEG was reported as normal, and no brain MRI has yet been completed.',
      'There is no known family epilepsy or sudden unexplained death.',
      'I do not use recreational drugs and drink alcohol rarely.',
      'There are no current medicines to reconcile, no allergies reported, and no additional episodes to describe.',
    ],
  },
  {
    id: 'length_dependent_neuropathy',
    answers: [
      'The concern is synthetic numbness and burning in both feet, and the goal is to preserve walking and sleep.',
      'It started in the toes eighteen months ago and has slowly risen to the ankles without sudden steps.',
      'The feeling is burning and pins-and-needles, five out of ten at night, with reduced temperature sensation.',
      'There is mild imbalance in the dark but no hand symptoms, focal weakness, back pain, or bowel change.',
      'I can still walk independently but stopped hiking on uneven trails and wake twice nightly from discomfort.',
      'There is a synthetic history of diet-controlled diabetes and no chemotherapy, heavy alcohol use, or bariatric surgery.',
      'Warm socks help slightly, while prolonged standing makes the burning worse.',
      'A six-week exercise program improved balance but not the sensory symptoms.',
      'Synthetic laboratory testing included a normal B12 level, and no nerve conduction study has been done.',
      'There is no known family neuropathy or high-arched-foot disorder.',
      'I do not use tobacco or recreational drugs and drink alcohol less than monthly.',
      'There are no current medicines to reconcile, no allergies reported, and no foot wounds.',
    ],
  },
  {
    id: 'demyelinating_relapse_follow_up',
    answers: [
      'The concern is a synthetic new area of left-leg numbness, and the goal is to determine whether this was a relapse.',
      'It developed over one day three weeks ago, remained for five days, and has mostly improved.',
      'The numbness extended from the hip to the foot with heaviness but no severe pain.',
      'There was urinary urgency and fatigue, without vision loss, facial symptoms, fever, or respiratory illness.',
      'I used a cane for four days and missed two workdays, but I am now walking without it.',
      'A prior synthetic episode of optic neuritis occurred four years ago, with no recent vaccination or infection.',
      'Heat temporarily worsened the old visual blur but did not change the new leg symptoms.',
      'A prior course of physical therapy improved residual balance after the earlier episode.',
      'A synthetic MRI six months ago was described as stable; no imaging was obtained during this new episode.',
      'There is no known family demyelinating disease or autoimmune neurologic condition.',
      'I do not use tobacco or recreational drugs and have reliable help at home if walking worsens.',
      'There are no current medicines to reconcile, no allergies reported, and no other new neurologic symptoms.',
    ],
  },
  {
    id: 'remote_stroke_follow_up',
    answers: [
      'The concern is recovery after a synthetic stroke six months ago, and the goal is to improve right-hand function.',
      'The original weakness and speech difficulty began suddenly six months ago and have improved steadily since discharge.',
      'Current right-hand clumsiness is mild and constant, without new fluctuation or recurrent sudden symptoms.',
      'There is residual hand numbness but no new facial droop, vision loss, severe headache, or loss of awareness.',
      'I am independent in self-care but need extra time for buttons and have not returned to woodworking.',
      'Synthetic risk history includes hypertension, without diabetes, tobacco use, atrial fibrillation, or prior stroke.',
      'Fatigue worsens dexterity late in the day, while rest and occupational exercises help.',
      'Outpatient occupational therapy improved grip and handwriting over three months.',
      'Synthetic hospital imaging reportedly showed a small left-sided infarct; the exact images are not available here.',
      'There is a family history of hypertension but no known early stroke or clotting disorder.',
      'I do not use tobacco or recreational drugs, and family is available if new symptoms occur.',
      'There are no current medicines to reconcile in this fixture, no allergies reported, and no new emergency symptoms.',
    ],
  },
]

function transcriptFor(testCase: SyntheticNeurologyCase): HistorianTranscriptEntry[] {
  return testCase.answers.flatMap((answer, index) => [
    { role: 'assistant' as const, text: `Synthetic case-specific question ${index + 1}?`, timestamp: index * 2, seq: index * 2 + 1 },
    { role: 'user' as const, text: answer, timestamp: index * 2 + 1, seq: index * 2 + 2 },
  ])
}

function artifactFor(
  transcript: HistorianTranscriptEntry[],
  options: { shallowDimension?: number; uncertain?: boolean } = {},
): LiveInterviewReviewArtifactV2 {
  const patientSeqs = transcript.filter((entry) => entry.role === 'user').map((entry) => entry.seq!)
  const shallowDimension = options.shallowDimension
  const review = parseLiveInterviewReviewV2({
    version: 2,
    reviewed_through_seq: patientSeqs.at(-1),
    domains: COMPREHENSIVE_HISTORY_DOMAINS.map((domain, index) => ({
      domain: domain.id,
      status: options.uncertain && index === 0 ? 'uncertain' : 'covered',
      patient_seqs: [patientSeqs[index % patientSeqs.length]],
    })),
    critical_gaps: shallowDimension == null ? [] : [{
      domain: COMPREHENSIVE_HISTORY_DOMAINS[0].id,
      reason: 'The synthetic history lacks a discriminating chronology detail.',
      question_intent: 'Clarify the highest-value missing chronology discriminator.',
    }],
    contradictions: [],
    repetitions: [],
    medications: [],
    active_safety_concern: { present: false, patient_seqs: [] },
    diagnostic_depth: {
      dimensions: LIVE_REVIEW_DEPTH_DIMENSIONS.map((dimension, index) => ({
        dimension,
        status: shallowDimension === index ? 'missing' : options.uncertain && index === 4 ? 'uncertain' : 'adequate',
        patient_seqs: shallowDimension === index ? [] : [patientSeqs[index % patientSeqs.length]],
      })),
      depth_sufficient: shallowDimension == null,
    },
    ready_to_close: shallowDimension == null,
    next_question_intents: shallowDimension == null
      ? []
      : ['Clarify the highest-value missing chronology discriminator.'],
    confidence: shallowDimension == null ? 'high' : 'medium',
  }, transcript)
  return {
    review,
    provenance: {
      modelId: 'synthetic-depth-reviewer',
      promptVersion: 'historian-live-review-v2',
      generatedAt: '2026-08-25T12:00:00.000Z',
    },
    attestation: 'a'.repeat(43),
  }
}

function closedMedicationLedger() {
  const state = createMedicationReconciliationState()
  state.inventoryStatus = 'answered'
  state.inventoryPatientSeq = 24
  return state
}

describe('Comprehensive v4 synthetic neurologic MVP contract', () => {
  it.each(CASES)('$id has case-specific evidence across every depth dimension before DDx is allowed', (testCase) => {
    const transcript = transcriptFor(testCase)
    const sufficiency = deriveDiagnosticSufficiency({
      transcript,
      promptVersion: 'comprehensive-v4',
      completionStatus: 'complete',
      terminationReason: 'coverage_complete',
      reviewArtifact: artifactFor(transcript),
      medicationState: closedMedicationLedger(),
      generatedAt: new Date('2026-08-25T12:30:00.000Z'),
    })
    expect(sufficiency).toMatchObject({
      outcome: 'sufficient',
      ddx_allowed: true,
      patient_turn_count: 12,
    })
    expect(sufficiency.dimensions).toHaveLength(LIVE_REVIEW_DEPTH_DIMENSIONS.length)
    expect(sufficiency.dimensions.every((item) => item.patient_seqs.length > 0)).toBe(true)
  })

  it('keeps asking when a case is broad but diagnostically shallow', () => {
    const transcript = transcriptFor(CASES[0])
    const artifact = artifactFor(transcript, { shallowDimension: 1 })
    expect(artifact.review.readyToClose).toBe(false)
    expect(artifact.review.nextQuestionIntents).toEqual([
      'Clarify the highest-value missing chronology discriminator.',
    ])
    const sufficiency = deriveDiagnosticSufficiency({
      transcript,
      promptVersion: 'comprehensive-v4',
      completionStatus: 'complete',
      terminationReason: 'coverage_complete',
      reviewArtifact: artifact,
      medicationState: closedMedicationLedger(),
    })
    expect(sufficiency).toMatchObject({ outcome: 'insufficient_depth', ddx_allowed: false })
  })

  it('labels transcript uncertainty without converting it to false certainty', () => {
    const transcript = transcriptFor(CASES[2])
    const sufficiency = deriveDiagnosticSufficiency({
      transcript,
      promptVersion: 'comprehensive-v4',
      completionStatus: 'complete',
      terminationReason: 'complete_with_uncertainty',
      reviewArtifact: artifactFor(transcript, { uncertain: true }),
      medicationState: closedMedicationLedger(),
    })
    expect(sufficiency).toMatchObject({ outcome: 'sufficient_with_uncertainty', ddx_allowed: true })
    expect(sufficiency.uncertainty_domains).toHaveLength(1)
  })

  it('withholds DDx after a disconnected partial interview even when prior answers were useful', () => {
    const transcript = transcriptFor(CASES[1]).slice(0, 12)
    const sufficiency = deriveDiagnosticSufficiency({
      transcript,
      promptVersion: 'comprehensive-v4',
      completionStatus: 'ended_early',
      terminationReason: 'transport_lost',
      reviewArtifact: null,
      medicationState: null,
    })
    expect(sufficiency).toMatchObject({ outcome: 'insufficient_partial', ddx_allowed: false })
    expect(buildWithheldFinalDifferential(sufficiency)).toMatchObject({ status: 'withheld_partial' })
  })
})
