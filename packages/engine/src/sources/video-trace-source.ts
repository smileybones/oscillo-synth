import type { Path } from '../geometry/path';
import type { Source } from './source';
import { tracePixelsToPaths, type PixelBuffer, type TracePixelsOptions } from '../render/trace-pixels';

// Takes a plain pixel-fetching callback rather than a concrete video/canvas
// object, so engine stays platform-agnostic — platform-web supplies the
// actual DOM-backed frame grabber. Unlike every other source, the content
// here isn't a function of `t`; it's whatever the callback currently
// returns, since video playback position lives outside the engine.
export class VideoTraceSource implements Source {
  constructor(
    private getFramePixels: () => PixelBuffer | null,
    private options: TracePixelsOptions = {},
  ) {}

  render(_t: number): Path[] {
    const pixels = this.getFramePixels();
    if (!pixels) return [];
    return tracePixelsToPaths(pixels, this.options);
  }
}
