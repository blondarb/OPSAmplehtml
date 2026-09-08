import { EventEmitter } from 'node:events'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

// Mock the Bedrock bidi-streaming SDK entirely — these tests must never touch
// the network. `sendMock` is shared via closure so each test configures
// client.send()'s behavior (reject to simulate a stream-open failure, or
// resolve with a controllable async-iterable `body` to simulate a live
// stream) independently. Mirrors the existing pattern in
// transcribeMedicalSession.test.ts.
const sendMock = vi.fn()

vi.mock('@aws-sdk/client-bedrock-runtime', () => {
  class BedrockRuntimeClient {
    send = sendMock
  }
  class InvokeModelWithBidirectionalStreamCommand {
    input: unknown
    constructor(input: unknown) {
      this.input = input
    }
  }
  return { BedrockRuntimeClient, InvokeModelWithBidirectionalStreamCommand }
})

// PORT=0 so the module's top-level `server.listen(...)` side effect binds an
// ephemeral, unused port instead of colliding with a real relay. The auth
// gate (NOVA_RELAY_SHARED_SECRET) is irrelevant here — these tests call
// `handleConnection` directly, bypassing the WS upgrade/verifyClient path
// entirely, so no token/handshake is needed.
process.env.PORT = '0'

const { handleConnection, server } = await import('../server.js')

afterAll(() => {
  server.close()
})

// ---------------------------------------------------------------------------
// FakeWs — the minimal `ws`-shaped surface handleConnection actually uses:
// `.on('message'|'close', cb)`, `.send(data)`, `.close(code?, reason?)`,
// `.readyState`. Extends EventEmitter so `.on`/`.emit` behave like the real
// `ws` WebSocket (which is itself an EventEmitter).
// ---------------------------------------------------------------------------

const OPEN = 1
const CLOSED = 3

class FakeWs extends EventEmitter {
  readyState = OPEN
  sent: string[] = []
  closeCalls: Array<{ code?: number; reason?: string }> = []

  send(data: string): void {
    this.sent.push(data)
  }

  close(code?: number, reason?: string): void {
    this.closeCalls.push({ code, reason })
    this.readyState = CLOSED
    // Real `ws` fires 'close' asynchronously after close() resolves the
    // teardown — the relay's own `ws.on('close', ...)` (best-effort
    // session/transcribe cleanup) depends on that ordering.
    queueMicrotask(() => this.emit('close'))
  }

  sentMessages(): unknown[] {
    return this.sent.map((s) => JSON.parse(s))
  }
}

/** A `response.body` the test can push Bedrock protocol events onto by hand. */
function makeControllableBody() {
  const queue: unknown[] = []
  let resolveNext: ((r: IteratorResult<unknown>) => void) | null = null
  let ended = false
  return {
    push(value: unknown): void {
      if (resolveNext) {
        const r = resolveNext
        resolveNext = null
        r({ value, done: false })
      } else {
        queue.push(value)
      }
    },
    end(): void {
      ended = true
      if (resolveNext) {
        const r = resolveNext
        resolveNext = null
        r({ value: undefined, done: true })
      }
    },
    [Symbol.asyncIterator]() {
      return {
        next(): Promise<IteratorResult<unknown>> {
          if (queue.length > 0) {
            return Promise.resolve({ value: queue.shift(), done: false })
          }
          if (ended) {
            return Promise.resolve({ value: undefined, done: true })
          }
          return new Promise((resolve) => {
            resolveNext = resolve
          })
        },
      }
    },
  }
}

function sendMsg(ws: FakeWs, msg: Record<string, unknown>): void {
  ws.emit('message', Buffer.from(JSON.stringify(msg)))
}

/** Flush pending microtasks/timers so async handlers settle before assertions. */
function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

