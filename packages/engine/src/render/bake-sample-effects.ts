import type { Path } from '../geometry/path';
import type { EffectChain } from '../effects/chain';
import type { EffectContext } from '../effects/effect';
import { resamplePathToSamples } from './interpolation';

// Sample-stage effects (Bitcrush) are meaningless applied to a path's sparse
// vertices — quantizing just the vertices and letting the render pipeline's
// later resampling linearly interpolate between them would smooth the
// quantization "steps" right back out, since two already-quantized points
// joined by a straight line just draws a straight line, not a staircase.
//
// Instead, this densely resamples the path FIRST (so the quantization has
// enough points to actually show as steps) and quantizes each of those
// points — producing a new Path whose geometry itself encodes the staircase
// shape. Any later resampling (to fit the final per-frame sample budget)
// then just walks that same staircase at a different point density —
// interpolation stays on the shape's straight edges either way, so the
// steps survive being resampled again downstream.
const BAKE_POINTS_PER_EDGE = 64;

export function bakeSampleEffectsIntoPath(path: Path, chain: EffectChain, ctx: EffectContext): Path {
  const edgeCount = Math.max(1, path.closed ? path.points.length : path.points.length - 1);
  const dense = resamplePathToSamples(path, edgeCount * BAKE_POINTS_PER_EDGE);
  const points = dense.map((p) => {
    const [x, y] = chain.applyToSample(p.x, p.y, ctx);
    return { x, y };
  });
  return { points, closed: path.closed };
}