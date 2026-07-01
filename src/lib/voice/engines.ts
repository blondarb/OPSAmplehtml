/**
 * Multi-engine registry for the speech-biomarker bake-off.
 *
 * Phase A (2026-06-30). One recording is scored by EVERY registered engine in
 * parallel ("score all simultaneously"), so the trials capture every engine's
 * numbers on the identical audio and the choice of engine is deferred to
 * analysis. The pure-TS engine runs in-process; a Praat/Parselmouth engine is
 * an HTTP adapter to a sidecar (VOICE_PRAAT_URL) that reports unavailable until
 * the sidecar exists.
 *
 * See docs/plans/2026-06-30-sdne-speech-trial-capture-spec.md.
 */

import { analyzeAcoustic, ENGINE_ID as TS_ENGINE_ID } from './acoustic'
import { buildPanel } from './flagging'
import type { AcousticInput } from './acoustic'
import type { BiomarkerPanel, VoiceTask } from './types'

/** A flat, engine-neutral feature map — the unit the stats layer compares. */
export type FeatureMap = Record<string, number | null>

export interface EngineResult {
  engine: string
  version: string
  available: boolean
  features: FeatureMap
  /** Present for engines that produce a full flagged panel (pure-TS today). */
  panel?: BiomarkerPanel
  error?: string
}

export interface VoiceEngine {
  id: string
  version: string
  score(task: VoiceTask, input: AcousticInput): Promise<EngineResult>
}

/** Flatten a pure-TS panel to a numeric feature map keyed engine-neutrally. */
function panelToFeatures(panel: BiomarkerPanel): FeatureMap {
  const out: FeatureMap = {}
  for (const f of panel.features) out[f.key] = f.value
  return out
}

/** In-process pure-TS engine (always available). */
export const pureTsEngine: VoiceEngine = {
  id: 'pure-ts',
  version: TS_ENGINE_ID,
  async score(task, input) {
    try {
      const raw = analyzeAcoustic(task, input)
      const panel = buildPanel(raw)
      panel.meta.sampleRate = input.sampleRate
      return { engine: this.id, version: this.version, available: true, features: panelToFeatures(panel), panel }
    } catch (e) {
      return { engine: this.id, version: this.version, available: false, features: {}, error: msg(e) }
    }
  },
}

/**
 * Praat/Parselmouth engine via a sidecar HTTP service. Sends 16 kHz mono Int16
 * PCM; expects `{ version, features: {jitter, shimmer, hnr, f0Mean, f0Sd, ...} }`.
 * Unavailable (never throws) when VOICE_PRAAT_URL is unset or the call fails, so
 * the fan-out degrades gracefully to whatever engines are up.
 */
export const parselmouthEngine: VoiceEngine = {
  id: 'parselmouth',
  version: 'sidecar',
  async score(task, input) {
    const url = process.env.VOICE_PRAAT_URL?.trim()
    if (!url) {
      return { engine: this.id, version: this.version, available: false, features: {}, error: 'VOICE_PRAAT_URL not set' }
    }
    try {
      const pcm = floatToInt16(input.samples)
      const res = await fetch(`${url.replace(/\/$/, '')}/score?task=${encodeURIComponent(task)}&sampleRate=${input.sampleRate}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: pcm,
      })
      if (!res.ok) {
        return { engine: this.id, version: this.version, available: false, features: {}, error: `sidecar ${res.status}` }
      }
      const json = (await res.json()) as { version?: string; features?: FeatureMap }
      return {
        engine: this.id,
        version: json.version || this.version,
        available: true,
        features: json.features || {},
      }
    } catch (e) {
      return { engine: this.id, version: this.version, available: false, features: {}, error: msg(e) }
    }
  },
}

/** Engines to run per capture. Add openSMILE/DisVoice adapters here later. */
export const ENGINE_REGISTRY: VoiceEngine[] = [pureTsEngine, parselmouthEngine]

/** Score one recording with EVERY registered engine, in parallel. */
export async function scoreAllEngines(task: VoiceTask, input: AcousticInput): Promise<EngineResult[]> {
  return Promise.all(ENGINE_REGISTRY.map(e => e.score(task, input)))
}

// ── helpers ──────────────────────────────────────────────────────────

function floatToInt16(samples: Float32Array): ArrayBuffer {
  const out = new Int16Array(samples.length)
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]))
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff
  }
  return out.buffer
}

function msg(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}
