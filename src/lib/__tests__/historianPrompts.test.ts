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
  it('pins turn style and keeps the checklist after all optional context', () => {
    const prompt = buildHistorianSystemPrompt('new_patient', 'brief zoning out', 'synthetic context', undefined, 'zoning out')
    expect(prompt).toMatch(/ONE question means one thing/)
    expect(prompt).toMatch(/HOW TO START A TURN/)
    expect(prompt).toMatch(/FOLLOW THE THREAD/)
    expect(prompt).toMatch(/EVERY TURN — CHECK BEFORE YOU SPEAK/)
    const checklistIndex = prompt.indexOf('EVERY TURN — CHECK BEFORE YOU SPEAK')
    expect(checklistIndex).toBeGreaterThan(prompt.indexOf('REFERRAL REASON:'))
    expect(checklistIndex).toBeGreaterThan(prompt.indexOf('REFERRAL-DIRECTED PRIORITY:'))
    expect(prompt.slice(checklistIndex)).toBe(`EVERY TURN — CHECK BEFORE YOU SPEAK:
1. Exactly one thing for the patient to answer.
2. No thanks, no praise, no restating — start with the question or a short topic bridge.
3. Plain words; at most one sentence before the question.
4. If the patient just named a medication, alcohol, a seizure, or an injury, follow that thread next.
5. Nothing that sounds like a diagnosis or a cause.`)
  })

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

  it('lists the deep default turn budget (45-60) with a hard ceiling', () => {
    const prompt = buildHistorianSystemPrompt('new_patient')
    expect(prompt).toMatch(/45-60/)
    expect(prompt).toMatch(/70 turns total/)
    // Guard the old shallow budget from creeping back — "aim for 8-20 turns"
    // plus "stop at clinical clarity" is what caused the ~turn-14 cutoff.
    expect(prompt).not.toMatch(/8-20 turns/)
  })

  it('honors the HISTORIAN_INTERVIEW_BUDGET env override end-to-end', () => {
    const prev = process.env.HISTORIAN_INTERVIEW_BUDGET
    process.env.HISTORIAN_INTERVIEW_BUDGET = '30-40:55'
    try {
      const prompt = buildHistorianSystemPrompt('new_patient')
      expect(prompt).toMatch(/30-40/)
      expect(prompt).toMatch(/55 turns total/)
      // Placeholders must be fully substituted — none may leak into the prompt.
      expect(prompt).not.toMatch(/\{\{(SOFT_MIN|SOFT_MAX|HARD_CAP)\}\}/)
    } finally {
      process.env.HISTORIAN_INTERVIEW_BUDGET = prev
    }
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

  it('answers why-was-I-referred instead of deflecting to the neurologist', () => {
    const prompt = buildHistorianSystemPrompt(
      'new_patient', 'dizziness', 'ctx', undefined, 'dizziness and balance trouble',
    )
    expect(prompt).toMatch(/IF THE PATIENT ASKS WHY THEY WERE REFERRED/)
    // Same intent (answer directly, don't deflect), current wording. The literal
    // "do not deflect this to the neurologist" phrasing was intentionally removed
    // in 687d7cd — Bedrock's content filter blocked that construction and killed
    // every Nova voice session — so this asserts the read-back replacement and
    // guards the forbidden phrase from creeping back.
    expect(prompt).toMatch(/Read back what the referring clinician\s+wrote/)
    expect(prompt).toMatch(/answer it directly/i)
    expect(prompt).not.toMatch(/do not deflect this to the\s+neurologist/i)
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
    expect(prompt).not.toContain('EVERY TURN — CHECK BEFORE YOU SPEAK')
    expect(prompt).not.toContain('Phase 1')
    expect(prompt).not.toContain('scale_step')
  })

  it('rejects referral clarification without an approved question set', () => {
    expect(() =>
      buildHistorianSystemPrompt('referral_clarification'),
    ).toThrow('Referral clarification requires approved questions')
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

  it('save_interview_output requires chief_complaint, hpi, narrative_summary, safety_escalated', () => {
    const tools = getTestTools()
    const tool = tools.find((candidate) => candidate.name === 'save_interview_output')
    expect(tool).toBeDefined()
    expect(tool!.parameters.required).toEqual(
      expect.arrayContaining(['chief_complaint', 'hpi', 'narrative_summary', 'safety_escalated']),
    )
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