describe('handleConnection — onError closes the client ws (nova stream error graceful end)', () => {
  beforeEach(() => {
    sendMock.mockReset()
  })

  it('a stream-open failure sends {t:"error"} to the client AND closes the ws with code 1011', async () => {
    sendMock.mockRejectedValue(new Error('ThrottlingException: too many requests'))

    const ws = new FakeWs()
    handleConnection(ws as never)

    sendMsg(ws, { t: 'start', instructions: 'be a historian', tools: [] })
    await flush()

    const messages = ws.sentMessages() as Array<{ t: string; message?: string }>
    const errorMsgs = messages.filter((m) => m.t === 'error')
    expect(errorMsgs).toHaveLength(1)
    expect(errorMsgs[0].message).toContain('ThrottlingException')

    expect(ws.closeCalls).toHaveLength(1)
    expect(ws.closeCalls[0]).toEqual({ code: 1011, reason: 'nova stream error' })
  })

  it('a mid-stream modelStreamErrorException, when the connection-renewal attempt it triggers ALSO fails, still sends {t:"error"} and closes with code 1011', async () => {
    // NovaConnectionManager (src/novaConnectionManager.ts) now attempts one
    // connection-renewal before giving up on a stream error — see its
    // "reactive path". This test proves the #234 close(1011) fallback still
    // fires when that renewal attempt itself cannot open a new stream: the
    // FIRST client.send() (the original session) succeeds; the SECOND
    // (the renewal's replacement session) fails.
    const body = makeControllableBody()
    sendMock.mockResolvedValueOnce({ body }).mockRejectedValueOnce(new Error('renewal open also failed'))

    const ws = new FakeWs()
    handleConnection(ws as never)

    sendMsg(ws, { t: 'start', instructions: 'be a historian', tools: [] })
    await flush()
    expect(ws.closeCalls).toHaveLength(0) // stream is open — nothing has failed yet

    body.push({ modelStreamErrorException: { name: 'ModelStreamErrorException', message: 'Model has timed out in processing the request. Try your request again.' } })
    await flush()

    const messages = ws.sentMessages() as Array<{ t: string; message?: string }>
    const errorMsgs = messages.filter((m) => m.t === 'error')
    expect(errorMsgs).toHaveLength(1)
    expect(errorMsgs[0].message).toContain('timed out')

    expect(ws.closeCalls).toHaveLength(1)
    expect(ws.closeCalls[0]).toEqual({ code: 1011, reason: 'nova stream error' })

    body.end()
  })

  it('a mid-stream modelStreamErrorException, when the connection-renewal attempt it triggers SUCCEEDS, does NOT send {t:"error"} or close — the interview continues on the new connection', async () => {
    const oldBody = makeControllableBody()
    const newBody = makeControllableBody()
    sendMock.mockResolvedValueOnce({ body: oldBody }).mockResolvedValueOnce({ body: newBody })

    const ws = new FakeWs()
    handleConnection(ws as never)

    sendMsg(ws, { t: 'start', instructions: 'be a historian', tools: [] })
    await flush()

    oldBody.push({ modelStreamErrorException: { name: 'ModelStreamErrorException', message: 'Model has timed out in processing the request. Try your request again.' } })
    await flush()

    const messages = ws.sentMessages() as Array<{ t: string; message?: string }>
    expect(messages.some((m) => m.t === 'error')).toBe(false)
    expect(ws.closeCalls).toHaveLength(0)
    expect(sendMock).toHaveBeenCalledTimes(2) // original + one renewal attempt, no more

    oldBody.end()
    newBody.end()
  })

  it('"stop" followed by an error does not double-close: only the stop path\'s close() runs', async () => {
    const body = makeControllableBody()
    sendMock.mockResolvedValue({ body })

    const ws = new FakeWs()
    handleConnection(ws as never)

    sendMsg(ws, { t: 'start', instructions: 'be a historian', tools: [] })
    await flush()

    // Client asks to end the interview — this is the FIRST thing to touch
    // `closing`. session.stop()'s own graceful-close sequence (audioContentEnd
    // / promptEnd / sessionEnd) is now in flight but not yet drained — the
    // 'stop' case's `ws.close()` only runs once `session.stop()` resolves,
    // which is gated on the response body ending.
    sendMsg(ws, { t: 'stop' })
    await flush()
    expect(ws.closeCalls).toHaveLength(0) // still draining — nothing has closed yet

    // While draining, the stream itself reports an error (e.g. the session-end
    // sequence surfaces as a late exception). onError must still notify the
    // client, but must NOT attempt a second, competing close() — the 'stop'
    // path already owns teardown.
    body.push({ internalServerException: { name: 'InternalServerException', message: 'boom during teardown' } })
    await flush()

    const messages = ws.sentMessages() as Array<{ t: string; message?: string }>
    expect(messages.some((m) => m.t === 'error' && m.message?.includes('boom during teardown'))).toBe(true)
    expect(ws.closeCalls).toHaveLength(0) // onError's close attempt was suppressed by the `closing` guard

    // Let the response body (and therefore session.stop()) finish draining —
    // this resolves the 'stop' case's `.then(() => ws.close())`.
    body.end()
    await flush()

    expect(ws.closeCalls).toHaveLength(1)
    // The stop path calls the bare `ws.close()` (no code/reason) — distinct
    // from onError's 1011/'nova stream error', proving onError's close never
    // fired.
    expect(ws.closeCalls[0]).toEqual({ code: undefined, reason: undefined })
  })
})
