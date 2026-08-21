import { describe, expect, it, vi } from 'vitest'

import { NovaSonicWsProvider } from '../../src/lib/voice/providers/novaSonicWsProvider'

type TestPlayer = {
  enqueue: (pcm: string) => void
  interrupt: () => void
}

type TestableNovaProvider = {
  player: TestPlayer
  handleServerMsg: (message: { t: 'audio'; pcm: string }) => void
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

    testable.handleServerMsg({ t: 'audio', pcm: 'before-terminal' })
    expect(player.enqueue).toHaveBeenCalledOnce()

    provider.suppressOutput()
    provider.suppressOutput()
    testable.handleServerMsg({ t: 'audio', pcm: 'after-terminal' })

    expect(player.interrupt).toHaveBeenCalledOnce()
    expect(player.enqueue).toHaveBeenCalledTimes(1)
  })
})
