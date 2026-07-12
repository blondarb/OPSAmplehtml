import http from 'http'
import type { Duplex } from 'node:stream'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { WebSocketServer, WebSocket } from 'ws'
import { NovaSonicSession } from './novaSonicSession.js'
import { RelaySessionPolicy } from './relaySessionPolicy.js'
import { createDynamoRelayReplayStore } from './relayReplayStore.js'
import {
  createRelayUpgradeAuthorizer,
  createRelayUpgradeController,
} from './relayUpgrade.js'
import type { ClientMsg, RelayStartConfig, ServerMsg } from './wsProtocol.js'

// ---------------------------------------------------------------------------
// HTTP server — answers GET /healthz for the ALB health check; 404 otherwise.
// This handler only ever sees plain HTTP requests (GET /healthz or a 404) —
// the WS auth gate below hooks the asynchronous `upgrade` path and never
// touches this function, so /healthz stays
// unauthenticated for the ALB health check.
// ---------------------------------------------------------------------------

const server = http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/healthz') {
    res.writeHead(200, { 'Content-Type': 'text/plain' })
    res.end('ok')
    return
  }
  res.writeHead(404)
  res.end()
})

// ---------------------------------------------------------------------------
// WebSocket upgrade authentication
//
// Browsers cannot set custom headers on a WebSocket handshake, so the caller
// (src/app/api/ai/historian/session/route.ts in the Next.js app) mints a
// short-lived HMAC token and the browser sends it as a WS SUBPROTOCOL
// alongside the fixed 'nova.v1' tag: `Sec-WebSocket-Protocol: nova.v1, <token>`.
//
// The token's HMAC-signed payload carries both `exp` and the SHA-256 digest of
// the exact server-approved start configuration plus a one-use UUID. Before
// the 101 handshake, the asynchronous upgrade gate verifies the HMAC/expiry,
// enforces the exact Origin and protocol shape, and atomically consumes the
// UUID. The connection's RelaySessionPolicy then recomputes and timing-safe-
// compares the start-frame digest before Bedrock is opened. handleProtocols
// only echoes 'nova.v1' after authorization succeeds.
//
// FAIL CLOSED: if NOVA_RELAY_SHARED_SECRET is not configured, every
// connection is rejected. There is no "auth disabled" mode.
// ---------------------------------------------------------------------------

const NOVA_PROTOCOL = 'nova.v1'

const PRIMARY_SHARED_SECRET = process.env.NOVA_RELAY_SHARED_SECRET || ''
const SECONDARY_SHARED_SECRET =
  process.env.NOVA_RELAY_SECONDARY_SHARED_SECRET || ''
if (!PRIMARY_SHARED_SECRET) {
  console.warn(
    '[nova-relay] NOVA_RELAY_SHARED_SECRET is not set — rejecting ALL WebSocket connections (fail closed).'
  )
}

