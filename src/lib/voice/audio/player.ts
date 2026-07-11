/**
 * PcmPlayer — gapless playback of 24 kHz PCM16 base64 chunks
 *
 * Scheduling strategy:
 *   Each enqueued chunk is decoded and scheduled at:
 *     startAt = max(ctx.currentTime, nextStartTime)
 *   nextStartTime advances by buffer.duration after each schedule.
 *   This produces seamless, gap-free playback regardless of network jitter,
 *   because chunks are glued end-to-end on the audio clock rather than
 *   being triggered on message arrival.
 *
 * Autoplay / suspended context:
 *   AudioContext created without a user gesture may start in 'suspended'
 *   state. enqueue() calls ctx.resume() if suspended so the first chunk
 *   plays as soon as the policy allows.
 *
 * Barge-in / interrupt:
 *   interrupt() stops all scheduled sources immediately, resets the
 *   nextStartTime cursor, and leaves the context open for reuse.
 *
 * Context lifecycle:
 *   The AudioContext is created lazily on the first enqueue() call —
 *   constructing one before a user gesture can fail on Safari/iOS.
 *   close() shuts everything down permanently; create a new PcmPlayer
 *   instance if playback is needed again.
 */

import { pcmFromBase64 } from './pcm';
import { makeResampleState, resamplePcm16, type ResampleState } from './resample';

const SOURCE_RATE = 24000; // Nova Sonic PCM chunk rate
// Jitter buffer: when playback falls behind the audio clock (first chunk or a
// late-arriving chunk on mobile), restart this far ahead so late chunks have
// slack instead of clicking. ~180 ms trades a little latency for gapless audio.
const JITTER_S = 0.18;

export class PcmPlayer {
  private ctx: AudioContext | null = null;
  private nextStartTime = 0;
  private activeSources = new Set<AudioBufferSourceNode>();
  /** Resolvers waiting on whenDrained() — flushed once activeSources empties. */
  private drainWaiters: Array<() => void> = [];
  /** Carries resample interpolation state across chunks so seams don't click. */
  private resampleState: ResampleState = makeResampleState();

  /** Lazily create the AudioContext on first use. */
  private getContext(): AudioContext {
    if (!this.ctx) {
      // Keep the browser's DEFAULT rate (forcing 24 kHz regressed mobile audio,
      // reverted 2026-07-11). We instead resample 24 kHz → the context's native
      // rate ourselves, continuously (see enqueue), so the browser never does a
      // per-chunk resample — that per-chunk resampling was the mobile clicking.
      this.ctx = new AudioContext();
    }
    return this.ctx;
  }

  /**
   * Decode a base64 24 kHz PCM16 chunk and schedule it for gapless playback.
   * Safe to call before any previous chunk has finished playing.
   */
  enqueue(base64Pcm16At24k: string): void {
    const ctx = this.getContext();

    // Resume if the autoplay policy started the context suspended.
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {
        // Best-effort — playback will start once the context is resumed by
        // a user gesture if the browser blocks it.
      });
    }

    // Decode PCM16, then resample 24 kHz → the context's native rate HERE,
    // carrying interpolation state across chunks so seams stay continuous. This
    // replaces the browser's per-chunk resample (which clicked at every seam on
    // mobile). Buffer is built at ctx.sampleRate so Web Audio does no resample.
    const pcm = pcmFromBase64(base64Pcm16At24k);
    const float = resamplePcm16(pcm, SOURCE_RATE, ctx.sampleRate, this.resampleState);
    if (float.length === 0) return;

    const buffer = ctx.createBuffer(1, float.length, ctx.sampleRate);
    buffer.getChannelData(0).set(float);

    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(ctx.destination);

    // Scheduling with a jitter buffer. If the cursor is still ahead of the audio
    // clock, glue this chunk straight onto the previous one (gapless). But if the
    // cursor has fallen BEHIND the clock — the first chunk, or an underrun when a
    // chunk arrived late on a jittery mobile connection — don't resume at
    // currentTime with zero runway (that just underruns again on the next late
    // chunk, and every underrun is an audible click). Instead restart JITTER_S
    // ahead of the clock to rebuild a cushion, so subsequent late chunks have
    // slack and play seamlessly.
    const startAt =
      this.nextStartTime >= ctx.currentTime
        ? this.nextStartTime
        : ctx.currentTime + JITTER_S;
    src.start(startAt);
    this.nextStartTime = startAt + buffer.duration;

    // Track so interrupt() can stop it.
    this.activeSources.add(src);
    src.onended = () => {
      this.activeSources.delete(src);
      this.checkDrained();
    };
  }

  /** Flush any pending whenDrained() resolvers once nothing is left scheduled. */
  private checkDrained(): void {
    if (this.activeSources.size === 0 && this.drainWaiters.length > 0) {
      const waiters = this.drainWaiters;
      this.drainWaiters = [];
      for (const resolve of waiters) resolve();
    }
  }

  /**
   * Resolves once all currently scheduled PCM has finished playing (no active
   * sources remain). Resolves immediately if nothing is queued. If more audio
   * is enqueued before draining completes, the wait naturally extends to
   * cover it — callers get "actually done speaking," not "done as of the
   * moment I asked."
   */
  whenDrained(): Promise<void> {
    if (this.activeSources.size === 0) {
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      this.drainWaiters.push(resolve);
    });
  }

  /**
   * Barge-in: stop all currently scheduled/playing sources immediately.
   * Resets the scheduling cursor. The context stays open for reuse.
   */
  interrupt(): void {
    for (const src of this.activeSources) {
      try {
        src.stop();
      } catch {
        // Ignore — source may have already ended.
      }
    }
    this.activeSources.clear();
    this.nextStartTime = 0;
    this.resampleState = makeResampleState();
    // stop() fires each source's onended asynchronously, but callers waiting
    // on whenDrained() should see the interrupt as "drained now" rather than
    // waiting on those async callbacks to trickle in.
    this.checkDrained();
  }

  /**
   * Stop all playback and permanently close the AudioContext.
   * Idempotent — safe to call multiple times.
   */
  async close(): Promise<void> {
    this.interrupt();
    if (this.ctx) {
      await this.ctx.close();
      this.ctx = null;
    }
  }
}
