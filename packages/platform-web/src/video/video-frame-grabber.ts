// Structurally identical to engine's PixelBuffer (same shape as ImageData) —
// duplicated rather than imported to keep platform-web decoupled from
// engine, matching the XyBuffer/SampleBuffer pattern used elsewhere.
export interface PixelBuffer {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

// Draws the current video frame onto a small offscreen canvas and reads the
// pixels back. Downsampling happens for free via drawImage's built-in
// scaling — engine's tracer expects an already-small frame, since running
// Sobel + marching squares at full video resolution every tick would be
// unnecessary work for what's meant to be stylized line art anyway.
export class VideoFrameGrabber {
  private video: HTMLVideoElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private objectUrl: string | null = null;

  constructor(
    private sampleWidth = 64,
    private sampleHeight = 64,
  ) {
    this.video = document.createElement('video');
    this.video.muted = true;
    this.video.loop = true;
    this.video.playsInline = true;

    this.canvas = document.createElement('canvas');
    this.canvas.width = sampleWidth;
    this.canvas.height = sampleHeight;
    const ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('2D canvas context unavailable');
    this.ctx = ctx;
  }

  async loadFile(file: File): Promise<void> {
    if (this.objectUrl) URL.revokeObjectURL(this.objectUrl);
    this.objectUrl = URL.createObjectURL(file);
    this.video.src = this.objectUrl;
    await new Promise<void>((resolve, reject) => {
      // If the browser can't decode this file at all (unsupported
      // format/codec), 'loadedmetadata' never fires — without the 'error'
      // listener this would hang forever instead of surfacing a failure.
      this.video.onloadedmetadata = () => resolve();
      this.video.onerror = () => {
        const code = this.video.error?.code;
        reject(new Error(`Browser could not decode this video file (media error code ${code ?? 'unknown'})`));
      };
    });
    // Autoplay may be blocked until a user gesture elsewhere on the page —
    // that's fine, frames just won't advance until play() succeeds.
    await this.video.play().catch(() => {});
  }

  getFramePixels(): PixelBuffer | null {
    if (this.video.readyState < this.video.HAVE_CURRENT_DATA) return null;
    this.ctx.drawImage(this.video, 0, 0, this.sampleWidth, this.sampleHeight);
    const imageData = this.ctx.getImageData(0, 0, this.sampleWidth, this.sampleHeight);
    return { width: this.sampleWidth, height: this.sampleHeight, data: imageData.data };
  }

  get duration(): number {
    return this.video.duration || 0;
  }

  get currentTime(): number {
    return this.video.currentTime;
  }

  get paused(): boolean {
    return this.video.paused;
  }

  seekTo(fraction: number): void {
    if (this.video.duration) this.video.currentTime = fraction * this.video.duration;
  }

  play(): void {
    void this.video.play();
  }

  pause(): void {
    this.video.pause();
  }

  dispose(): void {
    this.pause();
    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = null;
    }
  }
}
