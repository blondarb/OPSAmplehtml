/**
 * PcmPlayer — continuous playback of 24 kHz PCM16 base64 chunks.
 *
 * PRIMARY PATH (AudioWorklet): one persistent audio node streams from an
 * internal sample queue. There are no per-chunk source nodes, so there are no
 * seams — this fixes the iOS-Safari clicking (clicks on iPhone, clean on macOS)
 * that per-chunk AudioBufferSourceNode scheduling produced. Incoming 24 kHz PCM
 * is resampled to the context's native rate (carrying interpolation state across
 * chunks) and pushed into the worklet's queue.
 *
 * FALLBACK PATH (AudioBufferSourceNode scheduling): used only if the worklet
 * can't load (no AudioWorklet support, insecure context, addModule failure).
 * Each chunk is scheduled onto the audio clock with a jitter-buffer cushion.
 * This is the previous, well-exercised behaviour, so the worklet can never make
 * a supported browser worse — worst case it falls back to what shipped before.
 *
 * The public surface (enqueue / whenDrained / interrupt / close) is unchanged.
 */

import { pcmFromBase64 } from './pcm';
import { makeResampleState, resamplePcm16, type ResampleState } from './resample';
import { PCM_STREAM_WORKLET_SRC } from './pcmStreamWorklet';

const SOURCE_RATE = 24000; // Nova Sonic PCM chunk rate
// Fallback-path jitter buffer: restart this far ahead of the clock when the
// scheduling cursor falls behind, so late chunks have slack instead of clicking.
const JITTER_S = 0.18;

export class PcmPlayer {
  private ctx: AudioContext | null = null;
  private resampleState: ResampleState = makeResampleState();
  private drainWaiters: Array<() => void> = [];

  // --- worklet path ---
  private workletNode: AudioWorkletNode | null = null;
  private useWorklet = true;
  private workletSetup: Promise<void> | null = null;
  private pendingPushes: Float32Array[] = []; // buffered until the node is ready
  private workletActive = false; // audio pushed since the last drain report

  // --- diagnostics (iOS crackle instrumentation, 2026-07-11) ---
  /** Most recent stats payload seen from any worklet message carrying `.stats`
   *  ('stats' response or 'drained'). Used as a fallback when the worklet node
   *  is gone/closed, or when a fresh getStats round-trip times out. */
  private lastStats: Record<string, unknown> | null = null;
  /** One-shot resolver for an in-flight getDiagnostics() 'stats' round-trip. */
  private statsWaiter: ((stats: Record<string, unknown>) => void) | null = null;

  // --- fallback (BufferSource) path ---
  private nextStartTime = 0;
  private activeSources = new Set<AudioBufferSourceNode>();

  /** Lazily create the AudioContext on first use (constructing before a user
   *  gesture can fail on Safari/iOS). Keeps the browser's default rate. */
  private getContext(): AudioContext {
    if (!this.ctx) this.ctx = new AudioContext();
    return this.ctx;
  }

  /** Load the worklet module + node once. On any failure, drop to the fallback. */
  private ensureWorklet(ctx: AudioContext): Promise<void> {
    if (this.workletSetup) return this.workletSetup;
    this.workletSetup = (async () => {
      try {
        if (!ctx.audioWorklet) throw new Error('AudioWorklet unavailable');
        const url = URL.createObjectURL(
          new Blob([PCM_STREAM_WORKLET_SRC], { type: 'application/javascript' }),
        );
        await ctx.audioWorklet.addModule(url);
        URL.revokeObjectURL(url);
        const node = new AudioWorkletNode(ctx, 'pcm-stream');
        node.port.onmessage = (e: MessageEvent) => {
          const d = e.data;
          if (d?.stats) this.lastStats = d.stats;
          if (d?.type === 'drained') this.onWorkletDrained();
          if (d?.type === 'stats' && this.statsWaiter) {
            const waiter = this.statsWaiter;
            this.statsWaiter = null;
            waiter(d.stats);
          }
        };
        node.connect(ctx.destination);
        this.workletNode = node;
        // Flush anything buffered while the module was loading.
        for (const s of this.pendingPushes) node.port.postMessage({ type: 'push', samples: s }, [s.buffer]);
        this.pendingPushes = [];
      } catch {
        this.useWorklet = false; // fall back to BufferSource scheduling
      }
    })();
    return this.workletSetup;
  }

  private onWorkletDrained(): void {
    this.workletActive = false;
    this.flushDrainWaiters();
  }

  private flushDrainWaiters(): void {
    if (this.drainWaiters.length === 0) return;
    const waiters = this.drainWaiters;
    this.drainWaiters = [];
    for (const resolve of waiters) resolve();
  }

