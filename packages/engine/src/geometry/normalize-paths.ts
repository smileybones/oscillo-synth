import type { Path } from './path';

// Font/SVG coordinates live in arbitrary pixel-ish units with Y pointing
// down. Normalize the whole set into roughly [-1, 1] (matching the other
// sources) so multiple paths keep their relative scale and position, and
// flip Y to match the preview/scope's Y-up convention.
export function normalizePaths(paths: Path[]): Path[] {
  if (paths.length === 0) return paths;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const path of paths) {
    for (const p of path.points) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }
  }

  const width = maxX - minX || 1;
  const height = maxY - minY || 1;
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const scale = 2 / Math.max(width, height);

  return paths.map((path) => ({
    ...path,
    points: path.points.map((p) => ({
      x: (p.x - cx) * scale,
      y: -(p.y - cy) * scale,
    })),
  }));
}
