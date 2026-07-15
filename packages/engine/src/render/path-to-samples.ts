import type { Path } from '../geometry/path';
import type { Vec2 } from '../geometry/vec2';
import { resamplePathToSamples } from './interpolation';
import { optimizeTravelOrder } from './travel-optimizer';

export interface RenderConfig {
  sampleRate: number;
  /** How many times per second the full set of paths is traced (becomes the audible pitch). */
  frameRate: number;
  /** Fixed sample count for each pen-up travel segment between paths. */
  travelSamples: number;
}

export interface SampleBuffer {
  left: Float32Array;
  right: Float32Array;
  /**
   * Relative beam brightness per sample (0..1), derived from point-to-point
   * speed. A real CRT beam dwells longer — and so looks brighter — on slow
   * segments; fast travel between disconnected paths covers more distance
   * per sample and should look dim, the same way it would on unblanked
   * analog hardware. Consumers (e.g. the preview) can use this to fade
   * travel lines instead of drawing them at full strength.
   */
  intensity: Float32Array;
}

function endPoint(path: Path): Vec2 {
  // A closed path's beam ends back where it started.
  return path.closed ? path.points[0] : path.points[path.points.length - 1];
}

export function renderPathsToSamples(paths: Path[], config: RenderConfig): SampleBuffer {
  const ordered = optimizeTravelOrder(paths);

  if (ordered.length === 0) {
    return { left: new Float32Array(0), right: new Float32Array(0), intensity: new Float32Array(0) };
  }

  const totalSamples = Math.floor(config.sampleRate / config.frameRate);
  const travelSamples = config.travelSamples;
  const drawSamplesPerPath = Math.max(
    1,
    Math.floor((totalSamples - travelSamples * ordered.length) / ordered.length),
  );

  const out: Vec2[] = [];
  // Start the cursor where the last path in the order ends, so the buffer loops
  // seamlessly when the AudioWorklet wraps back to sample 0.
  let cursor = endPoint(ordered[ordered.length - 1]);

  for (const path of ordered) {
    const start = path.points[0];
    for (let i = 0; i < travelSamples; i++) {
      const t = i / travelSamples;
      out.push({
        x: cursor.x + (start.x - cursor.x) * t,
        y: cursor.y + (start.y - cursor.y) * t,
      });
    }
    out.push(...resamplePathToSamples(path, drawSamplesPerPath));
    cursor = endPoint(path);
  }

  const left = new Float32Array(out.length);
  const right = new Float32Array(out.length);
  const stepDistance = new Float32Array(out.length);
  let maxDistance = 0;

  for (let i = 0; i < out.length; i++) {
    left[i] = out[i].x;
    right[i] = out[i].y;
    const prev = out[i === 0 ? out.length - 1 : i - 1];
    const dist = Math.hypot(out[i].x - prev.x, out[i].y - prev.y);
    stepDistance[i] = dist;
    maxDistance = Math.max(maxDistance, dist);
  }

  const intensity = new Float32Array(out.length);
  for (let i = 0; i < out.length; i++) {
    intensity[i] = maxDistance === 0 ? 1 : 1 - stepDistance[i] / maxDistance;
  }

  return { left, right, intensity };
}
