import type { Effect } from './effect';

export interface TransformParams {
  rotate?: number;
  scale?: number;
  translateX?: number;
  translateY?: number;
}

export function createTransformEffect(params: TransformParams): Effect {
  return {
    name: 'transform',
    processPaths(paths) {
      const rotate = params.rotate ?? 0;
      const scale = params.scale ?? 1;
      const translateX = params.translateX ?? 0;
      const translateY = params.translateY ?? 0;
      const cos = Math.cos(rotate);
      const sin = Math.sin(rotate);

      return paths.map((path) => ({
        ...path,
        points: path.points.map((p) => {
          const sx = p.x * scale;
          const sy = p.y * scale;
          return {
            x: sx * cos - sy * sin + translateX,
            y: sx * sin + sy * cos + translateY,
          };
        }),
      }));
    },
  };
}
