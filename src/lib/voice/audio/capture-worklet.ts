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
  /** When true, captured chunks are dropped (not sent). Used for half-duplex —
   *  mute the mic while the AI is speaking so it can't hear its own audio. The
   *  graph keeps running so unmuting is instant. */
  private muted = false;

  /** Enable/disable half-duplex muting (see `muted`). */
  setMuted(muted: boolean): void {
    this.muted = muted;
  }

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
        if (this.muted) return; // half-duplex: drop mic audio while AI speaks
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
