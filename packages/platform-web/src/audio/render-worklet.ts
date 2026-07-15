type WorkletMessage =
  | { type: 'buffer'; left: Float32Array<ArrayBufferLike>; right: Float32Array<ArrayBufferLike> }
  | { type: 'seek'; fraction: number };

class RenderWorkletProcessor extends AudioWorkletProcessor {
  private left: Float32Array<ArrayBufferLike> = new Float32Array(0);
  private right: Float32Array<ArrayBufferLike> = new Float32Array(0);
  private readIndex = 0;

  constructor() {
    super();
    this.port.onmessage = (event: MessageEvent<WorkletMessage>) => {
      if (event.data.type === 'buffer') {
        this.left = event.data.left;
        this.right = event.data.right;
        this.readIndex = 0;
      } else {
        // Seeking within the currently loaded buffer, without reloading it —
        // used for scrubbing through a passthrough audio file.
        const len = this.left.length;
        this.readIndex = len === 0 ? 0 : Math.floor(event.data.fraction * len) % len;
      }
    };
  }

  process(_inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const output = outputs[0];
    const outL = output[0];
    const outR = output[1] ?? output[0];
    const len = this.left.length;

    for (let i = 0; i < outL.length; i++) {
      if (len === 0) {
        outL[i] = 0;
        outR[i] = 0;
        continue;
      }
      outL[i] = this.left[this.readIndex];
      outR[i] = this.right[this.readIndex];
      this.readIndex = (this.readIndex + 1) % len;
    }

    return true;
  }
}

registerProcessor('render-worklet-processor', RenderWorkletProcessor);
