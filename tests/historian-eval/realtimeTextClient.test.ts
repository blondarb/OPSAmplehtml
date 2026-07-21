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
})
