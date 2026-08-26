/**
 * Deterministic, PHI-free contract for the Comprehensive Historian's turn
 * limits. It calls the same pure turn and safety policies used by the live
 * hook; it is not an ASR or model simulation.
 */

import {
  COMPREHENSIVE_HARD_STOP_EXCHANGE,
} from './comprehensiveCompletionPolicy'
import { HistorianRuntimeGuard } from './runtimeGuard'

export type SyntheticUtterance = {
  exchange: number
  text: string
  audioFixture: string
  metadata: { synthetic: true; containsPhi: false; purpose: string }
}

export type ComprehensiveScenario = {
  id: 'continue-past-25' | 'emergency-at-26' | 'benign-wrap-to-60'
  utterances: SyntheticUtterance[]
}

export type ScenarioAction =
  | { type: 'continue'; exchange: number }
  | { type: 'begin_wrap'; exchange: number }
  | { type: 'safety_escalation'; exchange: number }
  | { type: 'request_finalization'; exchange: number; reason: 'safety_escalated' | 'patient_requested_stop' | 'hard_stop' }

export type ScenarioReport = {
  id: ComprehensiveScenario['id']
  actions: ScenarioAction[]
  finalExchange: number
  terminal: boolean
}

const FIXTURE = 'synthetic 16 kHz mono PCM fixture description only; no recording or patient audio'

function utterance(exchange: number, text: string, purpose: string): SyntheticUtterance {
  return {
    exchange,
    text,
    audioFixture: FIXTURE,
    metadata: { synthetic: true, containsPhi: false, purpose },
  }
}

export const COMPREHENSIVE_SCENARIOS: Record<ComprehensiveScenario['id'], ComprehensiveScenario> = {
  'continue-past-25': {
    id: 'continue-past-25',
    utterances: Array.from({ length: 26 }, (_, index) =>
      utterance(index + 1, `Synthetic benign history response ${index + 1}.`, 'continuation limit contract'),
    ),
  },
  'emergency-at-26': {
    id: 'emergency-at-26',
    utterances: Array.from({ length: 26 }, (_, index) => {
      const exchange = index + 1
      return exchange === 26
        ? utterance(exchange, "Synthetic emergency utterance: I can't move my arm right now.", 'safety escalation contract')
        : utterance(exchange, `Synthetic benign history response ${exchange}.`, 'safety escalation lead-in')
    }),
  },
  'benign-wrap-to-60': {
    id: 'benign-wrap-to-60',
    utterances: Array.from({ length: COMPREHENSIVE_HARD_STOP_EXCHANGE }, (_, index) =>
      utterance(index + 1, `Synthetic benign history response ${index + 1}.`, 'soft-wrap and hard-stop contract'),
    ),
  },
}

function assertScenarioUtterance(current: SyntheticUtterance, expectedExchange: number): void {
  if (current.exchange !== expectedExchange) {
    throw new Error(`Scenario exchange order is invalid: expected ${expectedExchange}, received ${current.exchange}`)
  }
  if (!current.metadata.synthetic || current.metadata.containsPhi || !current.audioFixture.includes('fixture')) {
    throw new Error(`Scenario exchange ${current.exchange} is not a PHI-free synthetic fixture`)
  }
}

/** Runs locally and never calls a model, ASR service, database, or network. */
export function runComprehensiveScenario(scenario: ComprehensiveScenario): ScenarioReport {
  const actions: ScenarioAction[] = []
  let expectedExchange = 1
  let terminal = false
  const guard = new HistorianRuntimeGuard()

  for (const current of scenario.utterances) {
    assertScenarioUtterance(current, expectedExchange)
    expectedExchange += 1
    const decision = guard.patientTurn({
      interviewMode: 'comprehensive',
      exchange: current.exchange,
      text: current.text,
    })
    if (decision.activateSafety) {
      actions.push({ type: 'safety_escalation', exchange: current.exchange })
    }
    if (decision.injectText) {
      actions.push({ type: 'begin_wrap', exchange: current.exchange })
    }
    if (decision.requestFinalization) {
      actions.push({ type: 'request_finalization', exchange: current.exchange, reason: decision.requestFinalization })
      terminal = true
      break
    }
    if (!decision.injectText) actions.push({ type: 'continue', exchange: current.exchange })
  }

  if (!terminal && scenario.id !== 'continue-past-25') throw new Error(`Scenario ${scenario.id} ended without its required terminal action`)
  const prematureFinalization = actions.find(
    (action) => action.type === 'request_finalization' && action.reason === 'hard_stop' && action.exchange < COMPREHENSIVE_HARD_STOP_EXCHANGE,
  )
  if (prematureFinalization) throw new Error(`Premature hard-stop finalization at exchange ${prematureFinalization.exchange}`)
  return { id: scenario.id, actions, finalExchange: expectedExchange - 1, terminal }
}

export function runAllComprehensiveScenarios(): ScenarioReport[] {
  return Object.values(COMPREHENSIVE_SCENARIOS).map(runComprehensiveScenario)
}