  /** Decode a base64 24 kHz PCM16 chunk and stream it for gapless playback. */
  enqueue(base64Pcm16At24k: string): void {
    const ctx = this.getContext();
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});

    // Resample 24 kHz → the context's native rate here, carrying state across
    // chunks so seams stay continuous (no per-chunk browser resample).
    const pcm = pcmFromBase64(base64Pcm16At24k);
    const float = resamplePcm16(pcm, SOURCE_RATE, ctx.sampleRate, this.resampleState);
    if (float.length === 0) return;

    if (this.useWorklet) {
      this.workletActive = true;
      if (this.workletNode) {
        this.workletNode.port.postMessage({ type: 'push', samples: float }, [float.buffer]);
      } else {
        this.pendingPushes.push(float);
        void this.ensureWorklet(ctx);
      }
      return;
    }

    this.scheduleFallback(ctx, float);
  }

  /** Fallback: schedule this chunk as its own buffer source, jitter-buffered. */
  private scheduleFallback(ctx: AudioContext, float: Float32Array): void {
    const buffer = ctx.createBuffer(1, float.length, ctx.sampleRate);
    buffer.getChannelData(0).set(float);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(ctx.destination);
    const startAt =
      this.nextStartTime >= ctx.currentTime ? this.nextStartTime : ctx.currentTime + JITTER_S;
    src.start(startAt);
    this.nextStartTime = startAt + buffer.duration;
    this.activeSources.add(src);
    src.onended = () => {
      this.activeSources.delete(src);
      if (this.activeSources.size === 0) this.flushDrainWaiters();
    };
  }

  /**
   * Resolves once all currently queued PCM has finished playing. Resolves
   * immediately if nothing is queued; if more audio is enqueued before draining
   * completes, the wait naturally extends to cover it.
   */
  whenDrained(): Promise<void> {
    if (this.useWorklet) {
      if (!this.workletActive) return Promise.resolve();
      return new Promise<void>((resolve) => this.drainWaiters.push(resolve));
    }
    if (this.activeSources.size === 0) return Promise.resolve();
    return new Promise<void>((resolve) => this.drainWaiters.push(resolve));
  }

  /**
   * Snapshot of playback diagnostics (worklet underrun/prime/queue counters),
   * for the iOS "crackle" investigation — instrumentation only, never affects
   * playback. Never throws and always resolves within ~350ms:
   *   - worklet path, live node: round-trips a 'getStats' request, falls back
   *     to the last-seen stats on a 300ms timeout.
   *   - worklet path, node gone/closed: returns the last-seen stats (or null
   *     if none were ever captured).
   *   - fallback (BufferSource) path: no per-chunk stats exist; returns just
   *     the path + context sample rate.
   */
  async getDiagnostics(): Promise<Record<string, unknown> | null> {
    try {
      const ctx = this.ctx;
      if (!this.useWorklet) {
        return { path: 'buffersource', contextSampleRate: ctx?.sampleRate ?? null };
      }
      const node = this.workletNode;
      if (!node) {
        return this.lastStats ? { path: 'worklet', contextSampleRate: null, ...this.lastStats } : null;
      }
      const stats = await new Promise<Record<string, unknown> | null>((resolve) => {
        let settled = false;
        const timer = setTimeout(() => {
          if (settled) return;
          settled = true;
          this.statsWaiter = null;
          resolve(this.lastStats);
        }, 300);
        this.statsWaiter = (s) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolve(s);
        };
        try {
          node.port.postMessage({ type: 'getStats' });
        } catch {
          if (!settled) {
            settled = true;
            clearTimeout(timer);
            this.statsWaiter = null;
            resolve(this.lastStats);
          }
        }
      });
      return stats ? { path: 'worklet', contextSampleRate: ctx?.sampleRate ?? null, ...stats } : null;
    } catch {
      return null;
    }
  }

  /** Barge-in: drop all queued/playing audio immediately; context stays open. */
  interrupt(): void {
    this.workletNode?.port.postMessage({ type: 'clear' });
    this.workletActive = false;
    this.pendingPushes = [];
    for (const src of this.activeSources) {
      try { src.stop(); } catch { /* already ended */ }
    }
    this.activeSources.clear();
    this.nextStartTime = 0;
    this.resampleState = makeResampleState();
    this.flushDrainWaiters();
  }

  /** Stop everything and permanently close the AudioContext. Idempotent. */
  async close(): Promise<void> {
    this.interrupt();
    if (this.workletNode) {
      try { this.workletNode.disconnect(); } catch { /* already gone */ }
      this.workletNode = null;
    }
    if (this.ctx) {
      await this.ctx.close();
      this.ctx = null;
    }
  }
}
