/**
 * AudioWorklet-based continuous PCM playback — the iOS clicking fix.
 *
 * The old player scheduled each PCM chunk as its OWN AudioBufferSourceNode glued
 * to the clock. iOS Safari clicks at the seams between many short scheduled
 * sources (confirmed on-device: clicks on iPhone, clean on macOS). Neither
 * matching the sample rate nor a jitter buffer fixed it, because the seams
 * themselves are the problem.
 *
 * An AudioWorklet is ONE persistent audio node that outputs continuously from an
 * internal sample queue — there are no per-chunk sources and therefore no seams
 * to click. The main thread just pushes Float32 samples into the queue.
 *
 * `pumpQueue` is the pure per-render-block logic, exported so it can be unit
 * tested; the worklet source string below inlines the same algorithm (a worklet
 * runs in its own realm and cannot import modules).
 */

export interface QueueState {
  chunks: Float32Array[]
  readPos: number
}

/**
 * Fill `out` from the front of the chunk queue; zero-fill any remainder (silence
 * on underrun — never a click). Mutates state (advances readPos / shifts chunks)
 * and returns how many real samples were written.
 */
export function pumpQueue(state: QueueState, out: Float32Array): number {
  let i = 0
  const n = out.length
  while (i < n && state.chunks.length > 0) {
    const cur = state.chunks[0]
    const take = Math.min(cur.length - state.readPos, n - i)
    out.set(cur.subarray(state.readPos, state.readPos + take), i)
    i += take
    state.readPos += take
    if (state.readPos >= cur.length) {
      state.chunks.shift()
      state.readPos = 0
    }
  }
  for (let j = i; j < n; j++) out[j] = 0
  return i
}

/**
 * The worklet processor source, as a string loaded via a Blob URL (a worklet
 * module must be fetched from a URL; a same-origin blob avoids shipping a static
 * asset). Mirrors pumpQueue above. Drain is reported only after several empty
 * blocks (a ~11 ms hangover) so it biases LATE — never cutting a closing
 * statement short (whenDrained is load-bearing for the historian's close).
 */
export const PCM_STREAM_WORKLET_SRC = `
class PcmStreamProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.chunks = [];
    this.readPos = 0;
    this.emptyBlocks = 0;
    this.pendingData = false;
    this.port.onmessage = (e) => {
      const d = e.data;
      if (d.type === 'push') {
        this.chunks.push(d.samples);
        this.pendingData = true;
        this.emptyBlocks = 0;
      } else if (d.type === 'clear') {
        this.chunks = [];
        this.readPos = 0;
        this.pendingData = false;
        this.emptyBlocks = 0;
      }
    };
  }
  process(inputs, outputs) {
    const out = outputs[0] && outputs[0][0];
    if (!out) return true;
    let i = 0;
    const n = out.length;
    while (i < n && this.chunks.length > 0) {
      const cur = this.chunks[0];
      const take = Math.min(cur.length - this.readPos, n - i);
      out.set(cur.subarray(this.readPos, this.readPos + take), i);
      i += take;
      this.readPos += take;
      if (this.readPos >= cur.length) { this.chunks.shift(); this.readPos = 0; }
    }
    for (let j = i; j < n; j++) out[j] = 0;
    if (this.chunks.length === 0) {
      this.emptyBlocks++;
      if (this.pendingData && this.emptyBlocks >= 4) {
        this.pendingData = false;
        this.port.postMessage({ type: 'drained' });
      }
    } else {
      this.emptyBlocks = 0;
    }
    return true;
  }
}
registerProcessor('pcm-stream', PcmStreamProcessor);
`
