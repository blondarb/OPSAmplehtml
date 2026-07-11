import { describe, it, expect } from 'vitest'
import { pumpQueue, type QueueState } from '../pcmStreamWorklet'

describe('pumpQueue', () => {
  it('drains a single chunk across multiple blocks with no loss or reorder', () => {
    const st: QueueState = { chunks: [Float32Array.from([1, 2, 3, 4, 5])], readPos: 0 }
    const b1 = new Float32Array(2)
    const b2 = new Float32Array(2)
    const b3 = new Float32Array(2)
    expect(pumpQueue(st, b1)).toBe(2)
    expect(Array.from(b1)).toEqual([1, 2])
    expect(pumpQueue(st, b2)).toBe(2)
    expect(Array.from(b2)).toEqual([3, 4])
    expect(pumpQueue(st, b3)).toBe(1) // 1 real sample, rest silence
    expect(Array.from(b3)).toEqual([5, 0])
    expect(st.chunks.length).toBe(0)
  })

  it('joins across chunk boundaries seamlessly (no gap between chunks)', () => {
    const st: QueueState = { chunks: [Float32Array.from([1, 2]), Float32Array.from([3, 4])], readPos: 0 }
    const out = new Float32Array(4)
    expect(pumpQueue(st, out)).toBe(4)
    expect(Array.from(out)).toEqual([1, 2, 3, 4]) // contiguous — this is the anti-click property
  })

  it('underrun fills silence, never garbage, and leaves queue empty', () => {
    const st: QueueState = { chunks: [Float32Array.from([9])], readPos: 0 }
    const out = new Float32Array(4)
    expect(pumpQueue(st, out)).toBe(1)
    expect(Array.from(out)).toEqual([9, 0, 0, 0])
  })

  it('empty queue outputs pure silence', () => {
    const st: QueueState = { chunks: [], readPos: 0 }
    const out = new Float32Array(3)
    expect(pumpQueue(st, out)).toBe(0)
    expect(Array.from(out)).toEqual([0, 0, 0])
  })
})
