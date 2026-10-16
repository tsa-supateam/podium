// AudioWorklet: batch the mic into 20 ms float32 frames for the engine.
// Loaded from 'self' so the Content-Security-Policy needs no blob: or inline scripts.
class PcmCapture extends AudioWorkletProcessor {
  constructor() {
    super();
    this.frame = Math.round(sampleRate * 0.02);
    this.buf = new Float32Array(this.frame);
    this.n = 0;
  }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (ch) {
      for (let i = 0; i < ch.length; i++) {
        this.buf[this.n++] = ch[i];
        if (this.n === this.frame) {
          this.port.postMessage(this.buf.buffer, [this.buf.buffer]);
          this.buf = new Float32Array(this.frame);
          this.n = 0;
        }
      }
    }
    return true;
  }
}
registerProcessor("pcm-capture", PcmCapture);
