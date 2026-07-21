/**
 * TDD, pure-function tests for the synthetic patient agent's prompt
 * assembly (Historian Validation Suite Task 6). No Bedrock calls, no fs —
 * `buildPatientSystemPrompt`/`toBedrockMessages` are plain data-in/data-out
 * functions. `generatePatientReply` is exercised separately below with an
 * injected fake `invoke`, per the module's own "Bedrock call wrapper"
 * design — never a real network/Bedrock call in this file.
 */
import { describe, it, expect, vi } from 'vitest'
import {
  buildPatientSystemPrompt,
  toBedrockMessages,
  generatePatientReply,
  type PatientAgentTurn,
} from '@/lib/historian/synthetic/patientAgent'
import type { PersonaProfile } from '@/lib/historian/eval/personaFixtures'

function makeProfile(overrides: Partial<PersonaProfile> = {}): PersonaProfile {
  return {
    id: 'acute-stroke',
    demographics: { name: 'Robert Williams', age: 68, sex: 'M', dateOfBirth: '07/22/1957' },
    historyResponses: [
      { questionPattern: 'What happened today?', response: 'My left hand stopped working.' },
      { questionPattern: 'When did this start?', response: 'About two hours ago.' },
    ],
    structuredHistory: {
      onset: 'Sudden, approximately 2 hours prior.',
      family_history: 'Father: MI. Mother: DM2, CVA.',
    },
    chiefComplaint: 'Sudden left-sided weakness and slurred speech',
    ...overrides,
  }
}

describe('buildPatientSystemPrompt', () => {
  it('includes demographics', () => {
    const prompt = buildPatientSystemPrompt(makeProfile())
    expect(prompt).toContain('Robert Williams')
    expect(prompt).toContain('68')
    expect(prompt).toContain('M')
  })

  it('includes the chief complaint under a reason-for-visit line', () => {
    const prompt = buildPatientSystemPrompt(makeProfile())
    expect(prompt).toMatch(/Reason for visit:.*Sudden left-sided weakness/)
  })

  it('includes structuredHistory facts verbatim', () => {
    const prompt = buildPatientSystemPrompt(makeProfile())
    expect(prompt).toContain('Sudden, approximately 2 hours prior.')
    expect(prompt).toContain('Father: MI. Mother: DM2, CVA.')
  })

  it('includes the historyResponses as reference example phrasing', () => {
    const prompt = buildPatientSystemPrompt(makeProfile())
    expect(prompt).toContain('What happened today?')
    expect(prompt).toContain('My left hand stopped working.')
  })

  it('instructs short, natural, non-volunteering answers (brief spec constraints)', () => {
    const prompt = buildPatientSystemPrompt(makeProfile())
    expect(prompt.toLowerCase()).toContain('1-3 conversational sentences')
    expect(prompt.toLowerCase()).toContain('do not volunteer')
    expect(prompt.toLowerCase()).toContain('answer only what was asked')
  })

  it('instructs the model to never break character or reveal it is an AI', () => {
    const prompt = buildPatientSystemPrompt(makeProfile())
    expect(prompt.toLowerCase()).toMatch(/never (say|reveal|break character)/)
  })

  it('never crashes and omits empty sections gracefully when structuredHistory/historyResponses/chiefComplaint are empty', () => {
    const prompt = buildPatientSystemPrompt(
      makeProfile({ structuredHistory: {}, historyResponses: [], chiefComplaint: '' }),
    )
    expect(prompt).not.toContain('Reason for visit:')
    expect(prompt.length).toBeGreaterThan(0)
  })

  it('is pure — identical input produces identical output', () => {
    const profile = makeProfile()
    expect(buildPatientSystemPrompt(profile)).toBe(buildPatientSystemPrompt(profile))
  })
})

describe('toBedrockMessages', () => {
  it('flips historian ("assistant") turns to Bedrock "user" role and patient ("user") turns to Bedrock "assistant" role', () => {
    const conversation: PatientAgentTurn[] = [
      { role: 'assistant', text: 'What happened today?' },
      { role: 'user', text: 'My hand stopped working.' },
      { role: 'assistant', text: 'When did this start?' },
      { role: 'user', text: 'About two hours ago.' },
    ]
    const messages = toBedrockMessages(conversation)
    expect(messages).toEqual([
      { role: 'user', content: 'What happened today?' },
      { role: 'assistant', content: 'My hand stopped working.' },
      { role: 'user', content: 'When did this start?' },
      { role: 'assistant', content: 'About two hours ago.' },
    ])
  })

  it('returns an empty array for an empty conversation', () => {
    expect(toBedrockMessages([])).toEqual([])
  })
})

describe('generatePatientReply', () => {
  it('invokes Bedrock with the built system prompt and role-flipped messages, returning trimmed text', async () => {
    const profile = makeProfile()
    const conversation: PatientAgentTurn[] = [{ role: 'assistant', text: 'What happened today?' }]
    const invoke = vi.fn().mockResolvedValue({ text: '  My hand stopped working.  ' })

    const reply = await generatePatientReply({ profile, conversation, invoke })

    expect(reply).toBe('My hand stopped working.')
    expect(invoke).toHaveBeenCalledTimes(1)
    const callArg = invoke.mock.calls[0][0]
    expect(callArg.system).toBe(buildPatientSystemPrompt(profile))
    expect(callArg.messages).toEqual([{ role: 'user', content: 'What happened today?' }])
  })

  it('propagates a Bedrock invoke failure rather than swallowing it', async () => {
    const invoke = vi.fn().mockRejectedValue(new Error('bedrock down'))
    await expect(
      generatePatientReply({ profile: makeProfile(), conversation: [], invoke }),
    ).rejects.toThrow('bedrock down')
  })
})
