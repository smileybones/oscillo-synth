import type { Path } from '../geometry/path';
import type { Effect } from './effect';

export interface KaleidoscopeParams {
  segments?: number;
  mirror?: boolean;
}

// Repeats every path around a circle, alternating mirrored copies for true
// kaleidoscope symmetry. Multiplies the total path count by `segments`, so
// it should generally go near the end of the effects chain — the
// travel-optimizer's O(n log n) fallback (see travel-optimizer.ts) keeps
// this fast even for already-complex scenes.
export function createKaleidoscopeEffect(params: KaleidoscopeParams): Effect {
  return {
    name: 'kaleidoscope',
    processPaths(paths) {
      const segments = Math.max(1, Math.round(params.segments ?? 6));
      const mirror = params.mirror ?? true;
      const result: Path[] = [];

      for (let s = 0; s < segments; s++) {
        const angle = (s / segments) * Math.PI * 2;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const flip = mirror && s % 2 === 1;

        for (const path of paths) {
          result.push({
            ...path,
            points: path.points.map((p) => {
              const x = flip ? -p.x : p.x;
              return { x: x * cos - p.y * sin, y: x * sin + p.y * cos };
            }),
          });
        }
      }

      return result;
    },
  };
}