const ALLOWED_ORIGINS = (process.env.NOVA_RELAY_ALLOWED_ORIGINS || '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean)

if (ALLOWED_ORIGINS.length === 0) {
  console.warn(
    '[nova-relay] NOVA_RELAY_ALLOWED_ORIGINS is not set — rejecting ALL WebSocket connections (fail closed).'
  )
}

const REPLAY_TABLE = process.env.NOVA_RELAY_REPLAY_TABLE || ''
if (!REPLAY_TABLE) {
  console.warn(
    '[nova-relay] NOVA_RELAY_REPLAY_TABLE is not set — rejecting ALL WebSocket connections (fail closed).',
  )
}
const replayStore = REPLAY_TABLE
  ? createDynamoRelayReplayStore({
      client: new DynamoDBClient({
        region:
          process.env.AWS_REGION ||
          process.env.NOVA_SONIC_REGION ||
          'us-east-1',
      }),
      tableName: REPLAY_TABLE,
    })
  : null

// ---------------------------------------------------------------------------
// WebSocket server
// ---------------------------------------------------------------------------

// maxPayload caps a single inbound frame (untrusted browser input). Audio
// frames are small base64 PCM; 1 MB leaves ample headroom for instructions /
// tool results while preventing unbounded allocation from a hostile client.
//
// The asynchronous upgrade handler and handleProtocols gate the upgrade itself —
// only a request with a valid one-use token and an exact allowed Origin ever
// reaches the 'connection' handler below.
const wss = new WebSocketServer({
  noServer: true,
  maxPayload: 1024 * 1024,
  handleProtocols: (protocols) => (protocols.has(NOVA_PROTOCOL) ? NOVA_PROTOCOL : false),
})

const authorizeUpgrade = createRelayUpgradeAuthorizer({
  primarySecret: PRIMARY_SHARED_SECRET,
  secondarySecret: SECONDARY_SHARED_SECRET,
  allowedOrigins: ALLOWED_ORIGINS,
  replayStore,
})
const upgradeController = createRelayUpgradeController<Duplex, WebSocket>({
  authorize: authorizeUpgrade,
  acceptUpgrade: (request, socket, head, accepted) => {
    wss.handleUpgrade(request, socket, head, accepted)
  },
  emitConnection: (webSocket, request) => {
    wss.emit('connection', webSocket, request)
  },
  logTransportError: (message) => console.error(message),
})
server.on('upgrade', upgradeController.handleUpgrade)

function send(ws: WebSocket, msg: ServerMsg): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg))
  }
}

// Opt-in event-flow trace (RELAY_TRACE=1) for diagnosing stalls. No-op unless set.
const TRACE: (m: string) => void = process.env.RELAY_TRACE
  ? (m: string) => console.log(`[trace ${new Date().toISOString().slice(11, 23)}] ${m}`)
  : () => {}

