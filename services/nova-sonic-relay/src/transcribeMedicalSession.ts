// ---------------------------------------------------------------------------
// TranscribeMedicalSession — OPTIONAL, flag-gated accuracy aid.
//
// Runs AWS Transcribe Medical streaming transcription in PARALLEL on the same
// caller audio Nova Sonic already receives, so spoken identifiers (MRN/name/
// DOB) — which Nova Sonic (speech-to-speech) is prone to dropping digits
// from — get a second, higher-accuracy transcript to compare against. This
// is v1: capture + emit + log only. It never talks back into the Nova
// conversation and never influences Clara's behavior.
//
// FAIL-SAFE CONTRACT: nothing in this class may ever throw out to the
// caller. Any AWS/network/auth error routes through onError (fired at most
// once) and the session goes permanently inert (`dead`) — pushAudio()
// becomes a no-op and the Nova Sonic call continues completely unaffected,
// whether this class ever succeeds, fails, or is never even started.
// ---------------------------------------------------------------------------

import {
  TranscribeStreamingClient,
  StartMedicalStreamTranscriptionCommand,
  type StartMedicalStreamTranscriptionCommandOutput,
} from '@aws-sdk/client-transcribe-streaming'

import { REGION } from './audioConstants.js'

export interface TranscribeMedicalCallbacks {
  onTranscript(text: string, isPartial: boolean): void
  onError?(err: unknown): void
}

/** One chunk of the AudioStream union accepted by StartMedicalStreamTranscriptionCommand. */
type AudioStreamChunk = { AudioEvent: { AudioChunk: Buffer } }

export class TranscribeMedicalSession {
  private readonly client: TranscribeStreamingClient
  private readonly callbacks: TranscribeMedicalCallbacks

  // Input queue + generator wake-up handle — same wake-on-enqueue
  // async-generator pattern as NovaSonicSession's inputStream().
  private readonly queue: Buffer[] = []
  private pendingResolve: (() => void) | null = null

  private active = false
  private closed = false

  // Once true, this session is permanently inert: pushAudio() no-ops and no
  // further AWS calls are attempted. Set on any client.send()/stream failure.
  private dead = false
  private errorFired = false

  // The fire-and-forget transcript-consume loop, stored so stop() can
  // best-effort await it (mirrors NovaSonicSession.responseLoop).
  private consumeLoop: Promise<void> | null = null

  constructor(callbacks: TranscribeMedicalCallbacks) {
    this.callbacks = callbacks
    this.client = new TranscribeStreamingClient({ region: REGION })
  }

  // -------------------------------------------------------------------------
  // Queue plumbing
  // -------------------------------------------------------------------------

  /**
   * The single async iterable consumed by the Transcribe command's
   * AudioStream input. Parks on a promise whenever the queue is empty and
   * wakes on pushAudio()/stop() — identical shape to NovaSonicSession's
   * inputStream() lost-wakeup guard.
   */
  private async *audioStream(): AsyncGenerator<AudioStreamChunk> {
    while (this.active || this.queue.length > 0) {
      if (this.queue.length > 0) {
        yield { AudioEvent: { AudioChunk: this.queue.shift()! } }
        continue
      }
      if (this.closed) {
        break
      }
      await new Promise<void>((resolve) => {
        this.pendingResolve = resolve
        // Guard against a lost wakeup: if audio was pushed (or stop() ran)
        // between the queue-empty check above and this assignment, resolve
        // immediately instead of parking on a stale promise.
        if (this.queue.length > 0 || this.closed) {
          this.pendingResolve = null
          resolve()
        }
      })
    }
  }

  /** Route an error to onError at most once, then leave the session inert. */
  private fireError(e: unknown): void {
    if (this.errorFired) {
      return
    }
    this.errorFired = true
    this.callbacks.onError?.(e)
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  /**
   * Open the Transcribe Medical stream and fire-and-forget the
   * transcript-consume loop. Never rejects — any failure to open the stream
   * (bad IAM, wrong region, quota) is routed to onError and the session goes
   * inert; the caller's .catch(() => {}) is just a belt-and-suspenders
   * unhandled-rejection guard, not the real error path.
   */
  async start(): Promise<void> {
    if (this.active || this.closed || this.dead) {
      return
    }

    this.active = true

    let response: StartMedicalStreamTranscriptionCommandOutput
    try {
      response = await this.client.send(
        new StartMedicalStreamTranscriptionCommand({
          LanguageCode: 'en-US',
          MediaSampleRateHertz: 16000,
          MediaEncoding: 'pcm',
          Specialty: 'PRIMARYCARE',
          Type: 'CONVERSATION',
          AudioStream: this.audioStream(),
        }),
      )
    } catch (e) {
      // send() failed to open the stream — go permanently inert. Deliberately
      // swallowed (not rethrown): this class must never fail the caller's
      // start() sequence, which also starts the Nova Sonic session.
      this.active = false
      this.dead = true
      this.fireError(e)
      return
    }

    this.consumeLoop = this.runConsumeLoop(response)
    this.consumeLoop.catch(() => {})
  }

  /** Enqueue one chunk of caller audio (base64 PCM16 @16kHz mono). No-op if inert or not started. */
  pushAudio(base64Pcm16: string): void {
    // Mirrors NovaSonicSession.pushAudio's active-gate: no-op before start()
    // (the stream was never opened, nothing is consuming the queue), after
    // stop() (closed), or once a send()/stream failure has marked us dead.
    if (this.dead || this.closed || !this.active) {
      return
    }
    this.queue.push(Buffer.from(base64Pcm16, 'base64'))
    if (this.pendingResolve) {
      const resolve = this.pendingResolve
      this.pendingResolve = null
      resolve()
    }
  }

  /**
   * Gracefully close the stream: idempotent, wakes the generator so it can
   * return, then best-effort awaits the consume loop.
   */
  async stop(): Promise<void> {
    if (this.closed) {
      return
    }

    this.closed = true
    this.active = false

    if (this.pendingResolve) {
      const resolve = this.pendingResolve
      this.pendingResolve = null
      resolve()
    }

    if (this.consumeLoop) {
      try {
        await this.consumeLoop
      } catch {
        // runConsumeLoop reports its own errors via onError; swallow here.
      }
    }
  }

  // -------------------------------------------------------------------------
  // Transcript-consume loop
  // -------------------------------------------------------------------------

  private async runConsumeLoop(response: StartMedicalStreamTranscriptionCommandOutput): Promise<void> {
    try {
      if (!response.TranscriptResultStream) {
        return
      }
      for await (const event of response.TranscriptResultStream) {
        const transcriptEvent = event.TranscriptEvent
        if (!transcriptEvent) {
          continue
        }
        const results = transcriptEvent.Transcript?.Results ?? []
        for (const result of results) {
          const transcript = result.Alternatives?.[0]?.Transcript
          if (transcript) {
            this.callbacks.onTranscript(transcript, result.IsPartial === true)
          }
        }
      }
    } catch (e) {
      this.dead = true
      this.fireError(e)
    } finally {
      this.active = false
    }
  }
}
