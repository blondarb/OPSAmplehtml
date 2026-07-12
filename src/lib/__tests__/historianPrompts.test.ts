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
