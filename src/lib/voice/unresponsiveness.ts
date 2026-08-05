/**
 * Unresponsiveness handling for the live voice surfaces (AI Historian and the
 * Follow-Up voice agent).
 *
 * WHY THIS EXISTS
 * ---------------
 * PRs #176/#177 scoped every voice safety trigger to the patient's SPOKEN
 * WORDS, so a cough can no longer fire the 911/988 protocol. That fix left a
 * gap on the other side: a patient who goes quiet — stepped away, dropped
 * their phone, lost the connection, or genuinely cannot speak — produced no
 * behaviour at all. The session simply waited forever.
 *
 * WHAT THIS DOES, AND DELIBERATELY DOES NOT DO
 * --------------------------------------------
 * Silence is NOT treated as a medical emergency and NEVER triggers the safety
 * protocol. That is the whole point: silence is overwhelmingly benign (a
 * pause, a doorbell, a dead battery), and auto-escalating on it would rebuild
 * the exact false-positive class #176 removed, with a worse blast radius —
 * telling a patient to call 911 because their phone died.
 *
 * Instead this is a two-stage, conversation-level ladder:
 *   1. after `checkInAfterMs` of silence following the agent's turn, the agent
 *      gently checks in once ("Are you still with me?");
 *   2. after a further `giveUpAfterMs`, the session ends through the SAME
 *      graceful path as a manual end — the partial history is flushed and
 *      saved, and the session is marked `unresponsive` so a human can follow
 *      up.
 *
 * Escalating an unresponsive patient to a clinician (rather than just marking
 * the session) is a clinical decision that has NOT been made here — see the
 * PR discussion. This module deliberately stops at "end cleanly and label it".
 *
 * PROVIDER INDEPENDENCE
 * ---------------------
 * The arming signal is `aiSpeechStop` and the reset signal is `userTranscript`.
 * Both are emitted by BOTH the OpenAI and Nova providers. `userSpeechStart` is
 * deliberately NOT required: it is OpenAI-only (see the note on VoiceEvent in
 * providerTypes.ts), so building on it would make this silently no-op under
 * Nova — a failure that no test and no green build would catch. Hooks may pass
 * `userSpeechStart` in as an ADDITIONAL reset for snappier behaviour on
 * OpenAI, but correctness never depends on it.
 */

export type UnresponsivenessPhase = 'idle' | 'waiting' | 'checked_in'

export interface UnresponsivenessConfig {
  /** Master switch. When false the monitor is inert — every method no-ops. */
  enabled: boolean
  /** Silence after the agent's turn before the single gentle check-in. */
  checkInAfterMs: number
  /** Further silence after the check-in before ending the session. */
  giveUpAfterMs: number
}

/**
 * Conservative defaults. These are starting points chosen to be clearly longer
 * than a normal thinking pause and clearly shorter than an abandoned call —
 * they are NOT clinically validated. Tuning them is a clinical call.
 */
export const DEFAULT_UNRESPONSIVENESS_CONFIG: UnresponsivenessConfig = {
  enabled: true,
  checkInAfterMs: 25_000,
  giveUpAfterMs: 25_000,
}

/**
 * Nudge the agent speaks at stage 1. Phrased so the model checks in WITHOUT
 * re-asking its previous question, opening a new topic, or implying anything
 * medical is wrong. The explicit "not a medical emergency" clause matters:
 * without it a speech-to-speech model can read its own check-in prompt as
 * evidence that something is wrong and drift toward the safety script.
 */
export const UNRESPONSIVE_CHECK_IN_NUDGE =
  '[The patient has not said anything for a little while. Gently check whether ' +
  'they are still there — ONE short, warm sentence, for example "Are you still ' +
  'with me?". Do not repeat your previous question word for word, do not start ' +
  'a new topic, and do not ask anything clinical. This silence is NOT a medical ' +
  'emergency and must NOT trigger the safety protocol.]'

