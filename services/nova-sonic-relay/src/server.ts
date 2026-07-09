import crypto from 'crypto'
import http, { type IncomingMessage } from 'http'
import { WebSocketServer, WebSocket } from 'ws'
import { NovaSonicSession } from './novaSonicSession.js'
import type { ClientMsg, ServerMsg } from './wsProtocol.js'

// ---------------------------------------------------------------------------
// HTTP server — answers GET /healthz for App Runner health checks; 404 otherwise.
// This handler only ever sees plain HTTP requests (GET /healthz or a 404) —
// the WS auth gate below hooks the `upgrade` path via verifyClient/
// handleProtocols and never touches this function, so /healthz stays
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
// Token format: `${base64url(JSON.stringify({exp}))}.${base64url(HMAC_SHA256(secret, payload))}`.
// verifyClient recomputes the HMAC (timing-safe compare) and checks `exp`
// BEFORE the 101 handshake completes; handleProtocols only echoes back
// 'nova.v1' once verifyClient has already accepted the request — ws never
// calls handleProtocols after verifyClient rejects (aborts with 401 first).
//
// FAIL CLOSED: if NOVA_RELAY_SHARED_SECRET is not configured, every
// connection is rejected. There is no "auth disabled" mode.
// ---------------------------------------------------------------------------

const NOVA_PROTOCOL = 'nova.v1'

const SHARED_SECRET = process.env.NOVA_RELAY_SHARED_SECRET || ''
if (!SHARED_SECRET) {
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
    '[nova-relay] NOVA_RELAY_ALLOWED_ORIGINS is not set — Origin header is not checked; the token is the sole gate.'
  )
}

function base64urlToBuffer(input: string): Buffer {
  return Buffer.from(input.replace(/-/g, '+').replace(/_/g, '/'), 'base64')
}

function bufferToBase64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/**
 * Validate a relay auth token against `secret`. Recomputes the HMAC over the
 * payload (timing-safe compare against the supplied signature), then checks
 * the embedded `exp` (unix seconds) is still in the future. See the header
 * comment above for the exact token format — it must match the minting logic
 * in the historian session route byte-for-byte.
 */
function isValidToken(token: string, secret: string): boolean {
  const dot = token.indexOf('.')
  if (dot <= 0 || dot === token.length - 1) return false
  const payloadB64 = token.slice(0, dot)
  const sig = token.slice(dot + 1)

  const expectedSig = bufferToBase64url(
    crypto.createHmac('sha256', secret).update(payloadB64).digest()
  )
  const sigBuf = Buffer.from(sig)
  const expectedBuf = Buffer.from(expectedSig)
  // timingSafeEqual throws on length mismatch — guard first, and a length
  // mismatch is itself decisive proof the signature is wrong.
  if (sigBuf.length !== expectedBuf.length) return false
  if (!crypto.timingSafeEqual(sigBuf, expectedBuf)) return false

  let payload: { exp?: unknown }
  try {
    payload = JSON.parse(base64urlToBuffer(payloadB64).toString('utf8'))
  } catch {
    return false
  }
  return typeof payload.exp === 'number' && payload.exp > Date.now() / 1000
}

/** Parse the raw `Sec-WebSocket-Protocol` header into its comma-separated values. */
function parseRequestedProtocols(req: IncomingMessage): string[] {
  const header = req.headers['sec-websocket-protocol']
  if (!header) return []
  return header.split(',').map((p) => p.trim()).filter(Boolean)
}

/**
 * Gate the WS upgrade: reject (401, no 101 handshake) unless a secret is
 * configured, the Origin is allowed (when an allowlist is set), and the
 * client supplied a valid, unexpired token as one of its subprotocols.
 */
function verifyClient(info: { origin: string; secure: boolean; req: IncomingMessage }): boolean {
  if (!SHARED_SECRET) return false // fail closed — no secret configured

  if (ALLOWED_ORIGINS.length > 0 && !ALLOWED_ORIGINS.includes(info.origin)) {
    console.warn(`[nova-relay] rejected connection: disallowed origin (${info.origin || '(none)'})`)
    return false
  }

  const protocols = parseRequestedProtocols(info.req)
  const token = protocols.find((p) => p !== NOVA_PROTOCOL)
  if (!token || !isValidToken(token, SHARED_SECRET)) {
    console.warn('[nova-relay] rejected connection: missing/invalid/expired token')
    return false
  }

  return true
}

// ---------------------------------------------------------------------------
// WebSocket server
// ---------------------------------------------------------------------------

// maxPayload caps a single inbound frame (untrusted browser input). Audio
// frames are small base64 PCM; 1 MB leaves ample headroom for instructions /
// tool results while preventing unbounded allocation from a hostile client.
//
// verifyClient/handleProtocols gate the upgrade itself (see block above) —
// only a request with a valid token (and an allowed Origin, if configured)
// ever reaches the 'connection' handler below.
const wss = new WebSocketServer({
  server,
  maxPayload: 1024 * 1024,
  verifyClient,
  handleProtocols: (protocols) => (protocols.has(NOVA_PROTOCOL) ? NOVA_PROTOCOL : false),
})

function send(ws: WebSocket, msg: ServerMsg): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg))
  }
}

// Opt-in event-flow trace (RELAY_TRACE=1) for diagnosing stalls. No-op unless set.
const TRACE: (m: string) => void = process.env.RELAY_TRACE
  ? (m: string) => console.log(`[trace ${new Date().toISOString().slice(11, 23)}] ${m}`)
  : () => {}

wss.on('connection', (ws) => {
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
      TRACE(`-> text[${role}] ${JSON.stringify(content.slice(0, 60))}`)
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
      TRACE(`-> toolUse ${toolName} id=${toolUseId} content=${JSON.stringify(String(content).slice(0, 80))}`)
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
      // Nova's bidi exceptions (modelStreamErrorException / internalServerException)
      // arrive as PLAIN OBJECTS, so a bare String(err) collapses to "[object
      // Object]" and the real cause is lost. Extract a meaningful message and log
      // the full error server-side so the relay log captures the actual failure.
      const anyErr = err as { name?: string; message?: string } | null
      let message: string
      if (err instanceof Error) {
        message = err.message
      } else if (anyErr && typeof anyErr === 'object' && (anyErr.message || anyErr.name)) {
        message = [anyErr.name, anyErr.message].filter(Boolean).join(': ')
      } else {
        try { message = JSON.stringify(err) } catch { message = String(err) }
      }
      console.error('[nova-session] stream error:', message, err)
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

    if (msg.t !== 'audio') TRACE(`<- ${msg.t}`)

    try {
      switch (msg.t) {
        case 'start':
          TRACE(`<- start (tools=${(msg.tools as unknown[] | undefined)?.length ?? 0})`)
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
          TRACE(`<- toolResult id=${msg.toolUseId} output=${JSON.stringify(String(msg.output).slice(0, 80))}`)
          session.pushToolResult(msg.toolUseId, msg.output)
          break

        case 'systemText':
          TRACE(`<- systemText (injected as USER) ${JSON.stringify(msg.text.slice(0, 80))}`)
          session.pushSystemText(msg.text)
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
// IPv6 unspecified address (::), which App Runner's IPv4 TCP health check
// cannot reach in its container network — the app runs but the deploy fails
// the health check with no application logs. Explicit IPv4 bind fixes it.
server.listen(PORT, '0.0.0.0', () => {
  console.log(`relay on port ${PORT}`)
})
