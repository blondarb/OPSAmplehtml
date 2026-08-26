import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  MicCapture,
  MicCaptureStartCancelledError,
  type MicRuntimeFailureReason,
} from '../capture-worklet'

class FakeTrack {
  readyState: MediaStreamTrackState = 'live'
  muted = false
  onended: (() => void) | null = null
  onmute: (() => void) | null = null
  onunmute: (() => void) | null = null
  stop = vi.fn(() => { this.readyState = 'ended' })
}

class FakeStream {
  constructor(readonly track: FakeTrack) {}
  getAudioTracks() { return [this.track] }
  getTracks() { return [this.track] }
}

class FakeAudioContext {
  static latest: FakeAudioContext | null = null
  state: AudioContextState = 'suspended'
  sampleRate = 48_000
  destination = {}
  onstatechange: (() => void) | null = null
  resumeSucceeds = true
  audioWorklet = { addModule: vi.fn(async () => undefined) }
  source = { connect: vi.fn(), disconnect: vi.fn() }
  gain = {
    gain: { value: 1 },
    connect: vi.fn(),
    disconnect: vi.fn(),
  }

  constructor() { FakeAudioContext.latest = this }

  resume = vi.fn(async () => {
    if (!this.resumeSucceeds) throw new Error('synthetic resume failure')
    this.state = 'running'
    this.onstatechange?.()
  })
  close = vi.fn(async () => { this.state = 'closed' })
  createMediaStreamSource = vi.fn(() => this.source)
  createGain = vi.fn(() => this.gain)
}

class FakeAudioWorkletNode {
  static latest: FakeAudioWorkletNode | null = null
  port: { onmessage: ((event: MessageEvent) => void) | null } = { onmessage: null }
  connect = vi.fn()
  disconnect = vi.fn()

  constructor() { FakeAudioWorkletNode.latest = this }
}

describe('MicCapture runtime health', () => {
  let track: FakeTrack

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-25T20:00:00Z'))
    track = new FakeTrack()
    FakeAudioContext.latest = null
    FakeAudioWorkletNode.latest = null
    vi.stubGlobal('navigator', {
      mediaDevices: {
        getUserMedia: vi.fn(async () => new FakeStream(track)),
      },
    })
    vi.stubGlobal('AudioContext', FakeAudioContext)
    vi.stubGlobal('AudioWorkletNode', FakeAudioWorkletNode)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  async function startedCapture() {
    const capture = new MicCapture()
    const failures: MicRuntimeFailureReason[] = []
    await capture.start(() => undefined, (reason) => failures.push(reason))
    return { capture, failures }
  }

  it('fails immediately when the live microphone track ends', async () => {
    const { failures } = await startedCapture()
    track.readyState = 'ended'
    track.onended?.()
    expect(failures).toEqual(['track_ended'])
  })

  it('allows a brief track mute to recover without ending the interview', async () => {
    const { capture, failures } = await startedCapture()
    track.muted = true
    track.onmute?.()
    await vi.advanceTimersByTimeAsync(4_000)
    track.muted = false
    track.onunmute?.()
    await vi.advanceTimersByTimeAsync(1_000)
    expect(failures).toEqual([])
    await capture.stop()
  })

  it('fails when the microphone track remains muted beyond the grace window', async () => {
    const { failures } = await startedCapture()
    track.muted = true
    track.onmute?.()
    await vi.advanceTimersByTimeAsync(5_000)
    expect(failures).toEqual(['track_muted'])
  })

  it('attempts context recovery and fails if the context remains suspended', async () => {
    const { failures } = await startedCapture()
    const ctx = FakeAudioContext.latest!
    ctx.resumeSucceeds = false
    ctx.state = 'suspended'
    ctx.onstatechange?.()
    await vi.advanceTimersByTimeAsync(5_000)
    expect(failures).toEqual(['context_not_running'])
  })

  it('fails when the worklet stops producing chunks despite a live track', async () => {
    const { failures } = await startedCapture()
    await vi.advanceTimersByTimeAsync(7_000)
    expect(failures).toEqual(['audio_chunks_stalled'])
  })

  it('keeps running when chunks resume during the bounded recovery window', async () => {
    const { capture, failures } = await startedCapture()
    await vi.advanceTimersByTimeAsync(5_500)
    FakeAudioWorkletNode.latest?.port.onmessage?.({
      data: new Float32Array(128),
    } as MessageEvent)
    await vi.advanceTimersByTimeAsync(3_000)
    expect(failures).toEqual([])
    await capture.stop()
  })

  it('stops a late permission stream when capture was cancelled before approval', async () => {
    let resolveStream!: (stream: FakeStream) => void
    vi.stubGlobal('navigator', {
      mediaDevices: {
        getUserMedia: vi.fn(() => new Promise<FakeStream>((resolve) => {
          resolveStream = resolve
        })),
      },
    })
    const capture = new MicCapture()
    const chunks: string[] = []
    const failures: MicRuntimeFailureReason[] = []
    const starting = capture.start(
      (chunk) => chunks.push(chunk),
      (reason) => failures.push(reason),
    )

    await Promise.resolve()
    await capture.stop()
    resolveStream(new FakeStream(track))

    await expect(starting).rejects.toBeInstanceOf(MicCaptureStartCancelledError)
    expect(track.stop).toHaveBeenCalledOnce()
    expect(FakeAudioContext.latest).toBeNull()
    expect(chunks).toEqual([])
    expect(failures).toEqual([])
  })
})
