/**
 * Voice steel-man — drives the REAL Clara voice agent end-to-end to test
 * CONVERSATIONAL behavior (re-asking, irrelevant questions), which the classifier
 * probe can't see.
 *
 * Flow: auth to the gate → POST /api/ai/clara/session for the DEPLOYED
 * CLARA_VOICE_INSTRUCTIONS + relay token → connect to the live Nova relay →
 * let Clara greet → stream scripted synthesized caller utterances (16k WAV) with
 * generous pacing so Clara can respond between → log the full transcript.
 *
 * Usage:
 *   node voice-steelman.mjs --scenario <name> --wav u1.wav --wav u2.wav [--gap 22] [--lead 5]
 * Prints the interleaved transcript and writes it to <scenario>-transcript.jsonl.
 *
 * PHASE 3 emulation (default ON, disable with --no-phase3): mirrors the browser
 * client's MRN cross-check exactly — runs the SAME mrnCrosscheck module the
 * hook uses (imported as .ts via Node ≥23.6 native type-stripping) over the
 * nova + medical transcript frames, and on a settled disagreement injects the
 * same `{t:'systemText'}` read-back nudge the client would. --force-mismatch
 * deterministically injects ONE synthetic nudge on the first extracted MRN
 * (last digit rotated) to exercise the nudge→read-back path even when both
 * ASRs agree; organic nudge SENDING is suppressed in that mode (verdicts still
 * log).
 */
import crypto from 'crypto'
import fs from 'fs'
import WebSocket from 'ws'
import {
  buildReadbackNudgeText,
  createMrnCrosscheck,
  extractDigitCandidates,
} from '../../../src/lib/clara/mrnCrosscheck.ts'

const args = process.argv.slice(2)
const argAll = (n) => args.reduce((a, v, i) => (args[i] === `--${n}` ? [...a, args[i + 1]] : a), [])
const argOne = (n, d) => { const a = argAll(n); return a.length ? a[a.length - 1] : d }

const SCENARIO = argOne('scenario', 'scn')
const WAVS = argAll('wav')
const GAP_S = Number(argOne('gap', '22'))
const LEAD_S = Number(argOne('lead', '5'))     // silence before first utterance (Clara greets here)
const TAIL_S = Number(argOne('tail', '18'))
const PHASE3 = !args.includes('--no-phase3')
const FORCE_MISMATCH = args.includes('--force-mismatch')
const BASE = 'https://app.neuroplans.app'
const ORIGIN = 'https://app.neuroplans.app'
const PW = process.env.CLARA_PW

if (!PW) { console.error('set CLARA_PW'); process.exit(1) }
if (!WAVS.length) { console.error('need --wav'); process.exit(1) }

