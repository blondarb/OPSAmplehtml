import http from 'http'
import { WebSocketServer, WebSocket } from 'ws'
import { NovaSonicSession } from './novaSonicSession.js'
import type { ClientMsg, ServerMsg } from './wsProtocol.js'

// ---------------------------------------------------------------------------
// HTTP server — answers GET /healthz for App Runner health checks; 404 otherwise.
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
// WebSocket server
// ---------------------------------------------------------------------------

// maxPayload caps a single inbound frame (untrusted browser input). Audio
// frames are small base64 PCM; 1 MB leaves ample headroom for instructions /
// tool results while preventing unbounded allocation from a hostile client.
const wss = new WebSocketServer({ server, maxPayload: 1024 * 1024 })

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
server.listen(PORT, () => {
  console.log(`relay on port ${PORT}`)
})
