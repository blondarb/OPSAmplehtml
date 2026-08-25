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

export const MIC_RUNTIME_FAILURE_REASONS = [
  'track_ended',
  'track_muted',
  'context_not_running',
  'audio_chunks_stalled',
] as const;

export type MicRuntimeFailureReason = typeof MIC_RUNTIME_FAILURE_REASONS[number];

/** Intentional cancellation while browser microphone setup is still pending. */
export class MicCaptureStartCancelledError extends Error {
  constructor() {
    super('Microphone startup was cancelled.');
    this.name = 'MicCaptureStartCancelledError';
  }
}

const CONTEXT_RECOVERY_GRACE_MS = 5_000;
const TRACK_MUTE_GRACE_MS = 5_000;
const AUDIO_CHUNK_STALL_MS = 5_000;
const AUDIO_CHUNK_RECOVERY_GRACE_MS = 2_000;
const AUDIO_CHUNK_WATCH_INTERVAL_MS = 1_000;

export class MicCapture {
  private ctx: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private track: MediaStreamTrack | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private silentGain: GainNode | null = null;
  private onRuntimeFailure: ((reason: MicRuntimeFailureReason) => void) | null = null;
  private runtimeFailureEmitted = false;
  private stopping = false;
  private lastChunkAtMs = 0;
  private contextRecoveryTimer: ReturnType<typeof setTimeout> | null = null;
  private trackMuteTimer: ReturnType<typeof setTimeout> | null = null;
  private chunkRecoveryTimer: ReturnType<typeof setTimeout> | null = null;
  private chunkWatchdog: ReturnType<typeof setInterval> | null = null;
  /** Invalidates any pending getUserMedia/resume/worklet setup after stop(). */
  private startGeneration = 0;

  private isCurrentStart(generation: number): boolean {
    return !this.stopping && generation === this.startGeneration;
  }

  private async abandonCancelledStart(
    stream: MediaStream,
    ctx?: AudioContext,
  ): Promise<never> {
    stream.getTracks().forEach((track) => track.stop());
    if (ctx && ctx.state !== 'closed') {
      await ctx.close().catch(() => undefined);
    }
    if (this.stream === stream) this.stream = null;
    if (this.track && stream.getTracks().includes(this.track)) this.track = null;
    if (ctx && this.ctx === ctx) this.ctx = null;
    throw new MicCaptureStartCancelledError();
  }

  private clearContextRecoveryTimer(): void {
    if (this.contextRecoveryTimer) clearTimeout(this.contextRecoveryTimer);
    this.contextRecoveryTimer = null;
  }

  private clearTrackMuteTimer(): void {
    if (this.trackMuteTimer) clearTimeout(this.trackMuteTimer);
    this.trackMuteTimer = null;
  }

  private clearChunkRecoveryTimer(): void {
    if (this.chunkRecoveryTimer) clearTimeout(this.chunkRecoveryTimer);
    this.chunkRecoveryTimer = null;
  }

  private clearRuntimeHealth(): void {
    this.clearContextRecoveryTimer();
    this.clearTrackMuteTimer();
    this.clearChunkRecoveryTimer();
    if (this.chunkWatchdog) clearInterval(this.chunkWatchdog);
    this.chunkWatchdog = null;
    if (this.ctx) this.ctx.onstatechange = null;
    if (this.track) {
      this.track.onended = null;
      this.track.onmute = null;
      this.track.onunmute = null;
    }
  }

  private reportRuntimeFailure(reason: MicRuntimeFailureReason): void {
    if (this.stopping || this.runtimeFailureEmitted) return;
    this.runtimeFailureEmitted = true;
    this.clearRuntimeHealth();
    const callback = this.onRuntimeFailure;
    callback?.(reason);
    // A dead capture graph must not leave the browser microphone indicator on
    // while the hook is persisting the confirmed partial interview.
    void this.stop();
  }

