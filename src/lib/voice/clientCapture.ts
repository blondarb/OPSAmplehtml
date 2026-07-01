'use client'

/**
 * Client-side audio capture helpers for the voice-biomarker battery.
 *
 * Phase A scaffold (2026-06-30). The browser owns decoding (it already has the
 * codecs) so the Node Lambda never needs ffmpeg: we decode the recorded blob,
 * downmix to mono, resample to 16 kHz, and ship raw Int16 PCM to the route.
 *
 * See docs/plans/2026-06-30-acoustic-speech-biomarkers-spec.md.
 */

import type { BiomarkerPanel, VoiceTask } from './types'

export const TARGET_SAMPLE_RATE = 16000

/** Decode a recorded Blob to a mono Float32 PCM buffer at its native rate. */
async function decodeToMono(blob: Blob): Promise<{ data: Float32Array; sampleRate: number }> {
  const arrayBuffer = await blob.arrayBuffer()
  // Safari still namespaces AudioContext.
  const Ctx: typeof AudioContext =
    window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
  const ctx = new Ctx()
  try {
    const audio = await ctx.decodeAudioData(arrayBuffer)
    // Downmix all channels to mono by averaging.
    const length = audio.length
    const mono = new Float32Array(length)
    for (let ch = 0; ch < audio.numberOfChannels; ch++) {
      const data = audio.getChannelData(ch)
      for (let i = 0; i < length; i++) mono[i] += data[i]
    }
    if (audio.numberOfChannels > 1) {
      for (let i = 0; i < length; i++) mono[i] /= audio.numberOfChannels
    }
    return { data: mono, sampleRate: audio.sampleRate }
  } finally {
    void ctx.close()
  }
}

/** Linear-interpolation resampler to TARGET_SAMPLE_RATE. */
function resample(input: Float32Array, fromRate: number, toRate: number): Float32Array {
  if (fromRate === toRate) return input
  const ratio = toRate / fromRate
  const outLength = Math.floor(input.length * ratio)
  const out = new Float32Array(outLength)
  for (let i = 0; i < outLength; i++) {
    const srcPos = i / ratio
    const i0 = Math.floor(srcPos)
    const i1 = Math.min(i0 + 1, input.length - 1)
    const frac = srcPos - i0
    out[i] = input[i0] * (1 - frac) + input[i1] * frac
  }
  return out
}

/** Float32 [-1,1] → little-endian Int16 PCM ArrayBuffer. */
function floatToInt16(samples: Float32Array): ArrayBuffer {
  const out = new Int16Array(samples.length)
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]))
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff
  }
  return out.buffer
}

/** Decode + downsample a recorded blob to 16 kHz mono Int16 PCM. */
export async function blobToPcm16(blob: Blob): Promise<{ pcm: ArrayBuffer; sampleRate: number }> {
  const { data, sampleRate } = await decodeToMono(blob)
  const resampled = resample(data, sampleRate, TARGET_SAMPLE_RATE)
  return { pcm: floatToInt16(resampled), sampleRate: TARGET_SAMPLE_RATE }
}

/** POST a recorded task blob to the analysis route and return its panel. */
export async function analyzeTask(
  task: VoiceTask,
  blob: Blob,
  ctx?: { patientId?: string; visitId?: string }
): Promise<BiomarkerPanel> {
  const { pcm, sampleRate } = await blobToPcm16(blob)
  const params = new URLSearchParams({ task, sampleRate: String(sampleRate) })
  if (ctx?.patientId) params.set('patientId', ctx.patientId)
  if (ctx?.visitId) params.set('visitId', ctx.visitId)

  const res = await fetch(`/api/ai/voice-biomarkers?${params.toString()}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream' },
    body: pcm,
  })
  const json = await res.json()
  if (!res.ok) throw new Error(json.error || `Analysis failed (${res.status})`)
  return json.panel as BiomarkerPanel
}
