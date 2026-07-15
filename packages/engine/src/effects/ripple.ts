import type { Effect } from './effect';

export interface RippleParams {
  depth?: number;
  frequency?: number;
  speed?: number;
}

// Radially displaces each point based on its distance from center, like a
// wave spreading outward — `speed` slides the phase over time, so leave it
// at 0 for a static ripple, or nonzero to animate it.
export function createRippleEffect(params: RippleParams): Effect {
  return {
    name: 'ripple',
    processPaths(paths, ctx) {
      const depth = params.depth ?? 0.1;
      const frequency = params.frequency ?? 10;
      const speed = params.speed ?? 0;
      const phase = ctx.t * speed;

      return paths.map((path) => ({
        ...path,
        points: path.points.map((p) => {
          const distance = Math.hypot(p.x, p.y);
          const angle = Math.atan2(p.y, p.x);
          const newDistance = distance + depth * Math.sin(distance * frequency - phase);
          return { x: Math.cos(angle) * newDistance, y: Math.sin(angle) * newDistance };
        }),
      }));
    },
  };
}
