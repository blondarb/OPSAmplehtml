import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  COMPREHENSIVE_SCENARIOS,
  runComprehensiveScenario,
} from '../../src/lib/historian/comprehensiveScenarioContract'

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

  it('matches the real Nova audio path with generated silence and a fixed synthetic TTS reply', () => {
    expect(source).toContain('SILENCE_PCM_BASE64')
    expect(source).toContain('session.pushAudio(SILENCE_PCM_BASE64)')
    expect(source).toContain('generateSyntheticPatientPcm()')
    expect(source).toContain("'I am sixty years old.'")
    expect(source).toContain("'/usr/bin/say'")
    expect(source).toContain("'ffmpeg'")
    expect(source).toContain('streamPatientAudio(session, patientPcm)')
    expect(source).not.toContain("argumentValue('--patient-pcm')")
    expect(source).not.toContain('console.log(`[synthetic patient transcript] ${content}`)')
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

  it('continues through exchange 26 without a non-safety save', () => {
    const report = runComprehensiveScenario(COMPREHENSIVE_SCENARIOS['continue-past-25'])
    expect(report.finalExchange).toBe(26)
    expect(report.terminal).toBe(false)
    expect(report.actions.filter((action) => action.type === 'request_finalization')).toEqual([])
  })

  it('escalates and requests finalization for the fixed synthetic emergency at exchange 26', () => {
    const report = runComprehensiveScenario(COMPREHENSIVE_SCENARIOS['emergency-at-26'])
    expect(report.terminal).toBe(true)
    expect(report.actions).toContainEqual({ type: 'safety_escalation', exchange: 26 })
    expect(report.actions).toContainEqual({
      type: 'request_finalization', exchange: 26, reason: 'safety_escalated',
    })
    expect(report.actions).not.toContainEqual({ type: 'continue', exchange: 26 })
  })

  it('begins benign wrapping once at 45 and requests hard-stop finalization at 60', () => {
    const report = runComprehensiveScenario(COMPREHENSIVE_SCENARIOS['benign-wrap-to-60'])
    expect(report.terminal).toBe(true)
    expect(report.actions).toContainEqual({ type: 'begin_wrap', exchange: 45 })
    expect(report.actions).toContainEqual({
      type: 'request_finalization', exchange: 60, reason: 'hard_stop',
    })
    expect(report.actions.filter((action) => action.type === 'begin_wrap')).toHaveLength(1)
    expect(report.actions.filter((action) => action.type === 'request_finalization')).toHaveLength(1)
  })

  it('keeps live Nova execution explicit and reports provider/IAM failures as NOT_RUN', () => {
    expect(source).toContain("process.argv.includes('--live')")
    expect(source).toContain('NOT_RUN nova_live_provider_or_iam')
    expect(source).toContain('runAllComprehensiveScenarios')
  })
})
