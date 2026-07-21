/**
 * Integration tests for RealtimeTextClient against a REAL local WebSocket
 * server standing in for OpenAI's Realtime API — not an injected fake, a
 * literal `ws` server scripted to speak the same event protocol. Per the
 * task brief: "the WS loop itself is integration-tested live, not
 * unit-mocked to death — ONE happy-path + ONE function-call-path test
 * against a local mock WS server is enough."
 */
import { describe, it, expect, afterEach } from 'vitest'
import { WebSocketServer, type WebSocket as WsSocket } from 'ws'
import { RealtimeTextClient } from '@/lib/historian/synthetic/realtimeTextClient'

interface MockServerHandle {
  server: WebSocketServer
  url: string
}

/** Minimal shape of the client-sent wire events this test asserts against — avoids `any` while still allowing free-form fields via the index signature. */
interface SentWireMessage {
  type: string
  session?: { type?: string; modalities?: string[]; instructions?: string; turn_detection?: unknown; tools?: unknown[] }
  item?: { type?: string; role?: string; content?: unknown; call_id?: string; output?: string }
  response?: Record<string, unknown>
  [key: string]: unknown
}

function startMockServer(
  onConnection: (ws: WsSocket, send: (obj: unknown) => void) => void,
): Promise<MockServerHandle> {
  return new Promise((resolve) => {
    const server = new WebSocketServer({ port: 0, host: '127.0.0.1' })
    server.on('listening', () => {
      const address = server.address()
      const port = typeof address === 'object' && address ? address.port : 0
      resolve({ server, url: `ws://127.0.0.1:${port}` })
    })
    server.on('connection', (ws) => {
      const send = (obj: unknown) => ws.send(JSON.stringify(obj))
      onConnection(ws, send)
    })
  })
}

