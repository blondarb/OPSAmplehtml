import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the AWS SDK client entirely — these tests must never touch the
// network. `sendMock` is shared across tests via closure so each test can
// configure client.send()'s behavior (success/failure) independently.
const sendMock = vi.fn()

vi.mock('@aws-sdk/client-transcribe-streaming', () => {
  class TranscribeStreamingClient {
    send = sendMock
  }
  class StartMedicalStreamTranscriptionCommand {
    input: unknown
    constructor(input: unknown) {
      this.input = input
    }
  }
  return { TranscribeStreamingClient, StartMedicalStreamTranscriptionCommand }
})

const { TranscribeMedicalSession } = await import('../transcribeMedicalSession.js')

describe('TranscribeMedicalSession (no real AWS)', () => {
  beforeEach(() => {
    sendMock.mockReset()
  })

  it('pushAudio before start() is a safe no-op', () => {
    const onTranscript = vi.fn()
    const session = new TranscribeMedicalSession({ onTranscript })

    expect(() => session.pushAudio(Buffer.from('hello').toString('base64'))).not.toThrow()
    expect(onTranscript).not.toHaveBeenCalled()
    // client.send() was never reached — pushAudio before start() must not
    // itself open (or attempt to open) the stream.
    expect(sendMock).not.toHaveBeenCalled()
  })

  it('stop() before start() is safe and resolves', async () => {
    const onTranscript = vi.fn()
    const session = new TranscribeMedicalSession({ onTranscript })

    await expect(session.stop()).resolves.toBeUndefined()
  })

  it('a client.send() failure calls onError exactly once and leaves the session permanently inert', async () => {
    const onTranscript = vi.fn()
    const onError = vi.fn()
    sendMock.mockRejectedValue(new Error('boom: bad IAM / region / quota'))

    const session = new TranscribeMedicalSession({ onTranscript, onError })

    // start() must never reject — the caller's Nova Sonic session start must
    // never be jeopardized by this optional accuracy aid.
    await expect(session.start()).resolves.toBeUndefined()

    expect(onError).toHaveBeenCalledTimes(1)

    // Subsequent pushAudio calls must be safe no-ops — never throw, never
    // reach onTranscript.
    expect(() => session.pushAudio(Buffer.from('a').toString('base64'))).not.toThrow()
    expect(() => session.pushAudio(Buffer.from('b').toString('base64'))).not.toThrow()
    expect(onTranscript).not.toHaveBeenCalled()

    // A second start() attempt stays inert too — onError must not fire again.
    await expect(session.start()).resolves.toBeUndefined()
    expect(onError).toHaveBeenCalledTimes(1)
    expect(sendMock).toHaveBeenCalledTimes(1)

    // stop() after a failed start() is also safe.
    await expect(session.stop()).resolves.toBeUndefined()
  })
})