wss.on('connection', (ws, request) => {
  const authorization = upgradeController.takeAuthorization(request)
  if (!authorization) {
    send(ws, { t: 'error', message: 'missing verified relay authorization' })
    ws.close(1008, 'missing verified relay authorization')
    return
  }
  const policy = new RelaySessionPolicy(authorization.configDigest)

  // Track whether the AI is currently speaking so we can wrap turns with
  // aiSpeechStart / aiSpeechStop. This is an approximation: we emit
  // aiSpeechStart on the first audio chunk after silence, and aiSpeechStop on
  // completionEnd or bargeIn. A precise turn model would require richer signals
  // from the model, but this is sufficient for rendering and barge-in UX.
  let aiSpeaking = false

  function startAiSpeech(): void {
    if (!aiSpeaking) {
      aiSpeaking = true
      TRACE('-> aiSpeechStart')
      send(ws, { t: 'aiSpeechStart' })
    }
  }

  function stopAiSpeech(): void {
    if (aiSpeaking) {
      aiSpeaking = false
      TRACE('-> aiSpeechStop')
      send(ws, { t: 'aiSpeechStop' })
    }
  }

  const session = new NovaSonicSession({
    onTextOutput(role, content) {
      TRACE('-> text')
      if (role.toUpperCase() === 'USER') {
        send(ws, { t: 'userTranscript', text: content })
      } else {
        send(ws, { t: 'assistantTranscript', text: content })
      }
    },

    onAudioOutput(base64) {
      startAiSpeech()
      send(ws, { t: 'audio', pcm: base64 })
    },

    onToolUse({ toolName, toolUseId, content }) {
      TRACE('-> toolUse')
      let input: unknown = content
      try {
        input = JSON.parse(content)
      } catch {
        // content is not JSON — pass through as a raw string
      }
      send(ws, { t: 'toolCall', toolName, toolUseId, input })
    },

    onCompletionEnd() {
      TRACE('-> completionEnd')
      stopAiSpeech()
      send(ws, { t: 'completion' })
    },

    onBargeIn() {
      TRACE('-> bargeIn')
      stopAiSpeech()
      send(ws, { t: 'bargeIn' })
    },

    onError(err) {
      // Preserve a useful browser error while logging only a constrained error
      // class. Service error messages and objects may contain clinical content.
      const anyErr = err as { name?: string; message?: string } | null
      let message: string
      if (err instanceof Error) {
        message = err.message
      } else if (anyErr && typeof anyErr === 'object' && (anyErr.message || anyErr.name)) {
        message = [anyErr.name, anyErr.message].filter(Boolean).join(': ')
      } else {
        try { message = JSON.stringify(err) } catch { message = String(err) }
      }
      const rawErrorKind = err instanceof Error ? err.name : anyErr?.name
      const errorKind =
        typeof rawErrorKind === 'string' &&
        /^[A-Za-z][A-Za-z0-9_.-]{0,79}$/.test(rawErrorKind)
          ? rawErrorKind
          : 'unknown'
      console.error(`[nova-session] stream error kind=${errorKind}`)
      send(ws, { t: 'error', message })
    },
  })

  ws.on('message', (raw) => {
    let msg: ClientMsg
    try {
      msg = JSON.parse(raw.toString()) as ClientMsg
    } catch {
      send(ws, { t: 'error', message: 'bad message' })
      return
    }

    try {
      switch (msg.t) {
        case 'start':
          TRACE(`<- start (tools=${(msg.tools as unknown[] | undefined)?.length ?? 0})`)
          {
            const startConfig: RelayStartConfig = {
              instructions: msg.instructions,
              tools: msg.tools,
              voiceId: msg.voiceId,
              sessionType: msg.sessionType,
            }
            const decision = policy.authorizeStart(startConfig)
            if (!decision.ok) {
              console.warn(`[nova-relay] rejected ${decision.code}`)
              send(ws, { t: 'error', message: decision.message })
              ws.close(1008, decision.message)
              return
            }
          }
          // start() surfaces any stream-open failure via the session's onError
          // callback (mapped to {t:'error'} above). This .catch only prevents an
          // unhandled rejection from the un-awaited promise — it must NOT send a
          // second error, or the browser receives the same failure twice.
          session
            .start(msg.instructions, msg.tools as Parameters<typeof session.start>[1], msg.voiceId)
            .catch(() => {})
          break

        case 'audio':
          session.pushAudio(msg.pcm)
          break

        case 'userTurnEnd':
          // Nova Sonic performs its own turn detection; userTurnEnd is reserved
          // for future explicit VAD signaling. No-op for now.
          break

        case 'toolResult':
          TRACE('<- toolResult')
          session.pushToolResult(msg.toolUseId, msg.output)
          break

        case 'systemText':
          {
            const decision = policy.authorizeSystemText()
            console.warn(`[nova-relay] rejected ${decision.ok ? 'system_text' : decision.code}`)
            if (!decision.ok) {
              send(ws, { t: 'error', message: decision.message })
              ws.close(1008, decision.message)
            }
          }
          break

        case 'stop':
          session.stop().then(() => {
            ws.close()
          }).catch(() => {
            ws.close()
          })
          break

        default: {
          // Exhaustive check — TypeScript will catch unhandled variants at
          // compile time; at runtime guard against malformed messages.
          const t = (msg as { t: string }).t
          send(ws, { t: 'error', message: `unknown message type: ${t}` })
        }
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      send(ws, { t: 'error', message })
    }
  })

  ws.on('close', () => {
    // Best-effort teardown — ignore any errors from stop().
    session.stop().catch(() => {})
  })
})

// ---------------------------------------------------------------------------
// Start listening
// ---------------------------------------------------------------------------

const PORT = Number(process.env.PORT) || 8081
// Bind explicitly to 0.0.0.0 (IPv4). Node's default `listen(PORT)` binds the
// IPv6 unspecified address (::), which the ECS/ALB IPv4 health check
// cannot reach in its container network — the app runs but the deploy fails
// the health check with no application logs. Explicit IPv4 bind fixes it.
server.listen(PORT, '0.0.0.0', () => {
  console.log(`relay on port ${PORT}`)
})
