/**
 * Frame probe — drives a LOCAL relay with real synthesized speech and records
 * every ServerMsg frame with timestamps, to diagnose transcript emission
 * patterns (e.g. the duplicate-transcript bug on /rnd/clara).
 *
 * Unlike smoke.mjs (silence only, pre-auth), this:
 *   - mints the HMAC subprotocol token the relay's verifyClient requires
 *   - streams one or more real speech WAV files (16 kHz mono PCM16) at
 *     real-time pace, with continuous silence between/after — like a live mic
 *   - logs every received frame as JSONL for offline analysis
 *
 * Usage:
 *   NOVA_RELAY_SHARED_SECRET=localtest node scripts/frame-probe.mjs \
 *     --wav caller1.wav --wav caller2.wav --gap 22 --tail 25 --out frames.jsonl
 *
 * Pair with a relay started as:
 *   NOVA_RELAY_SHARED_SECRET=localtest RELAY_TRACE=1 RELAY_TRACE_RAW=1 \
 *   AWS_PROFILE=sevaro-sandbox npm run dev
 */

import crypto from 'crypto'
import fs from 'fs'
import WebSocket from 'ws'

const args = process.argv.slice(2)
function argAll(name) {
  const out = []
  for (let i = 0; i < args.length; i++) if (args[i] === `--${name}`) out.push(args[i + 1])
  return out
}
function argOne(name, dflt) {
  const all = argAll(name)
  return all.length ? all[all.length - 1] : dflt
}

const WAVS = argAll('wav')
const GAP_S = Number(argOne('gap', '22'))   // silence between utterances (AI replies here)
const TAIL_S = Number(argOne('tail', '25')) // silence after last utterance
const OUT = argOne('out', 'frames.jsonl')
const PORT = argOne('port', process.env.PORT ?? '8082')
// --url wss://relay.example.com overrides the local default — lets the probe
// verify a DEPLOYED relay end-to-end (requires that relay's shared secret in
// NOVA_RELAY_SHARED_SECRET to mint a valid token).
const RELAY_URL = argOne('url', `ws://localhost:${PORT}`)
const SECRET = process.env.NOVA_RELAY_SHARED_SECRET || 'localtest'
const INSTRUCTIONS = argOne(
  'instructions',
  'You are Clara, a warm phone triage operator for a neurology consult line. ' +
    'Greet the caller briefly, then ask one short follow-up question at a time. ' +
    'Keep every reply to one or two short sentences.',
)

if (WAVS.length === 0) {
  console.error('need at least one --wav <16kHz mono PCM16 wav>')
  process.exit(1)
}

// ── WAV reader: find the data chunk, return raw PCM bytes ──────────────────
function readWavPcm(path) {
  const buf = fs.readFileSync(path)
  if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error(`${path}: not a RIFF/WAVE file`)
  }
  let off = 12
  while (off + 8 <= buf.length) {
    const id = buf.toString('ascii', off, off + 4)
    const size = buf.readUInt32LE(off + 4)
    if (id === 'fmt ') {
      const rate = buf.readUInt32LE(off + 12)
      const ch = buf.readUInt16LE(off + 10)
      const bits = buf.readUInt16LE(off + 22)
      if (rate !== 16000 || ch !== 1 || bits !== 16) {
        throw new Error(`${path}: need 16kHz mono 16-bit, got ${rate}Hz ${ch}ch ${bits}bit`)
      }
    }
    if (id === 'data') return buf.subarray(off + 8, off + 8 + size)
    off += 8 + size + (size % 2)
  }
  throw new Error(`${path}: no data chunk`)
}

// ── Token minting — must match server.ts isValidToken byte-for-byte ────────
function b64url(buf) {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
function mintToken(secret, ttlS = 600) {
  const payload = b64url(Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + ttlS })))
  const sig = b64url(crypto.createHmac('sha256', secret).update(payload).digest())
  return `${payload}.${sig}`
}

// ── Frame log ───────────────────────────────────────────────────────────────
const t0 = Date.now()
const outStream = fs.createWriteStream(OUT)
function logFrame(obj) {
  outStream.write(JSON.stringify({ tMs: Date.now() - t0, ...obj }) + '\n')
}

// --origin: required when the target relay sets NOVA_RELAY_ALLOWED_ORIGINS —
// its verifyClient checks the Origin header, which non-browser WS clients
// don't send by default.
const ORIGIN = argOne('origin', '')
const ws = new WebSocket(RELAY_URL, ['nova.v1', mintToken(SECRET)], ORIGIN ? { headers: { Origin: ORIGIN } } : undefined)

const CHUNK_MS = 100
const CHUNK_BYTES = (16000 * 2 * CHUNK_MS) / 1000 // 3200
const silenceChunk = Buffer.alloc(CHUNK_BYTES, 0).toString('base64')

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

async function streamSilence(seconds) {
  const n = Math.round((seconds * 1000) / CHUNK_MS)
  for (let i = 0; i < n; i++) {
    if (ws.readyState !== WebSocket.OPEN) return
    ws.send(JSON.stringify({ t: 'audio', pcm: silenceChunk }))
    await sleep(CHUNK_MS)
  }
}

async function streamWav(path) {
  const pcm = readWavPcm(path)
  console.log(`streaming ${path} (${(pcm.length / 32000).toFixed(1)}s of speech)`)
  logFrame({ probe: 'utteranceStart', path })
  for (let off = 0; off < pcm.length; off += CHUNK_BYTES) {
    if (ws.readyState !== WebSocket.OPEN) return
    const chunk = pcm.subarray(off, off + CHUNK_BYTES)
    ws.send(JSON.stringify({ t: 'audio', pcm: Buffer.from(chunk).toString('base64') }))
    await sleep(CHUNK_MS)
  }
  logFrame({ probe: 'utteranceEnd', path })
}

ws.on('open', async () => {
  console.log(`connected to ${RELAY_URL} — logging frames to ${OUT}`)
  ws.send(JSON.stringify({ t: 'start', instructions: INSTRUCTIONS, tools: [] }))

  await streamSilence(1)
  for (let i = 0; i < WAVS.length; i++) {
    await streamWav(WAVS[i])
    await streamSilence(i === WAVS.length - 1 ? TAIL_S : GAP_S)
  }

  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ t: 'stop' }))
  await sleep(1000)
  outStream.end()
  console.log('probe complete')
  process.exit(0)
})

ws.on('message', (raw) => {
  let msg
  try {
    msg = JSON.parse(raw.toString())
  } catch {
    logFrame({ unparseable: raw.toString().slice(0, 200) })
    return
  }
  if (msg.t === 'audio') {
    logFrame({ t: 'audio', b64len: msg.pcm?.length ?? 0 })
  } else {
    logFrame(msg)
    console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s]`, JSON.stringify(msg).slice(0, 160))
  }
})

ws.on('close', (code) => {
  console.log(`ws closed (${code})`)
  logFrame({ probe: 'wsClose', code })
})
ws.on('error', (err) => {
  console.error('ws error:', err.message)
  logFrame({ probe: 'wsError', message: err.message })
})
