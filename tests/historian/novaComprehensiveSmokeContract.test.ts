import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

const source = readFileSync(
  join(__dirname, '..', '..', 'scripts/nova-historian-comprehensive-smoke.ts'),
  'utf8',
)

describe('Nova Comprehensive Historian live-smoke contract', () => {
  it('uses the production Comprehensive prompt and Nova tool adapter', () => {
    expect(source).toContain("buildHistorianSystemPrompt(")
    expect(source).toContain("'comprehensive'")
    expect(source).toContain("getHistorianToolsForProvider('nova', 'new_patient')")
    expect(source).toContain('new NovaSonicSession')
  })

  it('pins referral-first and age-second acceptance', () => {
    expect(source).toContain('PASS nova_start_and_referral_first')
    expect(source).toContain('PASS nova_age_second')
    expect(source).toMatch(/how old\|your age\|age are you/)
  })

  it('aggregates Nova text fragments through a quiet window', () => {
    expect(source).toContain('onCompletionEnd')
    expect(source).toContain("assistantFragments.join(' ')")
    expect(source).toContain('TEXT_QUIET_MS')
    expect(source).toContain('finalizeAssistantTurn')
    expect(source).toContain("assistantFragments.join(' ').includes('?')")
  })

  it('does not execute tools or persist data', () => {
    expect(source).not.toContain('/api/ai/historian/save')
    expect(source).not.toContain('/api/ai/historian/transcript-flush')
    expect(source).toContain('synthetic smoke does not execute tools')
  })

  it('matches the real Nova audio path with generated silence and a synthetic patient PCM reply', () => {
    expect(source).toContain('SILENCE_PCM_BASE64')
    expect(source).toContain('session.pushAudio(SILENCE_PCM_BASE64)')
    expect(source).toContain("argumentValue('--patient-pcm')")
    expect(source).toContain('readFileSync(patientPcmPath)')
    expect(source).toContain('streamPatientAudio(session, patientPcm)')
    // The patient reply must still travel through real PCM. The only text
    // injection is the same private referral->age state nudge used by the
    // production relay after finalized patient ASR.
    expect(source).toContain('session.pushSystemText(COMPREHENSIVE_AGE_NUDGE)')
    expect(source).toContain('waitForAudioQuiet')
    expect(source).toContain('onAudioOutput')
  })

  it('redacts AWS principal and account details from failures', () => {
    expect(source).toContain('[AWS_PRINCIPAL_REDACTED]')
    expect(source).toContain('[AWS_ACCOUNT_REDACTED]')
  })
})