function readWavPcm(path) {
  const buf = fs.readFileSync(path)
  let off = 12
  while (off + 8 <= buf.length) {
    const id = buf.toString('ascii', off, off + 4)
    const size = buf.readUInt32LE(off + 4)
    if (id === 'data') return buf.subarray(off + 8, off + 8 + size)
    off += 8 + size + (size % 2)
  }
  throw new Error(`${path}: no data chunk`)
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function main() {
  // 1. auth
  const authRes = await fetch(`${BASE}/api/ai/clara/auth`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: PW }),
  })
  const cookie = (authRes.headers.get('set-cookie') || '').split(',').map((c) => c.split(';')[0].trim()).filter((c) => c.includes('clara')).join('; ')
  if (!cookie) throw new Error(`auth failed ${authRes.status}`)

  // 2. real session: deployed instructions + relay token
  const sess = await (await fetch(`${BASE}/api/ai/clara/session`, { method: 'POST', headers: { Cookie: cookie } })).json()
  if (!sess.relayUrl || !sess.instructions) throw new Error(`session route incomplete: ${JSON.stringify(sess).slice(0, 200)}`)

  // 3. connect to the live relay with the REAL instructions
  const ws = new WebSocket(sess.relayUrl, ['nova.v1', sess.relayToken], { headers: { Origin: ORIGIN } })
  const t0 = Date.now()
  const out = fs.createWriteStream(`${SCENARIO}-transcript.jsonl`)
  const log = (o) => out.write(JSON.stringify({ tMs: Date.now() - t0, ...o }) + '\n')

  const CHUNK_MS = 100, CHUNK_BYTES = 3200
  const silence = Buffer.alloc(CHUNK_BYTES, 0).toString('base64')
  const streamSilence = async (s) => { for (let i = 0; i < Math.round(s * 1000 / CHUNK_MS); i++) { if (ws.readyState !== 1) return; ws.send(JSON.stringify({ t: 'audio', pcm: silence })); await sleep(CHUNK_MS) } }
  const streamWav = async (p) => {
    const pcm = readWavPcm(p)
    console.log(`   [caller streams ${p.split('/').pop()} — ${(pcm.length / 32000).toFixed(1)}s]`)
    for (let o = 0; o < pcm.length; o += CHUNK_BYTES) { if (ws.readyState !== 1) return; ws.send(JSON.stringify({ t: 'audio', pcm: Buffer.from(pcm.subarray(o, o + CHUNK_BYTES)).toString('base64') })); await sleep(CHUNK_MS) }
  }

  // ── Phase 3 client emulation ──────────────────────────────────────────────
  const crosscheck = PHASE3 ? createMrnCrosscheck() : null
  let forcedSent = false
  let lastCapturedKey = ''
  const sendNudge = (nudgeText, nova, medical, forced) => {
    if (ws.readyState === 1) ws.send(JSON.stringify({ t: 'systemText', text: nudgeText }))
    log({ role: forced ? 'phase3-forced-nudge' : 'phase3-nudge', nova, medical })
    console.log(`>>> PHASE3 ${forced ? 'FORCED ' : ''}MISMATCH nova="${nova}" medical="${medical}" → injected read-back nudge`)
  }
  const phase3Note = (method, text) => {
    if (!crosscheck) return
    const action = crosscheck[method](text, Date.now())
    if (action) {
      if (FORCE_MISMATCH) {
        // Forced mode owns the injection — record the organic verdict, don't double-nudge.
        log({ role: 'phase3-organic-suppressed', nova: action.novaValue, medical: action.medicalValue })
        console.log(`    (phase3: organic mismatch nova="${action.novaValue}" medical="${action.medicalValue}" — suppressed, forced mode)`)
      } else {
        sendNudge(action.nudgeText, action.novaValue, action.medicalValue, false)
      }
    }
    const cap = crosscheck.getCapturedIdentifier()
    const key = cap ? `${cap.value}:${cap.verified}` : ''
    if (cap?.verified && key !== lastCapturedKey) console.log(`    (phase3: MRN verified ✓ ${cap.value})`)
    lastCapturedKey = key
  }

  ws.on('message', (raw) => {
    let m; try { m = JSON.parse(raw.toString()) } catch { return }
    if (m.t === 'assistantTranscript') {
      log({ role: 'CLARA', text: m.text }); console.log(`[${((Date.now() - t0) / 1000).toFixed(0)}s] CLARA: ${m.text}`)
      phase3Note('noteAssistantTurn', m.text)
    }
    else if (m.t === 'userTranscript') {
      log({ role: 'nova-asr', text: m.text }); console.log(`[${((Date.now() - t0) / 1000).toFixed(0)}s]  (nova heard: ${m.text})`)
      // --force-mismatch: first extracted MRN gets ONE synthetic disagreement
      // (last digit rotated) so the nudge→read-back path is exercised even
      // when both ASRs happen to agree.
      if (FORCE_MISMATCH && !forcedSent && PHASE3) {
        const cands = extractDigitCandidates(m.text)
        if (cands.length) {
          const nova = cands.reduce((a, b) => (b.value.length > a.value.length ? b : a)).value
          const medical = nova.slice(0, -1) + String((Number(nova.at(-1)) + 1) % 10)
          forcedSent = true
          sendNudge(buildReadbackNudgeText(nova, medical), nova, medical, true)
        }
      }
      phase3Note('noteUserTurn', m.text)
    }
    else if (m.t === 'medicalTranscript') {
      log({ role: 'medical-asr', isPartial: m.isPartial, text: m.text }); if (!m.isPartial) console.log(`[${((Date.now() - t0) / 1000).toFixed(0)}s]  (TRANSCRIBE MEDICAL: ${m.text})`)
      if (!m.isPartial) phase3Note('noteMedicalSegment', m.text)
    }
    else if (m.t === 'error') { log({ error: m.message }); console.log('ERR', m.message) }
  })

  await new Promise((res, rej) => { ws.on('open', res); ws.on('error', rej) })
  ws.send(JSON.stringify({ t: 'start', instructions: sess.instructions, tools: sess.tools || [], voiceId: sess.voiceId }))
  console.log(`\n=== ${SCENARIO} — connected, Clara greeting... ===`)
  await streamSilence(LEAD_S)
  for (let i = 0; i < WAVS.length; i++) { await streamWav(WAVS[i]); await streamSilence(i === WAVS.length - 1 ? TAIL_S : GAP_S) }
  if (ws.readyState === 1) ws.send(JSON.stringify({ t: 'stop' }))
  await sleep(1500); out.end()
  if (crosscheck) {
    const events = crosscheck.getEvents()
    const cap = crosscheck.getCapturedIdentifier()
    console.log(`--- phase3: ${events.length} verdict(s) [${events.map((e) => e.kind).join(', ') || 'none'}]` +
      ` | captured: ${cap ? `${cap.value} (${cap.source}${cap.verified ? ', verified' : ''})` : 'none'} ---`)
  }
  console.log(`=== ${SCENARIO} done ===\n`)
  process.exit(0)
}
main().catch((e) => { console.error('FATAL', e.message); process.exit(1) })
