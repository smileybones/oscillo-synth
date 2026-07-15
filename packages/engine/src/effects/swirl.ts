import type { Effect } from './effect';

export interface SwirlParams {
  amount?: number;
  speed?: number;
}

// Rotates each point progressively more the farther it is from center,
// twisting the shape into a vortex. `speed` rotates the whole swirl over
// time; leave at 0 for a static twist.
export function createSwirlEffect(params: SwirlParams): Effect {
  return {
    name: 'swirl',
    processPaths(paths, ctx) {
      const amount = params.amount ?? 1;
      const speed = params.speed ?? 0;
      const timeOffset = ctx.t * speed;

      return paths.map((path) => ({
        ...path,
        points: path.points.map((p) => {
          const distance = Math.hypot(p.x, p.y);
          const angle = Math.atan2(p.y, p.x) + distance * amount + timeOffset;
          return { x: Math.cos(angle) * distance, y: Math.sin(angle) * distance };
        }),
      }));
    },
  };
}
