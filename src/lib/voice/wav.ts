/**
 * Minimal RIFF/WAVE PCM reader for the offline bench (Node, zero-dep).
 *
 * Supports uncompressed PCM (fmt=1) 16/24/32-bit int and 32-bit float, any
 * channel count (downmixed to mono). Trial recordings MUST be lossless WAV —
 * see the capture spec — so this deliberately does NOT decode compressed audio.
 *
 * See docs/plans/2026-06-30-sdne-speech-trial-capture-spec.md.
 */

export interface DecodedWav {
  samples: Float32Array // mono, [-1, 1)
  sampleRate: number
  channels: number
  bitDepth: number
}

export function decodeWav(buf: ArrayBuffer): DecodedWav {
  const view = new DataView(buf)
  const tag = (off: number) => String.fromCharCode(view.getUint8(off), view.getUint8(off + 1), view.getUint8(off + 2), view.getUint8(off + 3))

  if (tag(0) !== 'RIFF' || tag(8) !== 'WAVE') throw new Error('Not a RIFF/WAVE file')

  let offset = 12
  let fmt: { audioFormat: number; channels: number; sampleRate: number; bitDepth: number } | null = null
  let dataOffset = -1
  let dataLength = 0

  while (offset + 8 <= view.byteLength) {
    const chunkId = tag(offset)
    const chunkSize = view.getUint32(offset + 4, true)
    const body = offset + 8
    if (chunkId === 'fmt ') {
      fmt = {
        audioFormat: view.getUint16(body, true),
        channels: view.getUint16(body + 2, true),
        sampleRate: view.getUint32(body + 4, true),
        bitDepth: view.getUint16(body + 14, true),
      }
    } else if (chunkId === 'data') {
      dataOffset = body
      dataLength = chunkSize
    }
    offset = body + chunkSize + (chunkSize % 2) // chunks are word-aligned
  }

  if (!fmt) throw new Error('Missing fmt chunk')
  if (dataOffset < 0) throw new Error('Missing data chunk')
  const { audioFormat, channels, sampleRate, bitDepth } = fmt
  const isFloat = audioFormat === 3
  if (audioFormat !== 1 && !isFloat) throw new Error(`Unsupported WAV audioFormat ${audioFormat} (need PCM or float)`)

  const bytesPerSample = bitDepth / 8
  const frameCount = Math.floor(dataLength / (bytesPerSample * channels))
  const mono = new Float32Array(frameCount)

  for (let i = 0; i < frameCount; i++) {
    let acc = 0
    for (let ch = 0; ch < channels; ch++) {
      const p = dataOffset + (i * channels + ch) * bytesPerSample
      acc += readSample(view, p, bitDepth, isFloat)
    }
    mono[i] = acc / channels
  }

  return { samples: mono, sampleRate, channels, bitDepth }
}

function readSample(view: DataView, p: number, bitDepth: number, isFloat: boolean): number {
  if (isFloat) return view.getFloat32(p, true)
  switch (bitDepth) {
    case 16:
      return view.getInt16(p, true) / 0x8000
    case 24: {
      const b0 = view.getUint8(p)
      const b1 = view.getUint8(p + 1)
      const b2 = view.getUint8(p + 2)
      let v = (b2 << 16) | (b1 << 8) | b0
      if (v & 0x800000) v |= ~0xffffff // sign-extend
      return v / 0x800000
    }
    case 32:
      return view.getInt32(p, true) / 0x80000000
    case 8:
      return (view.getUint8(p) - 128) / 128
    default:
      throw new Error(`Unsupported bit depth ${bitDepth}`)
  }
}
