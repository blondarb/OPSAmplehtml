/**
 * AudioWorkletProcessor: pcm-capture
 *
 * Runs inside the AudioWorklet global scope (no imports allowed).
 * Receives mono 128-sample Float32 quanta from Web Audio and forwards
 * a copy to the main thread via port.postMessage.
 *
 * The copy is mandatory — the underlying buffer backing inputs[0][0]
 * is reused by the engine on the next render quantum; posting the
 * original reference would deliver garbage by the time the main thread
 * reads it.
 */
class PcmCaptureProcessor extends AudioWorkletProcessor {
  /**
   * @param {Float32Array[][]} inputs  - inputs[0][0] is the mono channel
   * @param {Float32Array[][]} _outputs - unused
   * @returns {boolean} true — keep processor alive
   */
  process(inputs) {
    const channel = inputs[0]?.[0];
    if (channel && channel.length > 0) {
      // Copy before posting — the engine reuses the buffer each quantum.
      this.port.postMessage(new Float32Array(channel));
    }
    return true;
  }
}

registerProcessor('pcm-capture', PcmCaptureProcessor);
