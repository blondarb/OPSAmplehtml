import { describe, it, expect } from 'vitest'
import {
  buildHistorianSystemPrompt,
  getHistorianToolDefinition,
} from '@/lib/historianPrompts'

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

  it('lists the soft turn budget (15-25)', () => {
    const prompt = buildHistorianSystemPrompt('new_patient')
    expect(prompt).toMatch(/15.*25/)
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

  it('leads with the referral reason directively when present', () => {
    const p = buildHistorianSystemPrompt('new_patient', 'tremors reported to PCP', undefined)
    expect(p).toMatch(/state .*reason .*as a statement/i)
    expect(p).toContain('tremors reported to PCP')
  })

  it('falls back to open-ended opening when no referral reason', () => {
    const p = buildHistorianSystemPrompt('new_patient', undefined, undefined)
    expect(p).toMatch(/describe why they are seeing a neurologist/i)
  })
})

describe('getHistorianToolDefinition', () => {
  it('returns an array of exactly 3 tools', () => {
    const tools = getHistorianToolDefinition()
    expect(Array.isArray(tools)).toBe(true)
    expect(tools).toHaveLength(3)
  })

  it('exposes save_interview_output, query_evidence, scale_step by name', () => {
    const tools = getHistorianToolDefinition()
    const names = tools.map((t: any) => t.name).sort()
    expect(names).toEqual(['query_evidence', 'save_interview_output', 'scale_step'])
  })

  it('save_interview_output requires chief_complaint, hpi, narrative_summary, safety_escalated', () => {
    const tools = getHistorianToolDefinition()
    const tool = tools.find((t: any) => t.name === 'save_interview_output')
    expect(tool).toBeDefined()
    expect(tool!.parameters.required).toEqual(
      expect.arrayContaining(['chief_complaint', 'hpi', 'narrative_summary', 'safety_escalated']),
    )
  })

  it('query_evidence requires question, allows focus_diagnoses optional', () => {
    const tools = getHistorianToolDefinition()
    const tool = tools.find((t: any) => t.name === 'query_evidence') as any
    expect(tool).toBeDefined()
    expect(tool.parameters.required).toEqual(['question'])
    expect(tool.parameters.properties.focus_diagnoses).toBeDefined()
  })

  it('scale_step requires scale_id, allows prev_index/prev_response optional', () => {
    const tools = getHistorianToolDefinition()
    const tool = tools.find((t: any) => t.name === 'scale_step') as any
    expect(tool).toBeDefined()
    expect(tool.parameters.required).toEqual(expect.arrayContaining(['scale_id']))
    expect(tool.parameters.properties.prev_index).toBeDefined()
    expect(tool.parameters.properties.prev_response).toBeDefined()
  })
})
