import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  COMPREHENSIVE_HARD_STOP_EXCHANGE,
  COMPREHENSIVE_SOFT_WRAP_EXCHANGE,
  comprehensiveTurnAction,
  evaluateComprehensiveSave,
} from '../../src/lib/historian/comprehensiveCompletionPolicy'
import { isUnavailableLiveProviderFailure } from '../../src/lib/historian/liveSmokeFailurePolicy'
import { hasExplicitPatientStopRequest } from '../../src/lib/historian/patientStop'
import {
  HistorianRuntimeGuard,
  applyHistorianTurnDecision,
  type HistorianTerminalReason,
} from '../../src/lib/historian/runtimeGuard'
import { hasDeterministicActiveSafetyTrigger } from '../../src/lib/historian/safetyTrigger'
import { COMPREHENSIVE_HISTORY_DOMAINS } from '../../src/lib/historianTypes'

const hookSource = readFileSync(
  join(__dirname, '..', '..', 'src/hooks/useRealtimeSession.ts'),
  'utf8',
)

const completeHistory = {
  history_coverage: {
    covered_domains: COMPREHENSIVE_HISTORY_DOMAINS.map((domain) => domain.id),
    missing_or_uncertain: [],
  },
}

describe('Comprehensive Historian production runtime policies', () => {
  it('continues past 25, wraps at 45, and hard-stops at 60', () => {
    expect(comprehensiveTurnAction(25)).toBe('continue')
    expect(comprehensiveTurnAction(26)).toBe('continue')
    expect(comprehensiveTurnAction(COMPREHENSIVE_SOFT_WRAP_EXCHANGE - 1)).toBe('continue')
    expect(comprehensiveTurnAction(COMPREHENSIVE_SOFT_WRAP_EXCHANGE)).toBe('begin_wrap')
    expect(comprehensiveTurnAction(COMPREHENSIVE_HARD_STOP_EXCHANGE - 1)).toBe('begin_wrap')
    expect(comprehensiveTurnAction(COMPREHENSIVE_HARD_STOP_EXCHANGE)).toBe('hard_stop')
    expect(comprehensiveTurnAction(COMPREHENSIVE_HARD_STOP_EXCHANGE + 1)).toBe('hard_stop')
  })

  it('rejects incomplete natural saves but permits complete, safety, and hard-stop saves', () => {
    const base = {
      interviewMode: 'comprehensive' as const,
      finalizing: false,
      safetyEscalated: false,
      toolSafetyEscalated: false,
      patientRequestedStop: false,
      toolPatientRequestedStop: false,
      exchange: 26,
      structured: {},
    }
    expect(evaluateComprehensiveSave(base)).toMatchObject({ allowed: false, reason: 'history_incomplete' })
    expect(evaluateComprehensiveSave({ ...base, structured: completeHistory })).toEqual({ allowed: true, reason: 'coverage_complete' })
    expect(evaluateComprehensiveSave({ ...base, safetyEscalated: true })).toEqual({ allowed: true, reason: 'safety_escalated' })
    expect(evaluateComprehensiveSave({ ...base, patientRequestedStop: true })).toEqual({ allowed: true, reason: 'patient_requested_stop' })
    expect(evaluateComprehensiveSave({ ...base, toolPatientRequestedStop: true })).toEqual({ allowed: true, reason: 'patient_requested_stop' })
    expect(evaluateComprehensiveSave({ ...base, exchange: COMPREHENSIVE_HARD_STOP_EXCHANGE })).toEqual({ allowed: true, reason: 'hard_stop' })
  })

  it('detects explicit active safety phrases but not sounds or historical symptoms', () => {
    expect(hasDeterministicActiveSafetyTrigger("I can't move my arm right now.")).toBe(true)
    expect(hasDeterministicActiveSafetyTrigger('I am having a seizure')).toBe(true)
    expect(hasDeterministicActiveSafetyTrigger('I coughed and cleared my throat.')).toBe(false)
    expect(hasDeterministicActiveSafetyTrigger('Last year I had the worst headache of my life.')).toBe(false)
    expect(hasDeterministicActiveSafetyTrigger('I have sudden new weakness.')).toBe(false)
  })

  it('recognizes narrow verbal stop requests without treating ordinary thanks as terminal', () => {
    expect(hasExplicitPatientStopRequest("I think that's all for today.")).toBe(true)
    expect(hasExplicitPatientStopRequest('Please stop the interview.')).toBe(true)
    expect(hasExplicitPatientStopRequest("That's all; please stop the interview.")).toBe(true)
    expect(hasExplicitPatientStopRequest('Thank you for explaining the question.')).toBe(false)
    expect(hasExplicitPatientStopRequest("That's all the medications I take.")).toBe(false)
    expect(hasExplicitPatientStopRequest("I think we're done with that section.")).toBe(false)
    expect(hasExplicitPatientStopRequest('Please stop asking about that medication.')).toBe(false)
    expect(hasExplicitPatientStopRequest('I want to stop taking the medication.')).toBe(false)
  })

  it('drives one soft wrap and one synchronous finalization through fake provider effects', () => {
    const guard = new HistorianRuntimeGuard()
    const injected: string[] = []
    const finalizations: HistorianTerminalReason[] = []
    let safetyActivations = 0
    const effects = {
      activateSafety: () => { safetyActivations += 1 },
      injectSystemText: (text: string) => { injected.push(text) },
      requestFinalization: (reason: HistorianTerminalReason) => { finalizations.push(reason) },
    }

    for (let exchange = 1; exchange <= 61; exchange += 1) {
      const decision = guard.patientTurn({
        interviewMode: 'comprehensive',
        exchange,
        text: `Synthetic benign response ${exchange}`,
      })
      applyHistorianTurnDecision(decision, effects)
    }

    expect(injected).toHaveLength(1)
    expect(finalizations).toEqual(['hard_stop'])
    expect(safetyActivations).toBe(0)
    expect(guard.terminalReason()).toBe('hard_stop')
    expect(guard.acceptsInterviewActivity()).toBe(false)
  })

  it('gives safety priority and finalizes an incomplete explicit patient stop', () => {
    const safetyGuard = new HistorianRuntimeGuard()
    const safetyEvents: string[] = []
    applyHistorianTurnDecision(
      safetyGuard.patientTurn({
        interviewMode: 'comprehensive',
        exchange: 26,
        text: "I can't move my arm right now",
      }),
      {
        activateSafety: () => { safetyEvents.push('safety') },
        injectSystemText: () => { safetyEvents.push('inject') },
        requestFinalization: (reason) => { safetyEvents.push(`finalize:${reason}`) },
      },
    )
    expect(safetyEvents).toEqual(['safety', 'finalize:safety_escalated'])

    const stopGuard = new HistorianRuntimeGuard()
    const stopDecision = stopGuard.patientTurn({
      interviewMode: 'comprehensive',
      exchange: 26,
      text: "That's all; please stop the interview.",
    })
    expect(stopDecision.requestFinalization).toBe('patient_requested_stop')
    expect(stopGuard.acceptsInterviewActivity()).toBe(false)
  })

  it('wires the shared policies into the live hook with safety priority and one-shot limits', () => {
    expect(hookSource).toContain('new HistorianRuntimeGuard()')
    expect(hookSource).toContain('applyHistorianTurnDecision(turnDecision')
    expect(hookSource).toContain('evaluateComprehensiveSave({')
    expect(hookSource).toContain('runtimeGuardRef.current.patientTurn({')
    expect(hookSource).toContain('runtimeGuardRef.current?.modelSafetyEscalation()')
    expect(hookSource).toContain('runtimeGuardRef.current?.modelPatientStop()')
    expect(hookSource).toContain('runtimeGuardRef.current?.acceptsInterviewActivity()')
    expect(hookSource).toContain('COMPREHENSIVE_HARD_STOP_SAVE_NUDGE')
    expect(hookSource).toContain("requestedReason === 'hard_stop'")
    expect(hookSource).toContain('providerRef.current?.suppressOutput()')
    expect(hookSource).toContain("runtimeGuardRef.current?.terminalReason() !== 'hard_stop'")
  })

  it('does not downgrade behavioral wait timeouts to provider NOT_RUN', () => {
    expect(isUnavailableLiveProviderFailure(new Error('Timed out waiting for assistant turn 2'))).toBe(false)
    expect(isUnavailableLiveProviderFailure(new Error('Nova content filter rejected the turn'))).toBe(false)
    expect(isUnavailableLiveProviderFailure(new Error('AccessDeniedException: not authorized'))).toBe(true)
    expect(isUnavailableLiveProviderFailure(new Error('connect ETIMEDOUT 10.0.0.1'))).toBe(true)
    expect(isUnavailableLiveProviderFailure(new Error('ResourceNotFoundException: wrong model identifier'))).toBe(false)
    expect(isUnavailableLiveProviderFailure(new Error('ModelNotReadyException: configuration unavailable'))).toBe(false)
  })
})
