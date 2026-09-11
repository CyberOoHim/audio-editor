class StudioCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.paused = false;
    this.bufferSize = 4096;
    this.filled = 0;
    this.left = new Float32Array(this.bufferSize);
    this.right = new Float32Array(this.bufferSize);
    this.port.onmessage = (event) => {
      const type = event.data && event.data.type;
      if (type === 'pause') this.paused = true;
      if (type === 'resume') this.paused = false;
      if (type === 'flush') {
        this.flush();
        this.port.postMessage({ type: 'flushed' });
      }
    };
  }

  flush() {
    if (this.filled <= 0) return;
    const ch0 = this.left.slice(0, this.filled);
    const ch1 = this.right.slice(0, this.filled);
    this.filled = 0;
    this.port.postMessage({ type: 'chunk', ch0, ch1 }, [ch0.buffer, ch1.buffer]);
  }

  process(inputs) {
    if (this.paused) return true;
    const channels = inputs[0];
    if (!channels || !channels[0]) return true;

    const inputL = channels[0];
    const inputR = channels[1] || inputL;
    let offset = 0;
    const len = inputL.length;

    while (offset < len) {
      const space = this.bufferSize - this.filled;
      const copy = Math.min(space, len - offset);
      this.left.set(inputL.subarray(offset, offset + copy), this.filled);
      this.right.set(inputR.subarray(offset, offset + copy), this.filled);
      this.filled += copy;
      offset += copy;

      if (this.filled >= this.bufferSize) {
        const ch0 = this.left;
        const ch1 = this.right;
        this.left = new Float32Array(this.bufferSize);
        this.right = new Float32Array(this.bufferSize);
        this.filled = 0;
        this.port.postMessage({ type: 'chunk', ch0, ch1 }, [ch0.buffer, ch1.buffer]);
      }
    }

    return true;
  }
}

registerProcessor('studio-capture', StudioCaptureProcessor);