  private armRuntimeHealth(ctx: AudioContext, track: MediaStreamTrack): void {
    this.lastChunkAtMs = Date.now();

    ctx.onstatechange = () => {
      if (this.stopping || this.runtimeFailureEmitted) return;
      if (ctx.state === 'running') {
        this.clearContextRecoveryTimer();
        return;
      }
      // Android browsers may briefly suspend a context after an audio-focus
      // interruption. Attempt one bounded recovery before ending partial.
      void ctx.resume().catch(() => undefined);
      if (this.contextRecoveryTimer) return;
      this.contextRecoveryTimer = setTimeout(() => {
        this.contextRecoveryTimer = null;
        if (ctx.state !== 'running') {
          this.reportRuntimeFailure('context_not_running');
        }
      }, CONTEXT_RECOVERY_GRACE_MS);
    };

    track.onended = () => this.reportRuntimeFailure('track_ended');
    track.onmute = () => {
      if (this.stopping || this.runtimeFailureEmitted || this.trackMuteTimer) return;
      this.trackMuteTimer = setTimeout(() => {
        this.trackMuteTimer = null;
        if (track.muted) this.reportRuntimeFailure('track_muted');
      }, TRACK_MUTE_GRACE_MS);
    };
    track.onunmute = () => this.clearTrackMuteTimer();

    // A live AudioWorklet produces chunks continuously, including digital
    // silence. No chunks therefore means the capture graph itself stalled,
    // not merely that the patient paused. Try to resume once, then fail with a
    // specific reason instead of waiting for the generic unresponsive timer.
    this.chunkWatchdog = setInterval(() => {
      if (
        this.stopping ||
        this.runtimeFailureEmitted ||
        Date.now() - this.lastChunkAtMs < AUDIO_CHUNK_STALL_MS ||
        this.chunkRecoveryTimer
      ) return;
      void ctx.resume().catch(() => undefined);
      this.chunkRecoveryTimer = setTimeout(() => {
        this.chunkRecoveryTimer = null;
        if (Date.now() - this.lastChunkAtMs >= AUDIO_CHUNK_STALL_MS) {
          this.reportRuntimeFailure('audio_chunks_stalled');
        }
      }, AUDIO_CHUNK_RECOVERY_GRACE_MS);
    }, AUDIO_CHUNK_WATCH_INTERVAL_MS);
  }

  /**
   * Start mic capture. Calls onChunk with a base64-encoded 16 kHz PCM16
   * string for each 128-sample worklet quantum (~2.7 ms at 48 kHz).
   */
  async start(
    onChunk: (base64Pcm16At16k: string) => void,
    onRuntimeFailure?: (reason: MicRuntimeFailureReason) => void,
  ): Promise<void> {
    if (this.ctx) return; // already running — idempotent

    const generation = ++this.startGeneration;
    this.stopping = false;
    this.runtimeFailureEmitted = false;
    this.onRuntimeFailure = onRuntimeFailure ?? null;

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
    if (!this.isCurrentStart(generation)) {
      await this.abandonCancelledStart(stream);
    }
    this.stream = stream;
    const track = stream.getAudioTracks()[0];
    if (!track || track.readyState !== 'live') {
      await this.stop();
      throw new Error('Microphone could not start: no live audio track was available.');
    }
    this.track = track;

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
      if (!this.isCurrentStart(generation)) {
        await this.abandonCancelledStart(stream, ctx);
      }
      if (ctx.state !== 'running') {
        // Fail loudly rather than reporting a live mic that captures nothing.
        // The silent no-op is what made this cost a day to find.
        throw new Error(
          `Microphone could not start: audio context is "${ctx.state}". ` +
            `Tap or click the page once, then start the interview again.`,
        );
      }

      await ctx.audioWorklet.addModule('/voice/pcm-capture-worklet.js');
      if (!this.isCurrentStart(generation)) {
        await this.abandonCancelledStart(stream, ctx);
      }

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
        this.lastChunkAtMs = Date.now();
        this.clearChunkRecoveryTimer();
        const float = e.data as Float32Array;
        const down = downsampleTo16k(float, ctx.sampleRate);
        const pcm = floatTo16BitPCM(down);
        onChunk(base64FromPcm(pcm));
      };
      this.armRuntimeHealth(ctx, track);
    } catch (err) {
      if (err instanceof MicCaptureStartCancelledError) throw err;
      if (!this.isCurrentStart(generation)) {
        await this.abandonCancelledStart(stream, this.ctx ?? undefined);
      }
      await this.stop();
      throw err;
    }
  }

  /**
   * Stop capture: disconnect the graph, stop mic tracks, close context.
   * Idempotent — safe to call multiple times.
   */
  async stop(): Promise<void> {
    this.startGeneration += 1;
    this.stopping = true;
    this.clearRuntimeHealth();
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
    this.track = null;
    if (this.ctx) {
      await this.ctx.close();
      this.ctx = null;
    }
    this.onRuntimeFailure = null;
  }
}
