/**
 * AudioWorklet-based continuous PCM playback — the iOS clicking fix.
 *
 * The old player scheduled each PCM chunk as its OWN AudioBufferSourceNode; iOS
 * Safari clicks at the seams between many short scheduled sources (confirmed
 * on-device: clicks on iPhone, clean on macOS). An AudioWorklet is ONE
 * persistent node that outputs continuously from an internal sample queue — no
 * per-chunk sources, no seams. That removed most pops; the residual ones are
 * UNDERRUNS — on a jittery mobile connection the queue occasionally empties
 * between chunks, and the hard audio→silence→audio jump pops. Two defences:
 *
 *   1. PRE-ROLL CUSHION — hold silence until ~200 ms is buffered before starting
 *      (and re-prime after an underrun), so the queue rarely runs dry.
 *   2. DECLICK RAMP — a short (~32-sample) linear fade at every silence boundary
 *      (fade out into a gap, fade in on resume) so any residual gap can't pop.
 *
 * `renderBlock` is the pure per-render-block logic, exported for unit testing;
 * the worklet source string below inlines the same algorithm (a worklet runs in
 * its own realm and cannot import modules).
 */

export interface StreamState {
  chunks: Float32Array[]
  readPos: number
  queued: number // real samples still queued (sum of chunk lengths minus readPos)
  primed: boolean
  silent: boolean // last block ended in silence (so next real audio fades in)
  lastOut: number // last emitted sample value, for declick ramps
  primeSamples: number // cushion to buffer before (re)starting playback
}

/** ~32 samples ≈ 0.7 ms at 48 kHz — inaudible fade that removes boundary pops. */
export const DECLICK = 32

export function makeStreamState(primeSamples: number): StreamState {
  return { chunks: [], readPos: 0, queued: 0, primed: false, silent: true, lastOut: 0, primeSamples }
}

function fillSilence(s: StreamState, out: Float32Array, from: number): void {
  const n = out.length
  const ramp = Math.min(DECLICK, n - from)
  for (let k = 0; k < ramp; k++) out[from + k] = s.lastOut * (1 - (k + 1) / ramp) // ramp lastOut → 0
  for (let k = from + ramp; k < n; k++) out[k] = 0
  s.lastOut = 0
  s.silent = true
}

/**
 * Fill one render block from the queue. Emits declicked silence until primed;
 * plays continuously once primed; fades in on resume-from-silence and fades out
 * into an underrun (then re-primes). Mutates state; no audio loss, no reorder.
 */
export function renderBlock(s: StreamState, out: Float32Array): void {
  const n = out.length
  if (!s.primed) {
    if (s.queued >= s.primeSamples) s.primed = true
    else return fillSilence(s, out, 0)
  }
  let i = 0
  const resumeRamp = s.silent ? DECLICK : 0
  while (i < n && s.chunks.length > 0) {
    const cur = s.chunks[0]
    const take = Math.min(cur.length - s.readPos, n - i)
    for (let k = 0; k < take; k++) {
      let v = cur[s.readPos + k]
      const gi = i + k
      if (gi < resumeRamp) v = s.lastOut + (v - s.lastOut) * ((gi + 1) / resumeRamp) // fade in
      out[gi] = v
      s.lastOut = v
    }
    i += take
    s.readPos += take
    s.queued -= take
    if (s.readPos >= cur.length) {
      s.chunks.shift()
      s.readPos = 0
    }
  }
  if (i >= n) {
    s.silent = false
    return
  }
  fillSilence(s, out, i) // underrun: fade out, then re-prime to rebuild a cushion
  s.primed = false
}

/**
 * Worklet processor source (loaded via a Blob URL). Mirrors renderBlock +
 * makeStreamState above, plus queue intake and LATE-biased drain reporting
 * (~11 ms hangover so whenDrained never clips a closing statement).
 * `sampleRate` is a global inside AudioWorkletGlobalScope.
 */
export const PCM_STREAM_WORKLET_SRC = `
const DECLICK = ${DECLICK};
class PcmStreamProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.s = { chunks: [], readPos: 0, queued: 0, primed: false, silent: true, lastOut: 0, primeSamples: Math.round(sampleRate * 0.2) };
    this.pendingData = false;
    this.emptyBlocks = 0;
    this.port.onmessage = (e) => {
      const d = e.data;
      if (d.type === 'push') {
        this.s.chunks.push(d.samples);
        this.s.queued += d.samples.length;
        this.pendingData = true;
        this.emptyBlocks = 0;
      } else if (d.type === 'clear') {
        this.s.chunks = []; this.s.readPos = 0; this.s.queued = 0;
        this.s.primed = false; this.s.silent = true;
        this.pendingData = false; this.emptyBlocks = 0;
      }
    };
  }
  fillSilence(out, from) {
    const n = out.length;
    const ramp = Math.min(DECLICK, n - from);
    for (let k = 0; k < ramp; k++) out[from + k] = this.s.lastOut * (1 - (k + 1) / ramp);
    for (let k = from + ramp; k < n; k++) out[k] = 0;
    this.s.lastOut = 0; this.s.silent = true;
  }
  process(inputs, outputs) {
    const out = outputs[0] && outputs[0][0];
    if (!out) return true;
    const s = this.s;
    const n = out.length;
    if (!s.primed) {
      if (s.queued >= s.primeSamples) s.primed = true;
      else { this.fillSilence(out, 0); this.reportDrain(); return true; }
    }
    let i = 0;
    const resumeRamp = s.silent ? DECLICK : 0;
    while (i < n && s.chunks.length > 0) {
      const cur = s.chunks[0];
      const take = Math.min(cur.length - s.readPos, n - i);
      for (let k = 0; k < take; k++) {
        let v = cur[s.readPos + k];
        const gi = i + k;
        if (gi < resumeRamp) v = s.lastOut + (v - s.lastOut) * ((gi + 1) / resumeRamp);
        out[gi] = v; s.lastOut = v;
      }
      i += take; s.readPos += take; s.queued -= take;
      if (s.readPos >= cur.length) { s.chunks.shift(); s.readPos = 0; }
    }
    if (i >= n) { s.silent = false; }
    else { this.fillSilence(out, i); s.primed = false; }
    this.reportDrain();
    return true;
  }
  reportDrain() {
    if (this.s.chunks.length === 0) {
      this.emptyBlocks++;
      if (this.pendingData && this.emptyBlocks >= 4) { this.pendingData = false; this.port.postMessage({ type: 'drained' }); }
    } else { this.emptyBlocks = 0; }
  }
}
registerProcessor('pcm-stream', PcmStreamProcessor);
`
