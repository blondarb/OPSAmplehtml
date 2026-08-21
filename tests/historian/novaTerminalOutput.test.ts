import { describe, expect, it, vi } from 'vitest'

import { NovaSonicWsProvider } from '../../src/lib/voice/providers/novaSonicWsProvider'

type TestPlayer = {
  enqueue: (pcm: string) => void
  interrupt: () => void
}

type TestableNovaProvider = {
  player: TestPlayer
  modelStreamOpen: boolean
  handleServerMsg: (message:
    | { t: 'audio'; pcm: string }
    | { t: 'error'; message: string }
    | { t: 'sessionEnded'; reason: 'nova_stream_error' | 'nova_stream_ended' }
  ) => void
}

describe('Nova terminal output suppression', () => {
  it('interrupts queued playback and discards every later PCM frame', () => {
    const provider = new NovaSonicWsProvider()
    const player = {
      enqueue: vi.fn(),
      interrupt: vi.fn(),
    }
    const testable = provider as unknown as TestableNovaProvider
    testable.player = player
    testable.modelStreamOpen = true

    testable.handleServerMsg({ t: 'audio', pcm: 'before-terminal' })
    expect(player.enqueue).toHaveBeenCalledOnce()

    provider.suppressOutput()
    provider.suppressOutput()
    testable.handleServerMsg({ t: 'audio', pcm: 'after-terminal' })

    expect(player.interrupt).toHaveBeenCalledOnce()
    expect(player.enqueue).toHaveBeenCalledTimes(1)
  })

  it('turns a relay stream-end frame into one fail-closed disconnect', () => {
    const provider = new NovaSonicWsProvider()
    const player = { enqueue: vi.fn(), interrupt: vi.fn() }
    const events: unknown[] = []
    provider.on((event) => events.push(event))
    const testable = provider as unknown as TestableNovaProvider
    testable.player = player
    testable.modelStreamOpen = true

    testable.handleServerMsg({ t: 'sessionEnded', reason: 'nova_stream_ended' })
    testable.handleServerMsg({ t: 'sessionEnded', reason: 'nova_stream_ended' })
    testable.handleServerMsg({ t: 'audio', pcm: 'after-stream-end' })

    expect(testable.modelStreamOpen).toBe(false)
    expect(player.interrupt).toHaveBeenCalledOnce()
    expect(player.enqueue).not.toHaveBeenCalled()
    expect(events).toEqual([{ type: 'disconnected', reason: 'nova_stream_ended' }])
  })

  it('marks the model stream unavailable before surfacing a terminal relay error', () => {
    const provider = new NovaSonicWsProvider()
    const player = { enqueue: vi.fn(), interrupt: vi.fn() }
    const events: unknown[] = []
    provider.on((event) => events.push(event))
    const testable = provider as unknown as TestableNovaProvider
    testable.player = player
    testable.modelStreamOpen = true

    testable.handleServerMsg({ t: 'error', message: 'model timeout' })

    expect(testable.modelStreamOpen).toBe(false)
    expect(player.interrupt).toHaveBeenCalledOnce()
    expect(events).toEqual([{ type: 'error', message: 'model timeout' }])
  })
})
