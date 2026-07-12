import type { IncomingMessage } from 'node:http'

import { verifyRelayToken, type RelayTokenPayload } from './relayAuth.js'

const NOVA_PROTOCOL = 'nova.v1'
const UNAUTHORIZED_RESPONSE =
  'HTTP/1.1 401 Unauthorized\r\nConnection: close\r\nContent-Length: 0\r\n\r\n'
const ACCEPTED_SOCKET_ERROR_LOG =
  '[nova-relay] accepted WebSocket transport error'

export interface RelayReplayStore {
  consume(authorization: RelayTokenPayload): Promise<boolean>
}

export interface RawUpgradeSocket {
  readonly destroyed: boolean
  readonly writable: boolean
  write(data: string): unknown
  destroy(): unknown
  on(event: 'error' | 'close' | 'end', listener: () => void): unknown
  removeListener(
    event: 'error' | 'close' | 'end',
    listener: () => void,
  ): unknown
}

export interface AcceptedWebSocket {
  on(event: 'error', listener: () => void): unknown
  terminate(): unknown
  close(): unknown
}

export type RelayUpgradeAuthorizer = (
  request: IncomingMessage,
) => Promise<RelayTokenPayload | null>

function parseRequestedProtocols(request: IncomingMessage): string[] | null {
  const header = request.headers['sec-websocket-protocol']
  if (typeof header !== 'string') return null
  const protocols = header.split(',').map((protocol) => protocol.trim())
  return protocols.some((protocol) => protocol.length === 0) ? null : protocols
}

/**
 * Build the fail-closed authorization boundary for a browser WebSocket
 * upgrade. The returned payload never identifies which rotation key matched.
 */
export function createRelayUpgradeAuthorizer(input: {
  primarySecret: string
  secondarySecret?: string
  allowedOrigins: readonly string[]
  replayStore: RelayReplayStore | null
  nowSeconds?: () => number
}): RelayUpgradeAuthorizer {
  const configured =
    input.primarySecret.trim().length > 0 &&
    input.replayStore !== null &&
    input.allowedOrigins.length > 0 &&
    input.allowedOrigins.every((origin) => origin.length > 0)
  const allowedOrigins = new Set(input.allowedOrigins)
  const secondarySecret = input.secondarySecret?.trim()
    ? input.secondarySecret
    : null
  const nowSeconds = input.nowSeconds ?? (() => Date.now() / 1000)

  return async (request) => {
    if (!configured || !input.replayStore) return null

    const origin = request.headers.origin
    if (typeof origin !== 'string' || !allowedOrigins.has(origin)) return null

    const protocols = parseRequestedProtocols(request)
    if (
      !protocols ||
      protocols.length !== 2 ||
      protocols.filter((protocol) => protocol === NOVA_PROTOCOL).length !== 1
    ) {
      return null
    }

    const token = protocols.find((protocol) => protocol !== NOVA_PROTOCOL)
    if (!token) return null

    const observedAt = nowSeconds()
    const authorization =
      verifyRelayToken(token, input.primarySecret, observedAt) ??
      (secondarySecret && secondarySecret !== input.primarySecret
        ? verifyRelayToken(token, secondarySecret, observedAt)
        : null)
    if (!authorization) return null

    try {
      return (await input.replayStore.consume(authorization))
        ? authorization
        : null
    } catch {
      return null
    }
  }
}

const rejectedSockets = new WeakSet<RawUpgradeSocket>()

function destroyRawSocketSafely(socket: RawUpgradeSocket): void {
  if (socket.destroyed) return
  try {
    socket.destroy()
  } catch {
    // Transport teardown is best effort and must never escape an event handler.
  }
}

/** Write at most one rejection and always tear down without throwing. */
export function rejectRelayUpgrade(socket: RawUpgradeSocket): void {
  if (rejectedSockets.has(socket)) return
  rejectedSockets.add(socket)

  if (!socket.destroyed && socket.writable) {
    try {
      socket.write(UNAUTHORIZED_RESPONSE)
    } catch {
      // The peer may disappear between the state check and the write.
    }
  }
  destroyRawSocketSafely(socket)
}

