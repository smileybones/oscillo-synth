import { drawGraticule } from './graticule';

// Classic time-domain oscilloscope trace (amplitude vs. time, one channel) —
// the "this is what a sawtooth/sine/noise wave actually looks like" view,
// as opposed to XyPreview's X/Y Lissajous-art plot of two channels against
// each other. Reads live from an AnalyserNode rather than a precomputed
// buffer, since the synth generates audio continuously inside a worklet
// rather than one period at a time like the shape-tracing pipeline.
export class WaveformPreview {
  private ctx: CanvasRenderingContext2D;
  private raf: number | null = null;
  private analyser: AnalyserNode | null = null;
  private buffer = new Float32Array(2048);

  constructor(private canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas context unavailable');
    this.ctx = ctx;
  }

  setAnalyser(analyser: AnalyserNode | null): void {
    this.analyser = analyser;
    if (analyser && this.buffer.length !== analyser.fftSize) {
      this.buffer = new Float32Array(analyser.fftSize);
    }
  }

  start(): void {
    if (this.raf !== null) return;
    const loop = () => {
      this.drawFrame();
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop(): void {
    if (this.raf !== null) {
      cancelAnimationFrame(this.raf);
      this.raf = null;
    }
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  private drawFrame(): void {
    const { ctx, canvas } = this;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    drawGraticule(ctx, canvas.width, canvas.height);

    if (!this.analyser) return;
    this.analyser.getFloatTimeDomainData(this.buffer);

    const triggerIndex = findRisingEdgeTrigger(this.buffer);
    const usableLength = this.buffer.length - triggerIndex;
    if (usableLength < 2) return;

    ctx.strokeStyle = '#7cfc9c';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let i = 0; i < usableLength; i++) {
      const sample = this.buffer[triggerIndex + i];
      const x = (i / (usableLength - 1)) * canvas.width;
      const y = canvas.height / 2 - sample * (canvas.height / 2) * 0.9;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
}

// Finds the first rising zero-crossing in the first half of the buffer, so a
// periodic waveform (sawtooth/sine/square) starts at the same phase every
// frame and reads as a stable shape instead of jittering left-right — the
// same "trigger" concept a real oscilloscope uses to lock a repeating signal
// in place. Falls back to the start of the buffer for silence/noise, where
// there's no stable edge to lock onto anyway.
function findRisingEdgeTrigger(buffer: Float32Array): number {
  const searchEnd = Math.floor(buffer.length / 2);
  for (let i = 1; i < searchEnd; i++) {
    if (buffer[i - 1] <= 0 && buffer[i] > 0) return i;
  }
  return 0;
}