/**
 * Nudge the agent speaks at stage 2, immediately before the graceful end.
 * Reassuring and non-alarming: the patient may be listening but unable to
 * answer, and may also simply have walked away.
 */
export const UNRESPONSIVE_SIGN_OFF_NUDGE =
  '[The patient still has not responded. Speak ONE short, warm sign-off — say ' +
  'that you will stop here, that everything shared so far has been saved, and ' +
  'that their care team will follow up. Do not ask any question. Do not imply ' +
  'anything is medically wrong and do NOT trigger the safety protocol.]'

export interface UnresponsivenessMonitorOptions {
  config: UnresponsivenessConfig
  /** Stage 1 — make the agent check in once. Must not end the session. */
  onCheckIn: () => void
  /** Stage 2 — end the session gracefully, labelled unresponsive. */
  onGiveUp: () => void
  /** Injectable for tests. */
  setTimer?: (fn: () => void, ms: number) => ReturnType<typeof setTimeout>
  clearTimer?: (id: ReturnType<typeof setTimeout>) => void
}

export interface UnresponsivenessMonitor {
  /**
   * The agent finished speaking — the turn is now the patient's, so start
   * counting. No-op while suspended or disabled.
   */
  agentTurnEnded(): void
  /** Any sign of life from the patient. Cancels everything and resets. */
  patientActivity(): void
  /**
   * Stop counting without disposing — used once the interview is complete, the
   * session is finalizing, or a safety escalation is in flight. None of those
   * states should ever be interrupted by a check-in.
   */
  suspend(): void
  /** Resume after a suspend(). Does not itself start a countdown. */
  resume(): void
  /** Clear all timers permanently. Safe to call repeatedly. */
  dispose(): void
  readonly phase: UnresponsivenessPhase
  readonly suspended: boolean
}

export function createUnresponsivenessMonitor(
  opts: UnresponsivenessMonitorOptions,
): UnresponsivenessMonitor {
  const setTimer = opts.setTimer ?? ((fn, ms) => setTimeout(fn, ms))
  const clearTimer = opts.clearTimer ?? ((id) => clearTimeout(id))

  let timer: ReturnType<typeof setTimeout> | null = null
  let phase: UnresponsivenessPhase = 'idle'
  let suspended = false
  let disposed = false

  function clear() {
    if (timer !== null) {
      clearTimer(timer)
      timer = null
    }
  }

  function reset() {
    clear()
    phase = 'idle'
  }

  function armCheckIn() {
    clear()
    phase = 'waiting'
    timer = setTimer(() => {
      timer = null
      // Re-check: suspend()/dispose() may have landed while the timer ran.
      if (disposed || suspended) {
        phase = 'idle'
        return
      }
      phase = 'checked_in'
      opts.onCheckIn()
      armGiveUp()
    }, opts.config.checkInAfterMs)
  }

  function armGiveUp() {
    clear()
    timer = setTimer(() => {
      timer = null
      if (disposed || suspended) {
        phase = 'idle'
        return
      }
      phase = 'idle'
      opts.onGiveUp()
    }, opts.config.giveUpAfterMs)
  }

  return {
    agentTurnEnded() {
      if (disposed || suspended || !opts.config.enabled) return
      // A second agent turn while already checked-in (the check-in utterance
      // itself ending) must not restart the ladder from stage 1 — that would
      // loop check-ins forever against a patient who is genuinely gone.
      if (phase === 'checked_in') return
      armCheckIn()
    },
    patientActivity() {
      if (disposed || !opts.config.enabled) return
      reset()
    },
    suspend() {
      if (disposed) return
      suspended = true
      reset()
    },
    resume() {
      if (disposed) return
      suspended = false
    },
    dispose() {
      disposed = true
      clear()
      phase = 'idle'
    },
    get phase() {
      return phase
    },
    get suspended() {
      return suspended
    },
  }
}
