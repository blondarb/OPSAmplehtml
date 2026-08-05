import { describe, it, expect } from 'vitest'
import {
  createUnresponsivenessMonitor,
  DEFAULT_UNRESPONSIVENESS_CONFIG,
  UNRESPONSIVE_CHECK_IN_NUDGE,
  UNRESPONSIVE_SIGN_OFF_NUDGE,
  type UnresponsivenessConfig,
} from '../unresponsiveness'

/**
 * Deterministic fake clock. The monitor takes setTimer/clearTimer so none of
 * these tests depend on real time — a real-timer test here would be slow and
 * flaky, and the whole point of the module is timing behaviour.
 */
function fakeClock() {
  let now = 0
  let seq = 0
  const pending = new Map<number, { at: number; fn: () => void }>()
  return {
    setTimer(fn: () => void, ms: number) {
      const id = ++seq
      pending.set(id, { at: now + ms, fn })
      return id as unknown as ReturnType<typeof setTimeout>
    },
    clearTimer(id: ReturnType<typeof setTimeout>) {
      pending.delete(id as unknown as number)
    },
    /** Advance time, firing every timer whose deadline has passed, in order. */
    advance(ms: number) {
      const target = now + ms
      for (;;) {
        const due = [...pending.entries()]
          .filter(([, t]) => t.at <= target)
          .sort((a, b) => a[1].at - b[1].at)[0]
        if (!due) break
        pending.delete(due[0])
        now = due[1].at
        due[1].fn()
      }
      now = target
    },
    get pendingCount() {
      return pending.size
    },
  }
}

const CFG: UnresponsivenessConfig = {
  enabled: true,
  checkInAfterMs: 25_000,
  giveUpAfterMs: 25_000,
}

function build(config: UnresponsivenessConfig = CFG) {
  const clock = fakeClock()
  const checkIns: number[] = []
  const giveUps: number[] = []
  const monitor = createUnresponsivenessMonitor({
    config,
    onCheckIn: () => checkIns.push(1),
    onGiveUp: () => giveUps.push(1),
    setTimer: clock.setTimer,
    clearTimer: clock.clearTimer,
  })
  return { clock, monitor, checkIns, giveUps }
}

