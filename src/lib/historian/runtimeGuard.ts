import {
  COMPREHENSIVE_SOFT_WRAP_NUDGE,
  comprehensiveTurnAction,
} from './comprehensiveCompletionPolicy'
import { hasExplicitPatientStopRequest } from './patientStop'
import { hasDeterministicActiveSafetyTrigger } from './safetyTrigger'

export type HistorianTerminalReason = 'safety_escalated' | 'patient_requested_stop' | 'hard_stop'

export type HistorianTurnDecision = {
  activateSafety: boolean
  injectText: string | null
  requestFinalization: HistorianTerminalReason | null
  terminalReason: HistorianTerminalReason | null
}

export type HistorianRuntimeEffects = {
  activateSafety: () => void
  injectSystemText: (text: string) => void
  requestFinalization: (reason: HistorianTerminalReason) => void
}

/**
 * Minimal, non-transcript snapshot for an application-owned transport
 * continuation. The guard itself remains the source of truth; this exposes
 * only the latches a continuation checkpoint must bind and never logs text.
 */
export type HistorianRuntimeGuardSnapshot = {
  softWrapIssued: boolean
  terminalReason: HistorianTerminalReason | null
}

/**
 * Stateful one-session guard shared by the live hook and executable fake-
 * provider tests. Terminal state is latched synchronously before effects run.
 */
export class HistorianRuntimeGuard {
  private softWrapIssued = false
  private terminal: HistorianTerminalReason | null = null

  reset(): void {
    this.softWrapIssued = false
    this.terminal = null
  }

  terminalReason(): HistorianTerminalReason | null {
    return this.terminal
  }

  snapshot(): HistorianRuntimeGuardSnapshot {
    return {
      softWrapIssued: this.softWrapIssued,
      terminalReason: this.terminal,
    }
  }

  acceptsInterviewActivity(): boolean {
    return this.terminal === null
  }

  patientTurn(params: {
    interviewMode: 'standard' | 'comprehensive'
    exchange: number
    text: string
  }): HistorianTurnDecision {
    if (this.terminal) return this.decision(false, null, null)

    if (hasDeterministicActiveSafetyTrigger(params.text)) {
      this.terminal = 'safety_escalated'
      return this.decision(true, null, 'safety_escalated')
    }
    if (hasExplicitPatientStopRequest(params.text)) {
      this.terminal = 'patient_requested_stop'
      return this.decision(false, null, 'patient_requested_stop')
    }
    if (params.interviewMode !== 'comprehensive') return this.decision(false, null, null)

    const action = comprehensiveTurnAction(params.exchange)
    if (action === 'hard_stop') {
      this.terminal = 'hard_stop'
      return this.decision(false, null, 'hard_stop')
    }
    if (action === 'begin_wrap' && !this.softWrapIssued) {
      this.softWrapIssued = true
      return this.decision(false, COMPREHENSIVE_SOFT_WRAP_NUDGE, null)
    }
    return this.decision(false, null, null)
  }

  modelSafetyEscalation(): boolean {
    const changed = this.terminal !== 'safety_escalated'
    this.terminal = 'safety_escalated'
    return changed
  }

  modelPatientStop(): boolean {
    if (this.terminal === 'safety_escalated') return false
    const changed = this.terminal !== 'patient_requested_stop'
    this.terminal = 'patient_requested_stop'
    return changed
  }

  private decision(
    activateSafety: boolean,
    injectText: string | null,
    requestFinalization: HistorianTerminalReason | null,
  ): HistorianTurnDecision {
    return { activateSafety, injectText, requestFinalization, terminalReason: this.terminal }
  }
}

/** Effects execute in safety -> instruction -> finalization order. */
export function applyHistorianTurnDecision(
  decision: HistorianTurnDecision,
  effects: HistorianRuntimeEffects,
): void {
  if (decision.activateSafety) effects.activateSafety()
  if (decision.injectText) effects.injectSystemText(decision.injectText)
  if (decision.requestFinalization) effects.requestFinalization(decision.requestFinalization)
}
