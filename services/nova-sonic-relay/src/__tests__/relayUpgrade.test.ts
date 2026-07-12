import { EventEmitter } from 'node:events'
import type { IncomingMessage } from 'node:http'

import { describe, expect, it, vi } from 'vitest'

import { mintRelayToken, type RelayTokenPayload } from '../relayAuth.js'
import {
  createRelayUpgradeAuthorizer,
  createRelayUpgradeController,
  rejectRelayUpgrade,
} from '../relayUpgrade.js'
import type { RelayStartConfig } from '../wsProtocol.js'

const NOW_SECONDS = 2_000_000_000
const PRIMARY_SECRET = 'synthetic-primary-secret'
const SECONDARY_SECRET = 'synthetic-secondary-secret'
const ALLOWED_ORIGIN = 'https://app.example.test'
const JTI = '11111111-1111-4111-8111-111111111111'
const START_CONFIG: RelayStartConfig = {
  instructions: 'Purpose-limited instructions',
  tools: [],
  voiceId: 'tiffany',
  sessionType: 'referral_clarification',
}

function requestWith(input: {
  origin?: string
  protocols?: string
} = {}): IncomingMessage {
  return {
    headers: {
      ...(input.origin === undefined ? {} : { origin: input.origin }),
      ...(input.protocols === undefined
        ? {}
        : { 'sec-websocket-protocol': input.protocols }),
    },
  } as IncomingMessage
}

function validToken(secret = PRIMARY_SECRET): string {
  return mintRelayToken(START_CONFIG, secret, NOW_SECONDS + 120, JTI)
}

function validRequest(secret = PRIMARY_SECRET): IncomingMessage {
  return requestWith({
    origin: ALLOWED_ORIGIN,
    protocols: `nova.v1, ${validToken(secret)}`,
  })
}

