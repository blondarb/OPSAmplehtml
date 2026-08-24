import { describe, it, expect } from 'vitest'
import {
  buildHistorianSystemPrompt,
  getHistorianToolDefinition,
  getHistorianToolsForProvider,
} from '@/lib/historianPrompts'

interface TestToolDefinition {
  name: string
  parameters: {
    required?: readonly string[]
    properties: Record<string, unknown>
  }
}

const getTestTools = () =>
  getHistorianToolDefinition() as unknown as TestToolDefinition[]

describe('buildHistorianSystemPrompt', () => {
  it('includes the safety block (988 / 741741 / 911 escalation)', () => {
    const prompt = buildHistorianSystemPrompt('new_patient')
    expect(prompt).toContain('988')
    expect(prompt).toContain('741741')
    expect(prompt).toContain('911')
  })

  it('includes the phased interview structure (Phase 1 turns 1-3, Phase 2 turns 4+)', () => {
    const prompt = buildHistorianSystemPrompt('new_patient')
    expect(prompt).toMatch(/Phase 1.*turns? 1.*3/i)
    expect(prompt).toMatch(/Phase 2.*turns? 4/i)
  })

  it('lists the soft turn budget (8-20)', () => {
    const prompt = buildHistorianSystemPrompt('new_patient')
    expect(prompt).toMatch(/8.*20/)
  })

  it('keeps the standard 25-turn ceiling by default', () => {
    const prompt = buildHistorianSystemPrompt('new_patient')
    expect(prompt).toMatch(/Never exceed 25 turns total/)
    expect(prompt).not.toContain('COMPREHENSIVE MODE — REQUIRED ORDER AND COVERAGE')
  })

  it('gives comprehensive mode referral-first and age-second ordering beyond 25 turns', () => {
    const prompt = buildHistorianSystemPrompt(
      'new_patient',
      'progressive gait difficulty',
      undefined,
      undefined,
      'gait difficulty',
      'comprehensive',
    )
    expect(prompt).toMatch(/^HIGHEST-PRIORITY COMPREHENSIVE OPENING STATE:/)
    expect(prompt).toContain('STATE 1 is permanently complete')
    expect(prompt).toContain('STATE 2 — AGE')
    expect(prompt).toContain('COMPREHENSIVE MODE — REQUIRED ORDER AND COVERAGE')
    expect(prompt).toMatch(/first clinical question[\s\S]*why they were referred/i)
    expect(prompt).toMatch(/second clinical question[\s\S]*how old they are/i)
    expect(prompt).toContain('In your own words, can you tell me why you were referred to see a neurologist?')
    expect(prompt).toContain('Do not substitute "what\'s been going on lately?"')
    expect(prompt).toContain('Ask the referral-reason question only once')
    expect(prompt).toContain('Natural paraphrasing is allowed')
    expect(prompt).toContain('accept it and do not repeat or rephrase the question')
    expect(prompt).toContain('including a vague or partial answer')
    expect(prompt).toContain('answer delivered in multiple speech-recognition segments')
    expect(prompt).toContain('Do not repeat it or clarify it before asking age')
    expect(prompt).toContain('How old are you?')
    expect(prompt).toContain('age_years_patient_reported')
    expect(prompt).toContain('history_coverage')
    expect(prompt).toContain('standard 25-turn ceiling does not apply')
    expect(prompt).toMatch(/45 patient exchanges/)
    expect(prompt).toMatch(/finish by 60/)
    expect(prompt).not.toMatch(/Never exceed 25 turns total/)
    expect(prompt).toMatch(/live interview still must never state, imply, or display a diagnosis/i)
  })

  it('uses the application-owned exact-question contract only for Comprehensive v2', () => {
    const prompt = buildHistorianSystemPrompt(
      'new_patient',
      'synthetic gait concern',
      'synthetic context',
      undefined,
      'gait concern',
      'comprehensive',
      'comprehensive-v2',
    )
    expect(prompt).toContain('Your first action must be to call request_history_question')
    expect(prompt).toContain('speak approved_text EXACTLY')
    expect(prompt).toContain('Do not add an example')
    expect(prompt).toContain('application independently derives coverage')
    expect(prompt).not.toContain('COMPREHENSIVE MODE — REQUIRED ORDER AND COVERAGE')
    expect(prompt).not.toContain('OPENING: As soon as the session starts')
  })

  it('instructs the historian not to re-ask already-answered details', () => {
    const prompt = buildHistorianSystemPrompt('new_patient')
    expect(prompt).toMatch(/already told you|already volunteered|already covered/i)
    expect(prompt).toMatch(/re-?ask/i)
  })

  it('does not mandate a formulaic acknowledgment before every question', () => {
    const prompt = buildHistorianSystemPrompt('new_patient')
    // The old Rule 7 said "Always acknowledge ... before moving to the next
    // question"; the revised rule warns against that formulaic pattern instead.
    expect(prompt).not.toMatch(/Always acknowledge what the patient just said before moving/i)
    expect(prompt).toMatch(/formulaic|robotic/i)
  })

  it('lists neurology focus conditions', () => {
    const prompt = buildHistorianSystemPrompt('new_patient')
    expect(prompt).toMatch(/migraine|cluster|tension/i)
    expect(prompt).toMatch(/seizure|epilep/i)
    expect(prompt).toMatch(/parkinson|essential tremor|movement/i)
    expect(prompt).toMatch(/stroke|tia/i)
  })

  it('contains the OLDCARTS framework guidance', () => {
    const prompt = buildHistorianSystemPrompt('new_patient')
    expect(prompt).toMatch(/onset/i)
    expect(prompt).toMatch(/character/i)
    expect(prompt).toMatch(/severity/i)
  })

  it('mentions the 3 tools by name (save_interview_output, query_evidence, scale_step)', () => {
    const prompt = buildHistorianSystemPrompt('new_patient')
    expect(prompt).toContain('save_interview_output')
    expect(prompt).toContain('query_evidence')
    expect(prompt).toContain('scale_step')
  })

  it('embeds referralReason when provided', () => {
    const prompt = buildHistorianSystemPrompt('new_patient', 'progressive hand tremor')
    expect(prompt).toContain('progressive hand tremor')
  })

  it('embeds patientContext when provided', () => {
    const prompt = buildHistorianSystemPrompt('new_patient', undefined, '72M, retired machinist')
    expect(prompt).toContain('72M, retired machinist')
  })

  // ── Referral-fact validation ────────────────────────────────────────────
  // The whole referral note reaches the model verbatim via patientContext, so
  // it can state referral facts as though the patient had confirmed them.

  it('tells the historian to treat referral facts as unverified until confirmed', () => {
    const prompt = buildHistorianSystemPrompt('new_patient', undefined, 'Smokes half a pack a day')
    expect(prompt).toMatch(/UNVERIFIED until the patient confirms/i)
    expect(prompt).toMatch(/NOT from this patient/i)
  })

  it('attaches the confirmation rule whenever context is present, not just for a referral focus', () => {
    // Scope regression guard: patientContext can carry the verbatim note even
    // when no referralFocus could be derived, and the facts are just as
    // unverified in that case.
    const noFocus = buildHistorianSystemPrompt('new_patient', undefined, '72M, retired machinist')
    expect(noFocus).toMatch(/CONFIRMING WHAT THE REFERRAL SAYS/)
  })

  it('does not attach the confirmation rule when there is no context at all', () => {
    const bare = buildHistorianSystemPrompt('new_patient')
    expect(bare).not.toMatch(/CONFIRMING WHAT THE REFERRAL SAYS/)
  })

  it('makes the patient authoritative over the referral on a conflict', () => {
    const prompt = buildHistorianSystemPrompt('new_patient', undefined, 'ctx')
    expect(prompt).toMatch(/the PATIENT wins/)
    expect(prompt).toMatch(/do not argue or re-assert the referral/i)
  })

  it('forbids reading the note verbatim or naming third parties in it', () => {
    const prompt = buildHistorianSystemPrompt('new_patient', undefined, 'ctx')
    expect(prompt).toMatch(/[Nn]ever read the referral note aloud verbatim/)
    expect(prompt).toMatch(/never mention another person\s+named in it/i)
  })

  // ── "Why was I referred?" ───────────────────────────────────────────────

  it('answers why-was-I-referred directly using the Nova-safe wording', () => {
    const prompt = buildHistorianSystemPrompt(
      'new_patient', 'dizziness', 'ctx', undefined, 'dizziness and balance trouble',
    )
    expect(prompt).toMatch(/IF THE PATIENT ASKS WHY THEY WERE REFERRED/)
    // The older "do not deflect" construction was removed after it tripped
    // Nova's content filter. Pin the verified equivalent instead.
    expect(prompt).toMatch(/This is their own record, so answer it directly/i)
  })

  it('requires the reason be given as symptoms, never as a suspected diagnosis', () => {
    // The referral can name a rule-out ("r/o ALS"). An AI must not be the one
    // to disclose a suspected serious diagnosis to a patient.
    const prompt = buildHistorianSystemPrompt(
      'new_patient', 'weakness', 'ctx', undefined, 'progressive weakness',
    )
    expect(prompt).toMatch(/in terms of\s+SYMPTOMS, never as a suspected diagnosis/i)
    expect(prompt).toMatch(/do NOT repeat that to the patient/)
  })

  it('tells the historian to say so rather than invent a reason when none is given', () => {
    const prompt = buildHistorianSystemPrompt(
      'new_patient', 'x', 'ctx', undefined, 'focus',
    )
    expect(prompt).toMatch(/rather than inventing one/i)
  })

  it('keeps the no-diagnosis rule intact alongside the new answer path', () => {
    const prompt = buildHistorianSystemPrompt(
      'new_patient', 'x', 'ctx', undefined, 'focus',
    )
    expect(prompt).toMatch(/not a confirmed diagnosis/)
    expect(prompt).toMatch(/Do not\s+state or imply a diagnosis/)
  })

  it('locks referral clarification to the clinician-approved question IDs', () => {
    const prompt = buildHistorianSystemPrompt(
      'referral_clarification',
      'episodic numbness',
      'stable outpatient referral',
      [
        {
          id: 'question-1',
          code: 'symptom_onset',
          text: 'When did the current symptom begin?',
        },
      ],
    )

    expect(prompt).toContain('Ask ONLY the clinician-approved questions')
    expect(prompt).toContain('question-1')
    expect(prompt).toContain('symptom_onset')
    expect(prompt).toContain('patient-reported and unverified')
    expect(prompt).toContain('Never diagnose, score urgency, clear an emergency')
    expect(prompt).not.toContain('Phase 1')
    expect(prompt).not.toContain('scale_step')
  })

  it('rejects referral clarification without an approved question set', () => {
    expect(() =>
      buildHistorianSystemPrompt('referral_clarification'),
    ).toThrow('Referral clarification requires approved questions')
  })

  it('does not let comprehensive mode expand referral clarification scope', () => {
    const prompt = buildHistorianSystemPrompt(
      'referral_clarification',
      'episodic numbness',
      'stable outpatient referral',
      [{ id: 'q1', code: 'onset', text: 'When did it begin?' }],
      null,
      'comprehensive',
    )
    expect(prompt).toContain('Ask ONLY the clinician-approved questions')
    expect(prompt).not.toContain('COMPREHENSIVE MODE')
    expect(prompt).not.toMatch(/how old/i)
  })
})

