import { describe, expect, it } from 'vitest'

import { createStallDetector, pollProgressKey } from '@/lib/triage/pollClient'

/**
 * A dead run must FAIL, not spin.
 *
 * 2026-08-07, on demo day: an extraction sat at `pending` with an empty
 * error_message while the UI showed a spinner. Normal extractions complete in
 * 22-24s, but the extraction poll allows maxAttempts 900 at 1s — so the client
 * would have spun for FIFTEEN MINUTES. Steve saw "Building the clinical
 * summary..." at 1:54 with no way to tell dead from slow.
 *
 * maxAttempts cannot simply be lowered: a long-packet run can legitimately take
 * ~13 minutes. Hence a CHANGE-based guard rather than an elapsed-time one.
 */

const T = 120_000 // the production stall window

describe('pollProgressKey', () => {
  it('is stable for an unchanged pending shape', () => {
    expect(pollProgressKey('pending', null)).toBe(pollProgressKey('pending', null))
  })

  it('changes when long-packet progress advances', () => {
    const a = pollProgressKey('pending', { run_status: 'running', completed_chunks: 3 })
    const b = pollProgressKey('pending', { run_status: 'running', completed_chunks: 4 })
    expect(a).not.toBe(b)
  })

  it('changes when status changes', () => {
    expect(pollProgressKey('pending', null)).not.toBe(pollProgressKey('complete', null))
  })
})

describe('createStallDetector', () => {
  it('fails a run whose shape never changes, once past the window', () => {
    const s = createStallDetector(T, 0)
    const dead = pollProgressKey('pending', null)

    expect(s.isStalled(dead, 0)).toBe(false)
    expect(s.isStalled(dead, 60_000)).toBe(false) // still inside the window
    expect(s.isStalled(dead, 119_000)).toBe(false) // just inside
    expect(s.isStalled(dead, 121_000)).toBe(true) // past it -> dead
  })

  it('NEVER fails a long-packet run that keeps advancing', () => {
    // The assertion that stops this guard from killing a legitimate ~13-minute
    // run. Progress advances every 30s, far slower than the poll interval, and
    // the detector must still never fire across 20 minutes.
    const s = createStallDetector(T, 0)
    let stalled = false
    for (let t = 0, chunk = 0; t <= 1_200_000; t += 30_000, chunk += 1) {
      const key = pollProgressKey('pending', { run_status: 'running', completed_chunks: chunk })
      if (s.isStalled(key, t)) stalled = true
    }
    expect(stalled, 'an advancing long-packet run must never be killed').toBe(false)
  })

  it('fails a long-packet run that advances and then freezes', () => {
    // The nastiest real case: it starts working, then dies mid-flight. The
    // timer must reset on real progress and then fire once progress stops.
    const s = createStallDetector(T, 0)
    for (let t = 0, chunk = 0; t < 300_000; t += 30_000, chunk += 1) {
      expect(
        s.isStalled(pollProgressKey('pending', { run_status: 'running', completed_chunks: chunk }), t),
      ).toBe(false)
    }
    const frozen = pollProgressKey('pending', { run_status: 'running', completed_chunks: 9 })
    expect(s.isStalled(frozen, 300_000)).toBe(false) // first sight of the frozen shape
    expect(s.isStalled(frozen, 360_000)).toBe(false) // 60s frozen — still allowed
    expect(s.isStalled(frozen, 430_000)).toBe(true) // >120s frozen — dead
  })

  it('a healthy single-pass extraction never trips it', () => {
    // Observed normal: 22-24s. The window is 120s and the server's own
    // single-pass deadline is 90s, so a healthy run cannot reach it.
    const s = createStallDetector(T, 0)
    const pending = pollProgressKey('pending', null)
    for (let t = 0; t <= 24_000; t += 1_000) {
      expect(s.isStalled(pending, t)).toBe(false)
    }
    expect(s.isStalled(pollProgressKey('complete', null), 24_000)).toBe(false)
  })
})
