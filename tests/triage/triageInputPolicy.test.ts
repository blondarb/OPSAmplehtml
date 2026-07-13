import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { assessReferralTextInput } from '@/lib/triage/triageInputPolicy'
import { FILE_CONSTRAINTS } from '@/lib/triage/types'

const MINIMUM_SERVER_INPUT_LENGTH = 50

describe('referral text input policy', () => {
  it('preserves and accepts a time-critical tail beyond the single-pass boundary', () => {
    const tail = 'Sudden aphasia and right facial droop began 20 minutes ago.'
    const text = `${'Stable background. '.repeat(3_200)}${tail}`

    expect(text.length).toBeGreaterThan(FILE_CONSTRAINTS.MAX_TEXT_LENGTH)

    const state = assessReferralTextInput(text)

    expect(state.submissionText).toBe(text)
    expect(state.submissionText.endsWith(tail)).toBe(true)
    expect(state.requiresExtraction).toBe(true)
    expect(state.exceedsVerifiedPacketLimit).toBe(false)
    expect(state.canSubmit).toBe(true)
  })

  it('retains but blocks text above the verified packet limit instead of truncating it', () => {
    const tail = 'Critical tail must remain visible to the user.'
    const text = `${'x'.repeat(FILE_CONSTRAINTS.MAX_PACKET_TEXT_LENGTH + 1)}${tail}`

    const state = assessReferralTextInput(text)

    expect(state.submissionText).toBe(text)
    expect(state.submissionText.endsWith(tail)).toBe(true)
    expect(state.exceedsVerifiedPacketLimit).toBe(true)
    expect(state.requiresExtraction).toBe(false)
    expect(state.canSubmit).toBe(false)
  })

  it('rejects referral text below the clinical minimum', () => {
    const state = assessReferralTextInput('too short')

    expect(state.belowMinimum).toBe(true)
    expect(state.canSubmit).toBe(false)
    expect(state.canRunSafetyScreen).toBe(true)
  })

  it('allows a nonempty short emergency phrase to reach the server-only safety screen without authorizing scoring', () => {
    const text = 'Sudden aphasia and right facial droop now.'

    const state = assessReferralTextInput(text)

    expect(state.submissionText).toBe(text)
    expect(state.belowMinimum).toBe(true)
    expect(state.canSubmit).toBe(false)
    expect(state.canRunSafetyScreen).toBe(true)
  })

  it('does not treat an empty short input as eligible for a server safety screen', () => {
    const state = assessReferralTextInput('   ')

    expect(state.canSubmit).toBe(false)
    expect(state.canRunSafetyScreen).toBe(false)
  })

  it('does not count surrounding whitespace toward the clinical minimum', () => {
    const text = `                    ${'x'.repeat(49)}                    `

    expect(text.length).toBeGreaterThan(MINIMUM_SERVER_INPUT_LENGTH)

    const state = assessReferralTextInput(text)

    expect(state.submissionText).toBe(text)
    expect(state.belowMinimum).toBe(true)
    expect(state.canSubmit).toBe(false)
  })

  it('binds the component submit boundary to untouched policy text without truncation', () => {
    const componentSource = readFileSync(
      new URL(
        '../../src/components/triage/TriageInputPanel.tsx',
        import.meta.url,
      ),
      'utf8',
    )

    expect(componentSource).toContain(
      'onSubmit(textInput.submissionText, validation.metadata)',
    )
    expect(componentSource).toContain(
      'onChange={(e) => handleTextChange(e.target.value)}',
    )
    expect(componentSource).toContain(
      'function handleTextChange(nextText: string)',
    )
    expect(componentSource).toContain(
      'commitVisibleIdentityChange(text, nextText, setText)',
    )
    expect(componentSource).not.toMatch(/\.(?:slice|substring)\s*\(/)
    expect(componentSource).toContain(
      'const isLongNote = textInput.requiresExtraction',
    )
    expect(componentSource).toContain('textInput.canRunSafetyScreen')
    expect(componentSource).toContain('Run Safety Check')
    expect(componentSource).toContain(
      "let buttonLabel = 'Extract & Triage'",
    )
    expect(componentSource).not.toContain('Triage This Patient')
    expect(componentSource).toContain('{isLongNote && (')
  })
})
