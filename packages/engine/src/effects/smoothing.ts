import type { Path } from '../geometry/path';
import type { Vec2 } from '../geometry/vec2';
import type { Effect } from './effect';

export interface SmoothingParams {
  amount?: number;
  iterations?: number;
}

// Blends each point toward the midpoint of its neighbors, softening sharp
// corners — purely geometric and time-independent, so it's cheap and never
// needs the continuous-render loop. Handles closed paths' wraparound and
// open paths' boundaries separately.
export function createSmoothingEffect(params: SmoothingParams): Effect {
  return {
    name: 'smoothing',
    processPaths(paths) {
      const amount = Math.max(0, Math.min(1, params.amount ?? 0.5));
      const iterations = Math.max(0, Math.round(params.iterations ?? 1));
      return paths.map((path) => smoothPath(path, amount, iterations));
    },
  };
}

function smoothPath(path: Path, amount: number, iterations: number): Path {
  const n = path.points.length;
  if (n < 3 || iterations === 0) return path;

  let points = path.points;
  for (let iter = 0; iter < iterations; iter++) {
    const next: Vec2[] = new Array(n);
    for (let i = 0; i < n; i++) {
      // Anchor an open path's endpoints — otherwise they'd drift inward
      // each iteration, shrinking the shape from its tips instead of just
      // softening the corners in between.
      if (!path.closed && (i === 0 || i === n - 1)) {
        next[i] = points[i];
        continue;
      }
      const prevIndex = path.closed ? (i - 1 + n) % n : i - 1;
      const nextIndex = path.closed ? (i + 1) % n : i + 1;
      const prev = points[prevIndex];
      const curr = points[i];
      const nxt = points[nextIndex];
      const avgX = (prev.x + nxt.x) / 2;
      const avgY = (prev.y + nxt.y) / 2;
      next[i] = { x: curr.x + (avgX - curr.x) * amount, y: curr.y + (avgY - curr.y) * amount };
    }
    points = next;
  }

  return { ...path, points };
}
