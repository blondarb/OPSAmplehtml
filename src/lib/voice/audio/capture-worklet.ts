/**
 * MicCapture — microphone → 16 kHz PCM16 base64 chunks
 *
 * Capture graph:
 *   getUserMedia stream
 *     → MediaStreamAudioSourceNode
 *     → AudioWorkletNode ('pcm-capture')          [receives 128-sample quanta]
 *     → GainNode (gain=0) → AudioContext.destination  [keeps graph pulling]
 *
 * The silent GainNode sink is the safe pattern: without a downstream
 * connection to destination, some browsers throttle or never fire
 * AudioWorkletProcessor.process(). Gain=0 ensures no mic audio reaches
 * the speakers.
 *
 * On each worklet message:
 *   Float32 quantum (48 kHz) → downsample to 16 kHz → floatTo16BitPCM → base64
 */

import {
  downsampleTo16k,
  floatTo16BitPCM,
  base64FromPcm,
} from './pcm';

export class MicCapture {
  private ctx: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private silentGain: GainNode | null = null;

  /**
   * Start mic capture. Calls onChunk with a base64-encoded 16 kHz PCM16
   * string for each 128-sample worklet quantum (~2.7 ms at 48 kHz).
   */
  async start(onChunk: (base64Pcm16At16k: string) => void): Promise<void> {
    if (this.ctx) return; // already running — idempotent

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
    this.stream = stream;

    // The mic is now live. If any setup below throws (e.g. addModule hits a
    // network/syntax error), tear the stream + half-open context back down so
    // we never leak an open microphone or a suspended AudioContext.
    try {
      // Use the browser's default sample rate (typically 48000 Hz).
      // Forcing a specific rate can cause quality issues or errors.
      const ctx = new AudioContext();
      this.ctx = ctx;

      // RESUME BEFORE WIRING THE GRAPH — this line is the whole fix.
      //
      // Chrome's autoplay policy starts an AudioContext SUSPENDED unless it is
      // constructed synchronously inside a user-gesture handler. This one is
      // constructed after `await getUserMedia(...)`, which breaks the gesture
      // chain, so it reliably begins suspended. A suspended context does not
      // pull the graph: process() never fires, port.onmessage never runs, and
      // NOT ONE audio chunk is ever sent. Silently.
      //
      // Observed 2026-08-07: "Henry can't hear me", and the interview taking
      // ~40s to start. Nova does not speak unprompted — verified against the
      // live relay, 45s of silence with both a 14,001-char prompt and a
      // 111-char one — so the greeting only fires once audio arrives. With no
      // audio ever arriving, the whole interview stalls waiting on it. It
      // appeared intermittent because Chrome resumes a suspended context
      // opportunistically on later user interaction: click something and it
      // starts working, don't and it never does.
      await ctx.resume();
      if (ctx.state !== 'running') {
        // Fail loudly rather than reporting a live mic that captures nothing.
        // The silent no-op is what made this cost a day to find.
        throw new Error(
          `Microphone could not start: audio context is "${ctx.state}". ` +
            `Tap or click the page once, then start the interview again.`,
        );
      }

      await ctx.audioWorklet.addModule('/voice/pcm-capture-worklet.js');

      const source = ctx.createMediaStreamSource(stream);
      this.source = source;

      const workletNode = new AudioWorkletNode(ctx, 'pcm-capture');
      this.workletNode = workletNode;

      // Silent sink: keeps the graph pulling so process() fires reliably.
      const silentGain = ctx.createGain();
      silentGain.gain.value = 0;
      this.silentGain = silentGain;

      source.connect(workletNode);
      workletNode.connect(silentGain);
      silentGain.connect(ctx.destination);

      workletNode.port.onmessage = (e: MessageEvent) => {
        const float = e.data as Float32Array;
        const down = downsampleTo16k(float, ctx.sampleRate);
        const pcm = floatTo16BitPCM(down);
        onChunk(base64FromPcm(pcm));
      };
    } catch (err) {
      await this.stop();
      throw err;
    }
  }

  /**
   * Stop capture: disconnect the graph, stop mic tracks, close context.
   * Idempotent — safe to call multiple times.
   */
  async stop(): Promise<void> {
    if (this.workletNode) {
      this.workletNode.port.onmessage = null;
      this.workletNode.disconnect();
      this.workletNode = null;
    }
    if (this.source) {
      this.source.disconnect();
      this.source = null;
    }
    if (this.silentGain) {
      this.silentGain.disconnect();
      this.silentGain = null;
    }
    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
    }
    if (this.ctx) {
      await this.ctx.close();
      this.ctx = null;
    }
  }
}