describe('getHistorianToolDefinition', () => {
  it('returns an array of exactly 3 tools', () => {
    const tools = getTestTools()
    expect(Array.isArray(tools)).toBe(true)
    expect(tools).toHaveLength(3)
  })

  it('exposes save_interview_output, query_evidence, scale_step by name', () => {
    const tools = getTestTools()
    const names = tools.map((tool) => tool.name).sort()
    expect(names).toEqual(['query_evidence', 'save_interview_output', 'scale_step'])
  })

  it('hard-limits referral clarification to the save tool', () => {
    const tools = getHistorianToolDefinition(
      'referral_clarification',
    ) as unknown as TestToolDefinition[]

    expect(tools.map((tool) => tool.name)).toEqual(['save_interview_output'])
    expect(tools[0].parameters.required).toContain('clarification_answers')
    expect(tools[0].parameters.properties.clarification_answers).toBeDefined()
  })

  it('hard-limits Nova referral clarification to the save tool', () => {
    const tools = getHistorianToolsForProvider(
      'nova',
      'referral_clarification',
    ) as Array<{ toolSpec: { name: string } }>

    expect(tools.map((tool) => tool.toolSpec.name)).toEqual([
      'save_interview_output',
    ])
  })

  it('exposes only the app-owned question and save tools in Comprehensive v2', () => {
    const openAi = getHistorianToolDefinition(
      'new_patient',
      'comprehensive-v2',
    ) as unknown as TestToolDefinition[]
    expect(openAi.map((tool) => tool.name)).toEqual([
      'request_history_question',
      'save_interview_output',
    ])

    const nova = getHistorianToolsForProvider(
      'nova',
      'new_patient',
      'comprehensive-v2',
    ) as Array<{ toolSpec: { name: string } }>
    expect(nova.map((tool) => tool.toolSpec.name)).toEqual([
      'request_history_question',
      'save_interview_output',
    ])
  })

  it('save_interview_output requires chief_complaint, hpi, narrative_summary, safety_escalated', () => {
    const tools = getTestTools()
    const tool = tools.find((candidate) => candidate.name === 'save_interview_output')
    expect(tool).toBeDefined()
    expect(tool!.parameters.required).toEqual(
      expect.arrayContaining(['chief_complaint', 'hpi', 'narrative_summary', 'safety_escalated']),
    )
  })

  it('allows patient-reported age and interview mode in the structured output', () => {
    const tools = getTestTools()
    const tool = tools.find((candidate) => candidate.name === 'save_interview_output')
    expect(tool?.parameters.properties.age_years_patient_reported).toBeDefined()
    expect(tool?.parameters.properties.interview_mode).toBeDefined()
    expect(tool?.parameters.properties.history_coverage).toBeDefined()
  })

  it('query_evidence requires question, allows focus_diagnoses optional', () => {
    const tools = getTestTools()
    const tool = tools.find((candidate) => candidate.name === 'query_evidence')
    expect(tool).toBeDefined()
    if (!tool) throw new Error('query_evidence tool missing')
    expect(tool.parameters.required).toEqual(['question'])
    expect(tool.parameters.properties.focus_diagnoses).toBeDefined()
  })

  it('scale_step requires scale_id, allows prev_index/prev_response optional', () => {
    const tools = getTestTools()
    const tool = tools.find((candidate) => candidate.name === 'scale_step')
    expect(tool).toBeDefined()
    if (!tool) throw new Error('scale_step tool missing')
    expect(tool.parameters.required).toEqual(expect.arrayContaining(['scale_id']))
    expect(tool.parameters.properties.prev_index).toBeDefined()
    expect(tool.parameters.properties.prev_response).toBeDefined()
  })
})