describe('RealtimeTextClient', () => {
  let server: WebSocketServer | null = null

  afterEach(async () => {
    await new Promise<void>((resolve) => {
      if (!server) return resolve()
      server.close(() => resolve())
    })
    server = null
  })

  it('happy path: connects, sends a spec-correct session.update, and completes a text exchange', async () => {
    const received: SentWireMessage[] = []
    const { server: s, url } = await startMockServer((ws, send) => {
      send({ type: 'session.created' })
      ws.on('message', (data) => {
        const msg = JSON.parse(data.toString())
        received.push(msg)
        if (msg.type === 'session.update') {
          send({ type: 'session.updated' })
        } else if (msg.type === 'response.create') {
          send({
            type: 'response.done',
            response: {
              status: 'completed',
              output: [
                {
                  type: 'message',
                  role: 'assistant',
                  content: [{ type: 'output_text', text: 'Hi there, what brings you in today?' }],
                },
              ],
            },
          })
        }
      })
    })
    server = s

    const client = new RealtimeTextClient({
      url,
      instructions: 'test instructions',
      tools: [{ type: 'function', name: 'save_interview_output' }],
      responseTimeoutMs: 3000,
      sessionTimeoutMs: 60_000,
    })

    await client.connect()

    const greeting = await client.requestGreeting()
    expect(greeting.assistantText).toBe('Hi there, what brings you in today?')
    expect(greeting.functionCalls).toEqual([])
    expect(greeting.status).toBe('completed')

    const reply = await client.sendUserText('My arm hurts')
    expect(reply.assistantText).toBe('Hi there, what brings you in today?')

    client.close()

    // session.update must include session.type ('realtime') — omitting it
    // gets HTTP 400 missing_required_parameter from the real API (see
    // openaiWebrtcProvider.ts's updateInstructions() comment).
    const sessionUpdate = received.find((m) => m.type === 'session.update')
    expect(sessionUpdate?.session).toMatchObject({
      type: 'realtime',
      modalities: ['text'],
      instructions: 'test instructions',
      turn_detection: null,
    })
    expect(sessionUpdate?.session?.tools).toEqual([{ type: 'function', name: 'save_interview_output' }])

    const userItem = received.find((m) => m.type === 'conversation.item.create')
    expect(userItem?.item).toEqual({
      type: 'message',
      role: 'user',
      content: [{ type: 'input_text', text: 'My arm hurts' }],
    })

    // response.create must be sent with no response.modalities field (#142
    // in openaiWebrtcProvider.ts — dropping it fixed malformed/empty responses).
    const responseCreates = received.filter((m) => m.type === 'response.create')
    expect(responseCreates.length).toBeGreaterThan(0)
    for (const rc of responseCreates) {
      expect(rc.response).toEqual({})
    }
  })

  it('function-call path: surfaces response.done function_call items, then accepts a function_call_output and continues', async () => {
    let responseCreateCount = 0
    const received: SentWireMessage[] = []
    const { server: s, url } = await startMockServer((ws, send) => {
      send({ type: 'session.created' })
      ws.on('message', (data) => {
        const msg = JSON.parse(data.toString())
        received.push(msg)
        if (msg.type === 'session.update') {
          send({ type: 'session.updated' })
          return
        }
        if (msg.type === 'response.create') {
          responseCreateCount += 1
          if (responseCreateCount === 1) {
            send({
              type: 'response.done',
              response: {
                status: 'completed',
                output: [
                  {
                    type: 'function_call',
                    name: 'scale_step',
                    call_id: 'call_1',
                    arguments: JSON.stringify({ scale_id: 'phq9', reason: 'mood screen' }),
                  },
                ],
              },
            })
          } else {
            send({
              type: 'response.done',
              response: {
                status: 'completed',
                output: [
                  {
                    type: 'message',
                    role: 'assistant',
                    content: [
                      { type: 'output_text', text: 'Over the last two weeks, how often have you felt down?' },
                    ],
                  },
                ],
              },
            })
          }
        }
      })
    })
    server = s

    const client = new RealtimeTextClient({ url, instructions: 'x', tools: [], responseTimeoutMs: 3000 })
    await client.connect()

    const turn1 = await client.sendUserText('I feel down sometimes')
    expect(turn1.assistantText).toBe('')
    expect(turn1.functionCalls).toHaveLength(1)
    expect(turn1.functionCalls[0]).toMatchObject({
      callId: 'call_1',
      name: 'scale_step',
      arguments: { scale_id: 'phq9', reason: 'mood screen' },
    })

    const turn2 = await client.sendFunctionCallOutput(turn1.functionCalls[0].callId, {
      done: false,
      index: 0,
      item: { text: 'Over the last two weeks, how often have you felt down?' },
    })
    expect(turn2.assistantText).toBe('Over the last two weeks, how often have you felt down?')
    expect(turn2.functionCalls).toEqual([])

    client.close()

    const functionOutputItem = received.find((m) => m.item?.type === 'function_call_output')
    expect(functionOutputItem?.item?.call_id).toBe('call_1')
    expect(JSON.parse(functionOutputItem?.item?.output ?? '')).toEqual({
      done: false,
      index: 0,
      item: { text: 'Over the last two weeks, how often have you felt down?' },
    })
  })

  it(
    'reconnects exactly once on an unexpected close and the session continues; a second unexpected close is terminal (no further reconnect)',
    async () => {
      let connectionCount = 0
      let conn2ResponseCreateCount = 0
      const { server: s, url } = await startMockServer((ws) => {
        connectionCount += 1
        const connNum = connectionCount
        const send = (obj: unknown) => ws.send(JSON.stringify(obj))
        send({ type: 'session.created' })
        ws.on('message', (data) => {
          const msg = JSON.parse(data.toString())
          if (msg.type === 'session.update') {
            send({ type: 'session.updated' })
            return
          }
          if (msg.type !== 'response.create') return

          if (connNum === 1) {
            // Unexpected drop #1 — never respond, just kill the socket.
            ws.terminate()
            return
          }

          // connNum === 2 — the reconnected socket.
          conn2ResponseCreateCount += 1
          if (conn2ResponseCreateCount === 1) {
            send({
              type: 'response.done',
              response: {
                status: 'completed',
                id: 'resp_after_reconnect',
                output: [
                  { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'reconnected ok' }] },
                ],
              },
            })
          } else {
            // Unexpected drop #2, on the ALREADY-reconnected socket — must
            // be terminal (no third connection attempt).
            ws.terminate()
          }
        })
      })
      server = s

      let sessionUpdatedCount = 0
      let resolveSecondHandshake!: () => void
      const secondHandshake = new Promise<void>((resolve) => {
        resolveSecondHandshake = resolve
      })

      const client = new RealtimeTextClient({
        url,
        instructions: 'x',
        tools: [],
        responseTimeoutMs: 2000,
        onWireEvent: (direction, msg) => {
          if (direction === 'in' && msg.type === 'session.updated') {
            sessionUpdatedCount += 1
            // The 1st session.updated completes client.connect() below; the
            // 2nd is the fire-and-forget auto-reconnect's own handshake.
            if (sessionUpdatedCount === 2) resolveSecondHandshake()
          }
        },
      })

      await client.connect()

      // Exchange 1: the server drops mid-response — must reject (not hang,
      // not silently resolve empty).
      await expect(client.requestGreeting()).rejects.toThrow(/closed unexpectedly/)

      // Wait for the fire-and-forget one-time reconnect's handshake to land.
      await secondHandshake
      expect(connectionCount).toBe(2)

      // Exchange 2: succeeds against the reconnected socket — the session
      // continues after the first drop, it isn't left dead.
      const turn = await client.requestGreeting()
      expect(turn.assistantText).toBe('reconnected ok')

      // Exchange 3: the (already-reconnected) socket drops again — this
      // must be a TERMINAL failure, not a second auto-reconnect.
      await expect(client.requestGreeting()).rejects.toThrow(/closed unexpectedly/)

      // Give any (incorrect, if present) further reconnect attempt time to
      // happen, then confirm no third connection was ever made.
      await new Promise((resolve) => setTimeout(resolve, 300))
      expect(connectionCount).toBe(2)

      client.close()
    },
    10000,
  )

  it('falls back to delta-accumulated text when response.done carries no message item (and correctly surfaces a non-"completed" status)', async () => {
    const { server: s, url } = await startMockServer((ws, send) => {
      send({ type: 'session.created' })
      ws.on('message', (data) => {
        const msg = JSON.parse(data.toString())
        if (msg.type === 'session.update') {
          send({ type: 'session.updated' })
          return
        }
        if (msg.type === 'response.create') {
          send({ type: 'response.output_text.delta', delta: 'Hello ' })
          send({ type: 'response.output_text.delta', delta: 'there.' })
          // No message item in output[] at all — status intentionally
          // NOT 'completed', to also confirm status round-trips correctly
          // (the field fix-1a's orchestrator-level check depends on).
          send({ type: 'response.done', response: { status: 'incomplete', id: 'resp_delta_fallback', output: [] } })
        }
      })
    })
    server = s

    const client = new RealtimeTextClient({ url, instructions: 'x', tools: [], responseTimeoutMs: 3000 })
    await client.connect()

    const turn = await client.requestGreeting()
    expect(turn.assistantText).toBe('Hello there.')
    expect(turn.functionCalls).toEqual([])
    expect(turn.status).toBe('incomplete')
    expect(turn.id).toBe('resp_delta_fallback')

    client.close()
  })

  it('resolves a well-formed EMPTY result (no text, no deltas, no function_call) for a response.done with nothing to parse — the exact trigger condition historian-synthetic-run.ts\'s processTurn treats as a failed/empty turn', async () => {
    const { server: s, url } = await startMockServer((ws, send) => {
      send({ type: 'session.created' })
      ws.on('message', (data) => {
        const msg = JSON.parse(data.toString())
        if (msg.type === 'session.update') {
          send({ type: 'session.updated' })
          return
        }
        if (msg.type === 'response.create') {
          send({ type: 'response.done', response: { status: 'completed', id: 'resp_empty', output: [] } })
        }
      })
    })
    server = s

    const client = new RealtimeTextClient({ url, instructions: 'x', tools: [], responseTimeoutMs: 3000 })
    await client.connect()

    const turn = await client.requestGreeting()
    expect(turn.assistantText).toBe('')
    expect(turn.functionCalls).toEqual([])
    expect(turn.status).toBe('completed')
    expect(turn.id).toBe('resp_empty')

    client.close()
  })
})
