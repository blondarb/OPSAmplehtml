/**
 * Unit tests for the warn/count/throw logic in processTurn() and the
 * error-handling split in attemptNudgeToSave() — the two pieces of the
 * "silent false-PASS" defensive guard added in the 2026-07-21 review
 * round. These are pure decision-logic tests (no WS, no network): every
 * turn used here has an empty functionCalls array, so the tool-dispatch
 * fetch calls inside processTurn are never reached, and the injected
 * `client` fake is never actually invoked — it exists only to satisfy
 * RealtimeTurnClient's type.
 */
import { describe, it, expect, vi } from 'vitest'
import {
  processTurn,
  attemptNudgeToSave,
  newState,
  HistorianTurnFailureError,
  MAX_CONSECUTIVE_BAD_TURNS,
  type TurnContext,
  type RealtimeTurnClient,
} from '@/lib/historian/synthetic/turnProcessor'
import type { RealtimeTurnResult } from '@/lib/historian/synthetic/realtimeTextClient'

function makeClient(): RealtimeTurnClient {
  // Never actually called by any test below (every turn has zero
  // functionCalls) — a plain fake satisfies the narrow interface.
  return {
    submitFunctionCallOutput: vi.fn(),
    awaitNextResponse: vi.fn().mockRejectedValue(new Error('should not be called in these tests')),
  }
}

function makeCtx(overrides: Partial<TurnContext> = {}): TurnContext {
  return {
    baseUrl: 'http://localhost:3111',
    consultId: 'consult-1',
    personaId: 'acute-stroke',
    state: newState(),
    verbose: false,
    log: vi.fn(),
    ...overrides,
  }
}

function makeTurn(overrides: Partial<RealtimeTurnResult> = {}): RealtimeTurnResult {
  return {
    assistantText: '',
    functionCalls: [],
    status: 'completed',
    id: 'resp_1',
    ...overrides,
  }
}

describe('processTurn — silent-empty / bad-status guard', () => {
  it('a bad-status turn (status !== "completed") increments consecutiveBadTurns and logs an unconditional warning, without throwing', async () => {
    const ctx = makeCtx()
    const turn = makeTurn({ assistantText: 'partial text', status: 'incomplete', id: 'resp_bad_status' })

    await processTurn(makeClient(), turn, ctx)

    expect(ctx.state.consecutiveBadTurns).toBe(1)
    expect(ctx.log).toHaveBeenCalledWith(
      expect.stringContaining('WARNING: response resp_bad_status did not complete (status=incomplete)'),
    )
  })

  it('an empty turn (no text, no function calls) increments consecutiveBadTurns and logs an unconditional warning, without throwing', async () => {
    const ctx = makeCtx()
    const turn = makeTurn({ assistantText: '', functionCalls: [], status: 'completed', id: 'resp_empty' })

    await processTurn(makeClient(), turn, ctx)

    expect(ctx.state.consecutiveBadTurns).toBe(1)
    expect(ctx.log).toHaveBeenCalledWith(
      expect.stringContaining('WARNING: response resp_empty resolved with neither assistant text nor a function call'),
    )
  })

  it('warnings are logged even when verbose is false — there is no utterance text in these lines to gate', async () => {
    const ctx = makeCtx({ verbose: false })
    await processTurn(makeClient(), makeTurn({ status: 'failed' }), ctx)
    expect(ctx.log).toHaveBeenCalled()
  })

  it('a good turn (text present, status "completed") resets consecutiveBadTurns to 0', async () => {
    const ctx = makeCtx()
    ctx.state.consecutiveBadTurns = 1 // simulate one prior bad turn

    const goodTurn = makeTurn({ assistantText: 'Hi there, what brings you in today?', status: 'completed' })
    await processTurn(makeClient(), goodTurn, ctx)

    expect(ctx.state.consecutiveBadTurns).toBe(0)
  })

  it(`throws HistorianTurnFailureError once consecutiveBadTurns reaches MAX_CONSECUTIVE_BAD_TURNS (${MAX_CONSECUTIVE_BAD_TURNS})`, async () => {
    const ctx = makeCtx()
    const badTurn = makeTurn({ assistantText: '', functionCalls: [], status: 'completed', id: 'resp_empty_2' })

    // First bad turn: counted, no throw.
    await processTurn(makeClient(), badTurn, ctx)
    expect(ctx.state.consecutiveBadTurns).toBe(1)

    // Second consecutive bad turn: hits the threshold and throws.
    await expect(processTurn(makeClient(), badTurn, ctx)).rejects.toThrow(HistorianTurnFailureError)
    expect(ctx.state.consecutiveBadTurns).toBe(MAX_CONSECUTIVE_BAD_TURNS)
  })

  it('a good turn between two bad turns prevents the threshold from ever being reached', async () => {
    const ctx = makeCtx()
    await processTurn(makeClient(), makeTurn({ status: 'incomplete' }), ctx)
    expect(ctx.state.consecutiveBadTurns).toBe(1)

    await processTurn(makeClient(), makeTurn({ assistantText: 'a real reply', status: 'completed' }), ctx)
    expect(ctx.state.consecutiveBadTurns).toBe(0)

    // Should not throw — the reset means this is only the first bad turn again.
    await processTurn(makeClient(), makeTurn({ status: 'incomplete' }), ctx)
    expect(ctx.state.consecutiveBadTurns).toBe(1)
  })

  it('a turn with a function call but no text is NOT treated as empty (a pure tool-call turn is normal)', async () => {
    const ctx = makeCtx()
    const client = makeClient()
    ;(client.awaitNextResponse as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      makeTurn({ assistantText: 'follow-up text', status: 'completed', id: 'resp_followup' }),
    )
    const turnWithCall = makeTurn({
      assistantText: '',
      functionCalls: [{ callId: 'call_1', name: 'save_interview_output', arguments: { safety_escalated: false }, rawArguments: '{}' }],
      status: 'completed',
      id: 'resp_with_call',
    })

    await processTurn(client, turnWithCall, ctx)

    expect(ctx.state.consecutiveBadTurns).toBe(0)
    expect(ctx.log).not.toHaveBeenCalledWith(expect.stringContaining('neither assistant text nor a function call'))
  })
})

describe('attemptNudgeToSave — error-handling split', () => {
  it('re-throws HistorianTurnFailureError rather than swallowing it (the exact bug this function closes)', async () => {
    const log = vi.fn()
    const nudge = async () => {
      throw new HistorianTurnFailureError('2 consecutive empty/failed historian turns')
    }

    await expect(attemptNudgeToSave(nudge, log, 'acute-stroke')).rejects.toThrow(HistorianTurnFailureError)
    // Must NOT have logged the "non-fatal" fallback message for this case.
    expect(log).not.toHaveBeenCalled()
  })

  it('swallows a plain (network/transport) error and logs the non-fatal fallback message', async () => {
    const log = vi.fn()
    const nudge = async () => {
      throw new Error('WS timed out')
    }

    await expect(attemptNudgeToSave(nudge, log, 'acute-stroke')).resolves.toBeUndefined()
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining('[acute-stroke] nudge-to-save failed (non-fatal, falling back to raw transcript): WS timed out'),
    )
  })

  it('resolves cleanly with no log call when the nudge succeeds', async () => {
    const log = vi.fn()
    const nudge = vi.fn().mockResolvedValue(undefined)

    await attemptNudgeToSave(nudge, log, 'acute-stroke')

    expect(nudge).toHaveBeenCalledTimes(1)
    expect(log).not.toHaveBeenCalled()
  })
})
