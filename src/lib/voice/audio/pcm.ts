/**
 * Pure PCM conversion utilities for the Nova Sonic voice pipeline.
 *
 * - floatTo16BitPCM: Float32 (Web Audio) → Int16Array
 * - base64FromPcm / pcmFromBase64: Int16Array ↔ base64 (little-endian)
 * - downsampleTo16k: linear-interpolation resample → 16 kHz
 *
 * No side effects, no Web Audio, no React, no WebSocket.
 */

/**
 * Convert Float32 samples (range [-1, 1]) to Int16 PCM.
 * Values outside [-1, 1] are clamped.
 * Positive full-scale (1.0) → 32767; negative full-scale (-1.0) → -32768.
 */
export function floatTo16BitPCM(input: Float32Array): Int16Array {
  const output = new Int16Array(input.length)
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i]))
    output[i] = s < 0 ? Math.round(s * 0x8000) : Math.round(s * 0x7fff)
  }
  return output
}

/**
 * Encode an Int16Array to a base64 string (little-endian byte order).
 * The Uint8Array view over the same buffer preserves platform byte order
 * (always LE on all target platforms), ensuring round-trip with pcmFromBase64.
 */
export function base64FromPcm(pcm: Int16Array): string {
  const bytes = new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

/**
 * Decode a base64 string back to an Int16Array (little-endian byte order).
 * Exactly reverses base64FromPcm.
 */
export function pcmFromBase64(b64: string): Int16Array {
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return new Int16Array(bytes.buffer)
}

/**
 * Resample Float32 audio from inputRate to 16000 Hz using linear interpolation.
 * If inputRate === 16000, the original array is returned unchanged (no copy).
 *
 * Output length = Math.round(input.length * 16000 / inputRate).
 * For a 32000 Hz buffer of length 320, output length is exactly 160.
 */
export function downsampleTo16k(input: Float32Array, inputRate: number): Float32Array {
  if (inputRate === 16000) return input

  const ratio = inputRate / 16000
  const outputLength = Math.round(input.length * 16000 / inputRate)
  const output = new Float32Array(outputLength)

  for (let i = 0; i < outputLength; i++) {
    const srcPos = i * ratio
    const srcFloor = Math.floor(srcPos)
    const srcCeil = Math.min(srcFloor + 1, input.length - 1)
    const t = srcPos - srcFloor
    output[i] = input[srcFloor] * (1 - t) + input[srcCeil] * t
  }

  return output
}