function terminateAcceptedWebSocketSafely(webSocket: AcceptedWebSocket): void {
  try {
    webSocket.terminate()
    return
  } catch {
    // A socket not yet fully open may reject terminate; close is the fallback.
  }
  try {
    webSocket.close()
  } catch {
    // The socket is already unusable. Never throw from an `error` listener.
  }
}

function attachAcceptedWebSocketErrorHandler(
  webSocket: AcceptedWebSocket,
  logTransportError: (message: string) => void,
): boolean {
  try {
    webSocket.on('error', () => {
      try {
        logTransportError(ACCEPTED_SOCKET_ERROR_LOG)
      } catch {
        // Logging failure must not prevent transport teardown.
      }
      terminateAcceptedWebSocketSafely(webSocket)
    })
    return true
  } catch {
    terminateAcceptedWebSocketSafely(webSocket)
    return false
  }
}

/**
 * Coordinate the asynchronous authorization-to-`handleUpgrade` handoff while
 * the raw socket is still owned by the HTTP server.
 */
export function createRelayUpgradeController<
  Socket extends RawUpgradeSocket = RawUpgradeSocket,
  WebSocket extends AcceptedWebSocket = AcceptedWebSocket,
>(input: {
  authorize: RelayUpgradeAuthorizer
  acceptUpgrade: (
    request: IncomingMessage,
    socket: Socket,
    head: Buffer,
    accepted: (webSocket: WebSocket) => void,
  ) => void
  emitConnection: (
    webSocket: WebSocket,
    request: IncomingMessage,
  ) => void
  logTransportError?: (message: string) => void
}) {
  const authorizedRequests = new WeakMap<IncomingMessage, RelayTokenPayload>()
  const logTransportError = input.logTransportError ?? (() => {})

  function takeAuthorization(
    request: IncomingMessage,
  ): RelayTokenPayload | null {
    const authorization = authorizedRequests.get(request) ?? null
    authorizedRequests.delete(request)
    return authorization
  }

  function handleUpgrade(
    request: IncomingMessage,
    socket: Socket,
    head: Buffer,
  ): void {
    let authorizationPending = true
    let transportAbandoned = false

    const onPendingTransportFailure = () => {
      if (!authorizationPending) return
      transportAbandoned = true
      destroyRawSocketSafely(socket)
    }
    socket.on('error', onPendingTransportFailure)
    socket.on('close', onPendingTransportFailure)
    socket.on('end', onPendingTransportFailure)

    const removePendingListeners = () => {
      for (const event of ['error', 'close', 'end'] as const) {
        try {
          socket.removeListener(event, onPendingTransportFailure)
        } catch {
          transportAbandoned = true
        }
      }
    }

    const reject = () => {
      if (!authorizationPending) return
      authorizationPending = false
      rejectRelayUpgrade(socket)
      removePendingListeners()
    }

    let authorizationPromise: Promise<RelayTokenPayload | null>
    try {
      authorizationPromise = input.authorize(request)
    } catch {
      reject()
      return
    }

    void authorizationPromise
      .then((authorization) => {
        if (!authorizationPending) return
        if (
          transportAbandoned ||
          socket.destroyed ||
          !socket.writable
        ) {
          authorizationPending = false
          removePendingListeners()
          destroyRawSocketSafely(socket)
          return
        }
        if (!authorization) {
          reject()
          return
        }

        authorizedRequests.set(request, authorization)
        authorizationPending = false
        removePendingListeners()
        if (transportAbandoned) {
          authorizedRequests.delete(request)
          destroyRawSocketSafely(socket)
          return
        }

        try {
          input.acceptUpgrade(request, socket, head, (webSocket) => {
            if (
              !attachAcceptedWebSocketErrorHandler(
                webSocket,
                logTransportError,
              )
            ) {
              authorizedRequests.delete(request)
              return
            }
            try {
              input.emitConnection(webSocket, request)
            } catch {
              authorizedRequests.delete(request)
              terminateAcceptedWebSocketSafely(webSocket)
            }
          })
        } catch {
          authorizedRequests.delete(request)
          destroyRawSocketSafely(socket)
        }
      })
      .catch(() => {
        reject()
      })
  }

  return { handleUpgrade, takeAuthorization }
}
