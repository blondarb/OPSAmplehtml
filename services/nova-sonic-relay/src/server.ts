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
      send(ws, { t: 'aiSpeechStart' })
    }
  }

  function stopAiSpeech(): void {
    if (aiSpeaking) {
      aiSpeaking = false
      send(ws, { t: 'aiSpeechStop' })
    }
  }

  const session = new NovaSonicSession({
    onTextOutput(role, content) {
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
      let input: unknown = content
      try {
        input = JSON.parse(content)
      } catch {
        // content is not JSON — pass through as a raw string
      }
      send(ws, { t: 'toolCall', toolName, toolUseId, input })
    },

    onCompletionEnd() {
      stopAiSpeech()
      send(ws, { t: 'completion' })
    },

    onBargeIn() {
      stopAiSpeech()
      send(ws, { t: 'bargeIn' })
    },

    onError(err) {
      const message = err instanceof Error ? err.message : String(err)
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
          session.pushToolResult(msg.toolUseId, msg.output)
          break

        case 'systemText':
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
