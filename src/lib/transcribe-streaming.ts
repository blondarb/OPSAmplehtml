/**
 * Browser-side AWS Transcribe Medical Streaming client.
 *
 * Connects directly to AWS Transcribe via a pre-signed WebSocket URL,
 * captures PCM audio from the microphone, and streams transcript results
 * back in real-time. Uses the AWS event-stream binary protocol.
 */

// ---------------------------------------------------------------------------
// CRC32C (Castagnoli) — required for AWS event-stream framing
// ---------------------------------------------------------------------------

const CRC32C_TABLE = new Uint32Array(256)
;(function initCrc32cTable() {
  for (let i = 0; i < 256; i++) {
    let crc = i
    for (let j = 0; j < 8; j++) {
      crc = crc & 1 ? 0x82f63b78 ^ (crc >>> 1) : crc >>> 1
    }
    CRC32C_TABLE[i] = crc
  }
})()

function crc32c(data: Uint8Array, initial = 0xffffffff): number {
  let crc = initial
  for (let i = 0; i < data.length; i++) {
    crc = CRC32C_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

// ---------------------------------------------------------------------------
// Event-stream binary encoder / decoder
// ---------------------------------------------------------------------------

const TEXT_ENCODER = new TextEncoder()
const TEXT_DECODER = new TextDecoder()

function encodeHeaderString(name: string, value: string): Uint8Array {
  const nameBytes = TEXT_ENCODER.encode(name)
  const valueBytes = TEXT_ENCODER.encode(value)
  // 1 (name len) + name + 1 (type=7 string) + 2 (value len) + value
  const buf = new Uint8Array(1 + nameBytes.length + 1 + 2 + valueBytes.length)
  const view = new DataView(buf.buffer)
  let offset = 0
  buf[offset++] = nameBytes.length
  buf.set(nameBytes, offset); offset += nameBytes.length
  buf[offset++] = 7 // string type
  view.setUint16(offset, valueBytes.length, false); offset += 2
  buf.set(valueBytes, offset)
  return buf
}

function encodeEventStreamMessage(
  headers: Record<string, string>,
  payload: Uint8Array
): Uint8Array {
  // Encode headers
  const headerParts = Object.entries(headers).map(([k, v]) => encodeHeaderString(k, v))
  const headersLen = headerParts.reduce((sum, p) => sum + p.length, 0)
  const headerBytes = new Uint8Array(headersLen)
  let hOff = 0
  for (const part of headerParts) {
    headerBytes.set(part, hOff)
    hOff += part.length
  }

  // Total: prelude (8) + prelude CRC (4) + headers + payload + message CRC (4)
  const totalLen = 4 + 4 + 4 + headersLen + payload.length + 4
  const message = new Uint8Array(totalLen)
  const view = new DataView(message.buffer)

  // Prelude
  view.setUint32(0, totalLen, false)
  view.setUint32(4, headersLen, false)

  // Prelude CRC
  view.setUint32(8, crc32c(message.subarray(0, 8)), false)

  // Headers + payload
  message.set(headerBytes, 12)
  message.set(payload, 12 + headersLen)

  // Message CRC (over everything except the last 4 bytes)
  view.setUint32(totalLen - 4, crc32c(message.subarray(0, totalLen - 4)), false)

  return message
}

interface DecodedMessage {
  headers: Record<string, string>
  payload: Uint8Array
}

function decodeEventStreamMessage(data: Uint8Array): DecodedMessage {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
  const totalLen = view.getUint32(0, false)
  const headersLen = view.getUint32(4, false)

  // Decode headers
  const headers: Record<string, string> = {}
  let offset = 12 // after prelude (8) + prelude CRC (4)
  const headersEnd = 12 + headersLen

  while (offset < headersEnd) {
    const nameLen = data[offset++]
    const name = TEXT_DECODER.decode(data.subarray(offset, offset + nameLen))
    offset += nameLen
    const valueType = data[offset++]
    const valueLen = view.getUint16(offset, false)
    offset += 2
    if (valueType === 7) {
      // string
      headers[name] = TEXT_DECODER.decode(data.subarray(offset, offset + valueLen))
    } else {
      // binary or other — store as hex for debugging
      headers[name] = `[binary:${valueLen}]`
    }
    offset += valueLen
  }

  const payloadStart = 12 + headersLen
  const payloadEnd = totalLen - 4
  const payload = data.subarray(payloadStart, payloadEnd)

  return { headers, payload }
}

// ---------------------------------------------------------------------------
// Audio event encoding for AWS Transcribe
// ---------------------------------------------------------------------------

function encodeAudioEvent(pcmChunk: Uint8Array): Uint8Array {
  return encodeEventStreamMessage(
    {
      ':content-type': 'application/octet-stream',
      ':message-type': 'event',
      ':event-type': 'AudioEvent',
    },
    pcmChunk
  )
}

function encodeEmptyAudioEvent(): Uint8Array {
  return encodeEventStreamMessage(
    {
      ':content-type': 'application/octet-stream',
      ':message-type': 'event',
      ':event-type': 'AudioEvent',
    },
    new Uint8Array(0)
  )
}

// ---------------------------------------------------------------------------
// Transcript result parsing
// ---------------------------------------------------------------------------

interface TranscriptResult {
  ResultId: string
  IsPartial: boolean
  Alternatives: Array<{
    Transcript: string
    Items?: Array<{
      Content: string
      Type: string
      StartTime: number
      EndTime: number
    }>
  }>
}

interface TranscriptEvent {
  Transcript: {
    Results: TranscriptResult[]
  }
}

// ---------------------------------------------------------------------------
// TranscribeStreamManager — main class
// ---------------------------------------------------------------------------

export interface TranscribeStreamCallbacks {
  onInterimTranscript: (text: string) => void
  onFinalTranscript: (text: string) => void
  onError: (error: string) => void
  onStateChange: (state: 'connecting' | 'streaming' | 'closing' | 'closed' | 'error') => void
}

export class TranscribeStreamManager {
  private ws: WebSocket | null = null
  private audioContext: AudioContext | null = null
  private sourceNode: MediaStreamAudioSourceNode | null = null
  private processorNode: ScriptProcessorNode | null = null
  private mediaStream: MediaStream | null = null
  private callbacks: TranscribeStreamCallbacks
  private accumulatedFinal = ''
  private state: 'idle' | 'connecting' | 'streaming' | 'closing' | 'closed' | 'error' = 'idle'

  constructor(callbacks: TranscribeStreamCallbacks) {
    this.callbacks = callbacks
  }

  async start(): Promise<void> {
    if (this.state === 'streaming' || this.state === 'connecting') return

    try {
      this.state = 'connecting'
      this.callbacks.onStateChange('connecting')
      this.accumulatedFinal = ''

      // Get microphone
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: { ideal: 16000 },
          echoCancellation: true,
          noiseSuppression: true,
        },
      })

      // Set up AudioContext for PCM capture
      this.audioContext = new AudioContext({ sampleRate: 16000 })
      const actualSampleRate = this.audioContext.sampleRate

      // Get pre-signed URL from server
      const urlResponse = await fetch('/api/ai/transcribe-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sampleRate: actualSampleRate }),
      })

      if (!urlResponse.ok) {
        const err = await urlResponse.json()
        throw new Error(err.error || 'Failed to get transcription URL')
      }

      const { url } = await urlResponse.json()

      // Connect WebSocket
      this.ws = new WebSocket(url)
      this.ws.binaryType = 'arraybuffer'

      this.ws.onopen = () => {
        this.state = 'streaming'
        this.callbacks.onStateChange('streaming')
        this.startAudioCapture()
      }

      this.ws.onmessage = (event) => {
        this.handleMessage(event.data as ArrayBuffer)
      }

      this.ws.onerror = () => {
        this.callbacks.onError('WebSocket connection error')
        this.cleanup('error')
      }

      this.ws.onclose = (event) => {
        if (this.state === 'streaming') {
          // Unexpected close
          console.warn('Transcribe WebSocket closed:', event.code, event.reason)
        }
        this.cleanup('closed')
      }
    } catch (error: any) {
      console.error('Transcribe streaming start error:', error)
      this.callbacks.onError(error.message || 'Failed to start streaming transcription')
      this.cleanup('error')
    }
  }

  stop(): void {
    if (this.state !== 'streaming') {
      this.cleanup('closed')
      return
    }

    this.state = 'closing'
    this.callbacks.onStateChange('closing')

    // Stop audio capture
    this.stopAudioCapture()

    // Send empty audio event to signal end of stream
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(encodeEmptyAudioEvent())
      } catch {
        // Ignore send errors during close
      }
      // Close WebSocket after a brief delay to let final results arrive
      setTimeout(() => {
        if (this.ws && this.ws.readyState !== WebSocket.CLOSED) {
          this.ws.close(1000, 'Stream ended')
        }
        this.cleanup('closed')
      }, 1500)
    } else {
      this.cleanup('closed')
    }
  }

  getAccumulatedTranscript(): string {
    return this.accumulatedFinal.trim()
  }

  private startAudioCapture(): void {
    if (!this.audioContext || !this.mediaStream) return

    this.sourceNode = this.audioContext.createMediaStreamSource(this.mediaStream)
    // Buffer size 4096 at 16kHz = ~256ms chunks
    this.processorNode = this.audioContext.createScriptProcessor(4096, 1, 1)

    this.processorNode.onaudioprocess = (event) => {
      if (this.state !== 'streaming' || !this.ws || this.ws.readyState !== WebSocket.OPEN) return

      const float32 = event.inputBuffer.getChannelData(0)
      // Convert float32 [-1, 1] to signed int16 PCM
      const int16 = new Int16Array(float32.length)
      for (let i = 0; i < float32.length; i++) {
        const s = Math.max(-1, Math.min(1, float32[i]))
        int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff
      }

      const encoded = encodeAudioEvent(new Uint8Array(int16.buffer))
      try {
        this.ws!.send(encoded)
      } catch {
        // WebSocket might be closing
      }
    }

    this.sourceNode.connect(this.processorNode)
    this.processorNode.connect(this.audioContext.destination)
  }

  private stopAudioCapture(): void {
    if (this.processorNode) {
      this.processorNode.disconnect()
      this.processorNode = null
    }
    if (this.sourceNode) {
      this.sourceNode.disconnect()
      this.sourceNode = null
    }
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((t) => t.stop())
      this.mediaStream = null
    }
  }

  private handleMessage(data: ArrayBuffer): void {
    try {
      const message = decodeEventStreamMessage(new Uint8Array(data))
      const messageType = message.headers[':message-type']

      if (messageType === 'exception') {
        const errorPayload = TEXT_DECODER.decode(message.payload)
        console.error('Transcribe exception:', message.headers[':exception-type'], errorPayload)
        this.callbacks.onError(`Transcription error: ${message.headers[':exception-type']}`)
        return
      }

      if (messageType === 'event' && message.headers[':event-type'] === 'TranscriptEvent') {
        const event: TranscriptEvent = JSON.parse(TEXT_DECODER.decode(message.payload))
        this.processTranscriptEvent(event)
      }
    } catch (error) {
      console.error('Error processing Transcribe message:', error)
    }
  }

  private processTranscriptEvent(event: TranscriptEvent): void {
    for (const result of event.Transcript.Results) {
      if (!result.Alternatives || result.Alternatives.length === 0) continue

      const transcript = result.Alternatives[0].Transcript

      if (result.IsPartial) {
        // Interim result — show as preview
        this.callbacks.onInterimTranscript(this.accumulatedFinal + transcript)
      } else {
        // Final result — accumulate
        this.accumulatedFinal += transcript + ' '
        this.callbacks.onFinalTranscript(this.accumulatedFinal.trim())
      }
    }
  }

  private cleanup(finalState: 'closed' | 'error'): void {
    this.stopAudioCapture()
    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close().catch(() => {})
      this.audioContext = null
    }
    if (this.ws) {
      if (this.ws.readyState !== WebSocket.CLOSED && this.ws.readyState !== WebSocket.CLOSING) {
        this.ws.close()
      }
      this.ws = null
    }
    this.state = finalState === 'error' ? 'error' : 'idle'
    this.callbacks.onStateChange(finalState)
  }
}
