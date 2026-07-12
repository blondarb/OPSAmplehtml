import { describe, expect, it, vi } from 'vitest'

import { OpenAiWebrtcProvider } from '@/lib/voice/providers/openaiWebrtcProvider'

describe('OpenAiWebrtcProvider referral boundary', () => {
  it('refuses referral clarification before opening a browser-controlled data channel', async () => {
    const peerConnection = vi.fn()
    vi.stubGlobal('RTCPeerConnection', peerConnection)
    const provider = new OpenAiWebrtcProvider()

    await expect(
      provider.start({
        ephemeralKey: 'credential-from-an-unrelated-session',
        sessionType: 'referral_clarification',
        instructions: 'Browser-replaced instructions',
        tools: [{ name: 'browser_replaced_tool' }],
      }),
    ).rejects.toThrow(
      'openaiWebrtcProvider: referral clarification requires the signed Nova relay',
    )
    expect(peerConnection).not.toHaveBeenCalled()
  })
})
