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

export class PcmPlayer {
  private ctx: AudioContext | null = null;
  private nextStartTime = 0;
  private activeSources = new Set<AudioBufferSourceNode>();

  /** Lazily create the AudioContext on first use. */
  private getContext(): AudioContext {
    if (!this.ctx) {
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

    // Decode PCM16 → Float32 in [-1, 1].
    const pcm = pcmFromBase64(base64Pcm16At24k);
    const float = new Float32Array(pcm.length);
    for (let i = 0; i < pcm.length; i++) {
      float[i] = pcm[i] / 32768;
    }

    // Build an AudioBuffer at 24 kHz. The AudioContext will resample to its
    // own output rate (e.g. 48 kHz) transparently on playback.
    const buffer = ctx.createBuffer(1, float.length, 24000);
    buffer.getChannelData(0).set(float);

    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(ctx.destination);

    // Gapless scheduling: glue this chunk immediately after the previous one.
    const startAt = Math.max(ctx.currentTime, this.nextStartTime);
    src.start(startAt);
    this.nextStartTime = startAt + buffer.duration;

    // Track so interrupt() can stop it.
    this.activeSources.add(src);
    src.onended = () => {
      this.activeSources.delete(src);
    };
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
