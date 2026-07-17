import { drawGraticule } from './graticule';

export interface XyPreviewOptions {
  /** How much the background fades toward black each frame (0..1, higher = faster decay). */
  decay?: number;
  color?: string;
  /** Floor for how dim a fast (e.g. travel) segment can get, 0..1. */
  minIntensity?: number;
}

export interface XyBuffer {
  left: Float32Array;
  right: Float32Array;
  /** Relative beam brightness per sample (0..1) — see engine's SampleBuffer. */
  intensity: Float32Array;
}

function hexToRgb(hex: string): [number, number, number] {
  const match = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!match) return [124, 252, 156];
  return [parseInt(match[1], 16), parseInt(match[2], 16), parseInt(match[3], 16)];
}

export class XyPreview {
  private ctx: CanvasRenderingContext2D;
  private raf: number | null = null;
  private buffer: XyBuffer | null = null;
  private decay: number;
  private rgb: [number, number, number];
  private minIntensity: number;

  // The buffer is exactly one period; periodMs and cursor let drawFrame pace
  // the sweep to real elapsed time instead of instantly stamping the whole
  // shape every animation frame.
  private periodMs = 1000 / 220;
  private cursor = 0;
  private lastFrameTime: number | null = null;

  constructor(private canvas: HTMLCanvasElement, options: XyPreviewOptions = {}) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas context unavailable');
    this.ctx = ctx;
    this.decay = options.decay ?? 0.08;
    this.rgb = hexToRgb(options.color ?? '#7CFC9C');
    this.minIntensity = options.minIntensity ?? 0.05;
  }

  setBuffer(buffer: XyBuffer, traceHz: number): void {
    this.buffer = buffer;
    this.periodMs = 1000 / traceHz;
    this.cursor = 0;
  }

  // Jumps the sweep position within the current buffer (0..1) — for
  // scrubbing through passthrough audio without resetting to the start.
  seekTo(fraction: number): void {
    if (!this.buffer || this.buffer.left.length === 0) return;
    this.cursor = Math.floor(fraction * this.buffer.left.length) % this.buffer.left.length;
  }

  start(): void {
    if (this.raf !== null) return;
    const loop = (now: number) => {
      this.drawFrame(now);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop(): void {
    if (this.raf !== null) {
      cancelAnimationFrame(this.raf);
      this.raf = null;
    }
    this.lastFrameTime = null;
  }

  private drawFrame(now: number): void {
    const { ctx, canvas } = this;
    ctx.fillStyle = `rgba(0, 0, 0, ${this.decay})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    drawGraticule(ctx, canvas.width, canvas.height);

    if (!this.buffer || this.buffer.left.length === 0) {
      this.lastFrameTime = now;
      return;
    }

    if (this.lastFrameTime === null) this.lastFrameTime = now;
    const deltaMs = now - this.lastFrameTime;
    this.lastFrameTime = now;

    const { left, right, intensity } = this.buffer;
    const len = left.length;
    // Cap at one full lap per frame: at high trace rates several periods can
    // elapse between two 60fps frames, but re-drawing the identical shape
    // more than once would be wasted work with no visual difference.
    const samplesAdvanced = Math.min(len, Math.ceil((deltaMs / this.periodMs) * len));

    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    const scale = Math.min(canvas.width, canvas.height) / 2.2;
    const [r, g, b] = this.rgb;

    ctx.lineWidth = 1.5;
    let prevX = cx + left[this.cursor] * scale;
    let prevY = cy - right[this.cursor] * scale;

    for (let i = 1; i <= samplesAdvanced; i++) {
      const idx = (this.cursor + i) % len;
      const x = cx + left[idx] * scale;
      const y = cy - right[idx] * scale;
      const alpha = Math.max(this.minIntensity, intensity[idx]);

      ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;
      ctx.beginPath();
      ctx.moveTo(prevX, prevY);
      ctx.lineTo(x, y);
      ctx.stroke();

      prevX = x;
      prevY = y;
    }

    this.cursor = (this.cursor + samplesAdvanced) % len;
  }
}
