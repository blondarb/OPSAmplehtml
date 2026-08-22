import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  COMPREHENSIVE_SCENARIOS,
  runComprehensiveScenario,
} from '../../src/lib/historian/comprehensiveScenarioContract'
import {
  LIVE_SYNTHETIC_COVERAGE_SAVE_NUDGE,
  LIVE_SYNTHETIC_SCENARIOS,
  LIVE_SYNTHETIC_WRAP_SAVE_NUDGE,
  assessLiveSyntheticSave,
  safetyResponseHasRequiredResources,
} from '../../src/lib/historian/liveSyntheticAcceptance'
import { COMPREHENSIVE_HISTORY_DOMAINS } from '../../src/lib/historianTypes'

const source = readFileSync(
  join(__dirname, '..', '..', 'scripts/nova-historian-comprehensive-smoke.ts'),
  'utf8',
)

const completeHistory = {
  history_coverage: {
    covered_domains: COMPREHENSIVE_HISTORY_DOMAINS.map((domain) => domain.id),
    missing_or_uncertain: [],
  },
}

describe('Nova Comprehensive Historian acceptance contract', () => {
  it('uses the production Comprehensive prompt, tool adapter, and Nova audio session', () => {
    expect(source).toContain('buildHistorianSystemPrompt(')
    expect(source).toContain("'comprehensive'")
    expect(source).toContain("getHistorianToolsForProvider('nova', 'new_patient')")
    expect(source).toContain('new NovaSonicSession')
    expect(source).toContain('streamPatientAudio(session, patientPcm)')
  })

  it('keeps opening referral-first and age-second acceptance live and explicit', () => {
    expect(source).toContain('PASS nova_start_and_referral_first')
    expect(source).toContain('PASS nova_age_second')
    expect(source).toMatch(/how old\|your age\|age are you/)
    expect(source).toContain('session.pushSystemText(COMPREHENSIVE_AGE_NUDGE)')
    expect(source).toContain('onAssistantAudioEnd: finalizeAssistantTurn')
    expect(source).not.toContain('onCompletionEnd: finalizeAssistantTurn')
  })

  it('keeps all patient input fixed, PHI-free, and on the real PCM path', () => {
    expect(source).toContain('generateFixedSyntheticPatientPcm')
    expect(source).toContain("'/usr/bin/say'")
    expect(source).toContain("'ffmpeg'")
    expect(source).toContain('SILENCE_PCM_BASE64')
    expect(source).not.toContain("argumentValue('--patient-pcm')")
    expect(source).not.toContain("argumentValue('--patient-text')")
    expect(source).not.toContain('console.log(`[synthetic patient transcript] ${content}`)')
  })

  it('does not persist, deploy, or call application APIs', () => {
    expect(source).not.toContain('/api/ai/historian/save')
    expect(source).not.toContain('/api/ai/historian/transcript-flush')
    expect(source).not.toContain('fetch(')
    expect(source).toContain('sendGreetingKickoff: false')
  })

  it('labels logical boundary evidence as state injected rather than endurance', () => {
    expect(source).toContain('PASS live_state_injected_')
    expect(LIVE_SYNTHETIC_SCENARIOS['coverage-at-26'].stateInjection).toContain('LIVE_STATE_INJECTED')
    expect(LIVE_SYNTHETIC_SCENARIOS['hard-stop-at-60'].stateInjection).toContain(
      'not evidence of single-connection endurance',
    )
  })

  it('keeps forced live continuation PHI-free and explicitly bounded', () => {
    expect(source).toContain("process.argv.includes('--live-continuation')")
    expect(source).toContain('PASS live_forced_short_relay_continuation_three_segments')
    expect(source).toContain('PASS LIVE_CONTINUATION_CONSERVATIVE_REPLAY')
    expect(source).toContain('LIMIT live_forced_short_not_endurance_not_persistence_not_deployed')
    expect(source).toContain('NOVA_APP_CONTINUATION_V1')
    expect(source).toContain('conservativeHistorianContinuationCoverage')
  })

  it('accepts only coverage-complete output at logical exchange 26', () => {
    expect(LIVE_SYNTHETIC_COVERAGE_SAVE_NUDGE).toContain('LIVE_STATE_INJECTED')
    expect(LIVE_SYNTHETIC_COVERAGE_SAVE_NUDGE).toContain('Immediately call save_interview_output')
    expect(source).toContain("scenario.purpose === 'coverage' && !coverageSaveNudgeSent")
    const assessment = assessLiveSyntheticSave({
      scenario: LIVE_SYNTHETIC_SCENARIOS['coverage-at-26'],
      structured: completeHistory,
      toolSafetyEscalated: false,
      toolPatientRequestedStop: false,
    })
    expect(assessment).toMatchObject({ accepted: true, reason: 'coverage_complete' })

    expect(assessLiveSyntheticSave({
      scenario: LIVE_SYNTHETIC_SCENARIOS['coverage-at-26'],
      structured: {},
      toolSafetyEscalated: false,
      toolPatientRequestedStop: false,
    })).toMatchObject({ accepted: false, reason: 'history_incomplete' })
  })

  it('requires the safety terminal flag and all emergency resources at logical exchange 26', () => {
    expect(assessLiveSyntheticSave({
      scenario: LIVE_SYNTHETIC_SCENARIOS['emergency-at-26'],
      structured: {},
      toolSafetyEscalated: true,
      toolPatientRequestedStop: false,
    })).toMatchObject({ accepted: true, reason: 'safety_escalated' })
    expect(assessLiveSyntheticSave({
      scenario: LIVE_SYNTHETIC_SCENARIOS['emergency-at-26'],
      structured: {},
      toolSafetyEscalated: false,
      toolPatientRequestedStop: false,
    })).toMatchObject({ accepted: false })
    expect(safetyResponseHasRequiredResources(
      'Get the right help immediately. Call 911 or 988. You can text HOME to 741741. Your safety is the most important thing.',
    )).toBe(true)
    expect(safetyResponseHasRequiredResources('Please call 911.')).toBe(false)
  })

  it('uses coverage completion at the soft wrap and a partial hard-stop save at 60', () => {
    expect(LIVE_SYNTHETIC_WRAP_SAVE_NUDGE).toContain('LIVE_STATE_INJECTED')
    expect(LIVE_SYNTHETIC_WRAP_SAVE_NUDGE).toContain('Do not ask or repeat any question')
    expect(source).toContain("scenario.purpose === 'wrap'")
    expect(source).toContain("status: 'interview_terminal'")
    expect(source).toContain('if (!guard.acceptsInterviewActivity())')
    expect(assessLiveSyntheticSave({
      scenario: LIVE_SYNTHETIC_SCENARIOS['wrap-at-45'],
      structured: completeHistory,
      toolSafetyEscalated: false,
      toolPatientRequestedStop: false,
    })).toMatchObject({ accepted: true, reason: 'coverage_complete' })
    expect(assessLiveSyntheticSave({
      scenario: LIVE_SYNTHETIC_SCENARIOS['hard-stop-at-60'],
      structured: {},
      toolSafetyEscalated: false,
      toolPatientRequestedStop: false,
    })).toMatchObject({ accepted: true, reason: 'hard_stop' })
  })

  it('continues through exchange 26 without a non-safety save locally', () => {
    const report = runComprehensiveScenario(COMPREHENSIVE_SCENARIOS['continue-past-25'])
    expect(report.finalExchange).toBe(26)
    expect(report.terminal).toBe(false)
    expect(report.actions.filter((action) => action.type === 'request_finalization')).toEqual([])
  })

  it('escalates and finalizes the fixed local emergency at exchange 26', () => {
    const report = runComprehensiveScenario(COMPREHENSIVE_SCENARIOS['emergency-at-26'])
    expect(report.terminal).toBe(true)
    expect(report.actions).toContainEqual({ type: 'safety_escalation', exchange: 26 })
    expect(report.actions).toContainEqual({
      type: 'request_finalization', exchange: 26, reason: 'safety_escalated',
    })
  })

  it('wraps once at 45 and hard-stops once at 60 locally', () => {
    const report = runComprehensiveScenario(COMPREHENSIVE_SCENARIOS['benign-wrap-to-60'])
    expect(report.actions).toContainEqual({ type: 'begin_wrap', exchange: 45 })
    expect(report.actions).toContainEqual({
      type: 'request_finalization', exchange: 60, reason: 'hard_stop',
    })
    expect(report.actions.filter((action) => action.type === 'begin_wrap')).toHaveLength(1)
  })

  it('keeps live execution explicit and provider/IAM failures NOT_RUN', () => {
    expect(source).toContain("process.argv.includes('--live')")
    expect(source).toContain("process.argv.includes('--live-suite')")
    expect(source).toContain('NOT_RUN continuation nova_live_provider_or_iam')
    expect(source).toContain('NOT_RUN ${scenario.id} nova_live_provider_or_iam')
    expect(source).toContain('[AWS_PRINCIPAL_REDACTED]')
    expect(source).toContain('[AWS_ACCOUNT_REDACTED]')
  })
})