describe('unresponsiveness monitor', () => {
  it('does nothing until the agent finishes a turn', () => {
    const { clock, checkIns, giveUps } = build()
    clock.advance(10 * 60_000)
    expect(checkIns).toHaveLength(0)
    expect(giveUps).toHaveLength(0)
  })

  it('checks in once after the configured silence, then gives up', () => {
    const { clock, monitor, checkIns, giveUps } = build()
    monitor.agentTurnEnded()
    expect(monitor.phase).toBe('waiting')

    clock.advance(24_999)
    expect(checkIns).toHaveLength(0)

    clock.advance(1)
    expect(checkIns).toHaveLength(1)
    expect(monitor.phase).toBe('checked_in')
    expect(giveUps).toHaveLength(0)

    clock.advance(24_999)
    expect(giveUps).toHaveLength(0)

    clock.advance(1)
    expect(giveUps).toHaveLength(1)
    expect(monitor.phase).toBe('idle')
  })

  it('patient activity before the check-in cancels the whole ladder', () => {
    const { clock, monitor, checkIns, giveUps } = build()
    monitor.agentTurnEnded()
    clock.advance(20_000)
    monitor.patientActivity()
    expect(monitor.phase).toBe('idle')

    clock.advance(10 * 60_000)
    expect(checkIns).toHaveLength(0)
    expect(giveUps).toHaveLength(0)
  })

  it('patient activity AFTER the check-in cancels the give-up', () => {
    const { clock, monitor, checkIns, giveUps } = build()
    monitor.agentTurnEnded()
    clock.advance(25_000)
    expect(checkIns).toHaveLength(1)

    monitor.patientActivity()
    clock.advance(10 * 60_000)
    expect(giveUps).toHaveLength(0)
  })

  it('the check-in utterance ending does not restart the ladder', () => {
    // The agent speaking its own check-in produces another aiSpeechStop. If
    // that re-armed stage 1 we would loop check-ins forever at a patient who
    // has genuinely gone, and never reach the graceful end.
    const { clock, monitor, checkIns, giveUps } = build()
    monitor.agentTurnEnded()
    clock.advance(25_000)
    expect(checkIns).toHaveLength(1)

    monitor.agentTurnEnded() // the check-in utterance finishing
    expect(monitor.phase).toBe('checked_in')

    clock.advance(25_000)
    expect(checkIns).toHaveLength(1) // still exactly one
    expect(giveUps).toHaveLength(1)
  })

  it('never fires more than one check-in per silence', () => {
    const { clock, monitor, checkIns } = build()
    monitor.agentTurnEnded()
    clock.advance(25_000)
    clock.advance(10 * 60_000)
    expect(checkIns).toHaveLength(1)
  })

  it('suspend() stops a pending ladder and blocks new arming', () => {
    const { clock, monitor, checkIns, giveUps } = build()
    monitor.agentTurnEnded()
    clock.advance(10_000)
    monitor.suspend()
    expect(monitor.phase).toBe('idle')

    monitor.agentTurnEnded() // e.g. the closing message finishing
    clock.advance(10 * 60_000)
    expect(checkIns).toHaveLength(0)
    expect(giveUps).toHaveLength(0)
  })

  it('suspend() landing while a timer is in flight prevents the callback', () => {
    // Guards the race where suspend() is called between the timer being
    // scheduled and it firing (e.g. a tool call completes the interview).
    const clock = fakeClock()
    const checkIns: number[] = []
    const monitor = createUnresponsivenessMonitor({
      config: CFG,
      onCheckIn: () => checkIns.push(1),
      onGiveUp: () => {},
      setTimer: (fn, ms) => {
        // Schedule, then suspend before time advances.
        const id = clock.setTimer(fn, ms)
        return id
      },
      clearTimer: clock.clearTimer,
    })
    monitor.agentTurnEnded()
    // Simulate a suspend that does not get to clear the timer (defensive path).
    ;(monitor as unknown as { suspend: () => void }).suspend()
    clock.advance(60_000)
    expect(checkIns).toHaveLength(0)
  })

  it('resume() after suspend() allows arming again', () => {
    const { clock, monitor, checkIns } = build()
    monitor.suspend()
    monitor.agentTurnEnded()
    clock.advance(60_000)
    expect(checkIns).toHaveLength(0)

    monitor.resume()
    monitor.agentTurnEnded()
    clock.advance(25_000)
    expect(checkIns).toHaveLength(1)
  })

  it('dispose() clears everything and is idempotent', () => {
    const { clock, monitor, checkIns, giveUps } = build()
    monitor.agentTurnEnded()
    monitor.dispose()
    monitor.dispose()
    expect(clock.pendingCount).toBe(0)

    monitor.agentTurnEnded()
    clock.advance(10 * 60_000)
    expect(checkIns).toHaveLength(0)
    expect(giveUps).toHaveLength(0)
  })

  it('is fully inert when disabled', () => {
    const { clock, monitor, checkIns, giveUps } = build({ ...CFG, enabled: false })
    monitor.agentTurnEnded()
    expect(monitor.phase).toBe('idle')
    clock.advance(10 * 60_000)
    expect(checkIns).toHaveLength(0)
    expect(giveUps).toHaveLength(0)
  })

  it('leaves no timer pending once the ladder completes', () => {
    const { clock, monitor } = build()
    monitor.agentTurnEnded()
    clock.advance(50_000)
    expect(clock.pendingCount).toBe(0)
  })
})

describe('unresponsiveness nudges', () => {
  // These prompts are spoken to patients on a live clinical surface. The
  // assertions below are the guardrails from PRs #176/#177: silence must never
  // be routed into the emergency protocol.
  it('both nudges explicitly forbid the safety protocol', () => {
    for (const nudge of [UNRESPONSIVE_CHECK_IN_NUDGE, UNRESPONSIVE_SIGN_OFF_NUDGE]) {
      expect(nudge).toMatch(/NOT trigger the safety protocol/i)
    }
  })

  it('neither nudge mentions emergency numbers', () => {
    for (const nudge of [UNRESPONSIVE_CHECK_IN_NUDGE, UNRESPONSIVE_SIGN_OFF_NUDGE]) {
      expect(nudge).not.toMatch(/911|988|741741/)
    }
  })

  it('the check-in asks exactly one short question and opens no new topic', () => {
    expect(UNRESPONSIVE_CHECK_IN_NUDGE).toMatch(/ONE short/)
    expect(UNRESPONSIVE_CHECK_IN_NUDGE).toMatch(/do not start\s+a new topic/i)
  })

  it('the sign-off asks no question and confirms the history was saved', () => {
    expect(UNRESPONSIVE_SIGN_OFF_NUDGE).toMatch(/Do not ask any question/i)
    expect(UNRESPONSIVE_SIGN_OFF_NUDGE).toMatch(/saved/i)
  })
})

describe('default config', () => {
  it('is enabled with sane, ordered thresholds', () => {
    expect(DEFAULT_UNRESPONSIVENESS_CONFIG.enabled).toBe(true)
    expect(DEFAULT_UNRESPONSIVENESS_CONFIG.checkInAfterMs).toBeGreaterThanOrEqual(15_000)
    expect(DEFAULT_UNRESPONSIVENESS_CONFIG.giveUpAfterMs).toBeGreaterThanOrEqual(15_000)
  })
})