function payload(): RelayTokenPayload {
  const tokenPayload = JSON.parse(
    Buffer.from(validToken().split('.')[0], 'base64url').toString('utf8'),
  ) as RelayTokenPayload
  return tokenPayload
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

async function settleAsyncUpgrade(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
}

class TestRawSocket extends EventEmitter {
  destroyed = false
  writable = true
  readonly writes: string[] = []
  writeCalls = 0
  destroyCalls = 0
  throwOnWrite = false
  throwOnDestroy = false

  write(data: string): boolean {
    this.writeCalls += 1
    if (this.throwOnWrite) throw new Error('synthetic write failure')
    this.writes.push(data)
    return true
  }

  destroy(): this {
    this.destroyCalls += 1
    if (this.throwOnDestroy) throw new Error('synthetic destroy failure')
    this.destroyed = true
    this.writable = false
    return this
  }
}

class TestAcceptedWebSocket extends EventEmitter {
  terminate = vi.fn()
  close = vi.fn()
}

function makeAuthorizer(overrides: Partial<{
  primarySecret: string
  secondarySecret: string
  allowedOrigins: readonly string[]
  replayStore: { consume(authorization: RelayTokenPayload): Promise<boolean> } | null
}> = {}) {
  const consume = vi.fn(async () => true)
  const replayStore = { consume }
  const authorize = createRelayUpgradeAuthorizer({
    primarySecret: PRIMARY_SECRET,
    secondarySecret: SECONDARY_SECRET,
    allowedOrigins: [ALLOWED_ORIGIN],
    replayStore,
    nowSeconds: () => NOW_SECONDS,
    ...overrides,
  })
  return { authorize, consume }
}

describe('Nova relay upgrade authorizer', () => {
  it.each([
    ['primary secret', { primarySecret: '' }],
    ['Origin allowlist', { allowedOrigins: [] }],
    ['replay store', { replayStore: null }],
  ] as const)('fails closed when the %s is missing', async (_name, missing) => {
    const { authorize, consume } = makeAuthorizer(missing)

    await expect(authorize(validRequest())).resolves.toBeNull()
    expect(consume).not.toHaveBeenCalled()
  })

  it.each([
    ['missing', undefined],
    ['wrong', 'https://evil.example.test'],
    ['non-exact', `${ALLOWED_ORIGIN}/`],
  ])('rejects a %s Origin', async (_name, origin) => {
    const { authorize, consume } = makeAuthorizer()

    await expect(
      authorize(
        requestWith({
          origin,
          protocols: `nova.v1, ${validToken()}`,
        }),
      ),
    ).resolves.toBeNull()
    expect(consume).not.toHaveBeenCalled()
  })

  it.each([
    ['missing', undefined],
    ['fixed protocol only', 'nova.v1'],
    ['token only', validToken()],
    ['extra protocol', `nova.v1, ${validToken()}, extra.v1`],
    ['duplicate fixed protocol', 'nova.v1, nova.v1'],
    ['malformed token', 'nova.v1, not-a-token'],
  ])('rejects %s requested subprotocols', async (_name, protocols) => {
    const { authorize, consume } = makeAuthorizer()

    await expect(
      authorize(requestWith({ origin: ALLOWED_ORIGIN, protocols })),
    ).resolves.toBeNull()
    expect(consume).not.toHaveBeenCalled()
  })

  it('rejects a token signed by neither configured rotation key', async () => {
    const { authorize, consume } = makeAuthorizer()

    await expect(authorize(validRequest('untrusted-secret'))).resolves.toBeNull()
    expect(consume).not.toHaveBeenCalled()
  })

  it.each([
    ['primary', PRIMARY_SECRET],
    ['secondary', SECONDARY_SECRET],
  ])('accepts and consumes a token signed by the %s key', async (_name, secret) => {
    const { authorize, consume } = makeAuthorizer()

    const authorization = await authorize(validRequest(secret))

    expect(authorization).toEqual(payload())
    expect(consume).toHaveBeenCalledOnce()
    expect(consume).toHaveBeenCalledWith(payload())
    expect(authorization).not.toHaveProperty('matchedKey')
  })

  it('rejects when the replay token was already consumed', async () => {
    const replayStore = { consume: vi.fn(async () => false) }
    const { authorize } = makeAuthorizer({ replayStore })

    await expect(authorize(validRequest())).resolves.toBeNull()
    expect(replayStore.consume).toHaveBeenCalledOnce()
  })

  it('fails closed when replay protection rejects', async () => {
    const replayStore = {
      consume: vi.fn(async () => {
        throw new Error('synthetic replay-store details')
      }),
    }
    const { authorize } = makeAuthorizer({ replayStore })

    await expect(authorize(validRequest())).resolves.toBeNull()
  })
})

describe('Nova relay async upgrade controller', () => {
  it('consumes the replay token before accepting the WebSocket upgrade', async () => {
    const events: string[] = []
    const replayStore = {
      consume: vi.fn(async () => {
        events.push('consume')
        return true
      }),
    }
    const authorize = createRelayUpgradeAuthorizer({
      primarySecret: PRIMARY_SECRET,
      allowedOrigins: [ALLOWED_ORIGIN],
      replayStore,
      nowSeconds: () => NOW_SECONDS,
    })
    const controller = createRelayUpgradeController({
      authorize,
      acceptUpgrade: (_request, _socket, _head, accepted) => {
        events.push('accept')
        accepted(new TestAcceptedWebSocket())
      },
      emitConnection: () => {
        events.push('connection')
      },
    })

    controller.handleUpgrade(validRequest(), new TestRawSocket(), Buffer.alloc(0))
    await settleAsyncUpgrade()

    expect(events).toEqual(['consume', 'accept', 'connection'])
  })

  it.each(['error', 'close', 'end'] as const)(
    'destroys and never later accepts when the raw socket emits %s during authorization',
    async (event) => {
      const authorization = deferred<RelayTokenPayload | null>()
      const acceptUpgrade = vi.fn()
      const socket = new TestRawSocket()
      const controller = createRelayUpgradeController({
        authorize: () => authorization.promise,
        acceptUpgrade,
        emitConnection: vi.fn(),
      })

      controller.handleUpgrade(validRequest(), socket, Buffer.alloc(0))
      expect(socket.listenerCount('error')).toBe(1)
      if (event === 'error') {
        expect(() => socket.emit(event, new Error('clinical data'))).not.toThrow()
      } else {
        socket.emit(event)
      }
      authorization.resolve(payload())
      await settleAsyncUpgrade()

      expect(socket.destroyCalls).toBe(1)
      expect(socket.writes).toEqual([])
      expect(acceptUpgrade).not.toHaveBeenCalled()
      expect(socket.listenerCount('error')).toBe(0)
    },
  )

  it('rejects idempotently and never throws when socket operations fail', () => {
    const socket = new TestRawSocket()
    socket.throwOnWrite = true
    socket.throwOnDestroy = true

    expect(() => rejectRelayUpgrade(socket)).not.toThrow()
    expect(() => rejectRelayUpgrade(socket)).not.toThrow()
    expect(socket.writeCalls).toBe(1)
    expect(socket.destroyCalls).toBe(1)
  })

  it('does not write to a destroyed or non-writable socket', () => {
    const destroyedSocket = new TestRawSocket()
    destroyedSocket.destroyed = true
    destroyedSocket.writable = false
    const nonWritableSocket = new TestRawSocket()
    nonWritableSocket.writable = false

    rejectRelayUpgrade(destroyedSocket)
    rejectRelayUpgrade(nonWritableSocket)

    expect(destroyedSocket.writeCalls).toBe(0)
    expect(destroyedSocket.destroyCalls).toBe(0)
    expect(nonWritableSocket.writeCalls).toBe(0)
    expect(nonWritableSocket.destroyCalls).toBe(1)
  })

  it('clears the authorization handoff and destroys safely when accept throws', async () => {
    const socket = new TestRawSocket()
    const request = validRequest()
    const controller = createRelayUpgradeController({
      authorize: async () => payload(),
      acceptUpgrade: () => {
        throw new Error('synthetic accept failure')
      },
      emitConnection: vi.fn(),
    })

    controller.handleUpgrade(request, socket, Buffer.alloc(0))
    await settleAsyncUpgrade()

    expect(controller.takeAuthorization(request)).toBeNull()
    expect(socket.destroyCalls).toBe(1)
    expect(socket.listenerCount('error')).toBe(0)
  })

  it('hands authorization to the connection exactly once', async () => {
    const request = validRequest()
    const controller = createRelayUpgradeController({
      authorize: async () => payload(),
      acceptUpgrade: (_request, _socket, _head, accepted) => {
        accepted(new TestAcceptedWebSocket())
      },
      emitConnection: vi.fn(),
    })

    controller.handleUpgrade(request, new TestRawSocket(), Buffer.alloc(0))
    await settleAsyncUpgrade()

    expect(controller.takeAuthorization(request)).toEqual(payload())
    expect(controller.takeAuthorization(request)).toBeNull()
  })

  it('installs a sanitized accepted-WebSocket error handler before session setup', async () => {
    const events: string[] = []
    const logTransportError = vi.fn((message: string) => events.push(`log:${message}`))
    const webSocket = new TestAcceptedWebSocket()
    const controller = createRelayUpgradeController({
      authorize: async () => payload(),
      acceptUpgrade: (_request, _socket, _head, accepted) => {
        events.push('accept')
        accepted(webSocket)
      },
      emitConnection: () => {
        events.push(`connection:error-listeners=${webSocket.listenerCount('error')}`)
      },
      logTransportError,
    })

    controller.handleUpgrade(validRequest(), new TestRawSocket(), Buffer.alloc(0))
    await settleAsyncUpgrade()
    expect(() =>
      webSocket.emit('error', new Error('patient transcript must not be logged')),
    ).not.toThrow()

    expect(events).toEqual([
      'accept',
      'connection:error-listeners=1',
      'log:[nova-relay] accepted WebSocket transport error',
    ])
    expect(logTransportError).toHaveBeenCalledWith(
      '[nova-relay] accepted WebSocket transport error',
    )
    expect(JSON.stringify(logTransportError.mock.calls)).not.toContain(
      'patient transcript',
    )
    expect(webSocket.terminate).toHaveBeenCalledOnce()
  })

  it('falls back to close when terminating an errored accepted WebSocket throws', async () => {
    const webSocket = new TestAcceptedWebSocket()
    webSocket.terminate.mockImplementation(() => {
      throw new Error('synthetic terminate failure')
    })
    const controller = createRelayUpgradeController({
      authorize: async () => payload(),
      acceptUpgrade: (_request, _socket, _head, accepted) => accepted(webSocket),
      emitConnection: vi.fn(),
    })

    controller.handleUpgrade(validRequest(), new TestRawSocket(), Buffer.alloc(0))
    await settleAsyncUpgrade()

    expect(() => webSocket.emit('error', new Error('sensitive'))).not.toThrow()
    expect(webSocket.close).toHaveBeenCalledOnce()
  })
})
