import type { Path } from '../geometry/path';
import { distance } from '../geometry/vec2';

// True nearest-neighbor is O(n^2) — fine for a handful of shape layers, but
// a mesh's faces are each their own Path, and real-world models can easily
// have thousands of them (5,000 faces already takes ~340ms, 10,000 over a
// full second — measured directly). Past this threshold we fall back to a
// cheap O(n log n) approximation instead of blocking the render loop.
const NEAREST_NEIGHBOR_MAX_PATHS = 500;

// Nearest-neighbor reordering to minimize pen-up travel between paths, since we
// can't assume the scope has a Z-axis/blanking input to hide travel lines.
export function optimizeTravelOrder(paths: Path[]): Path[] {
  if (paths.length <= 1) return paths;
  if (paths.length > NEAREST_NEIGHBOR_MAX_PATHS) {
    return spatialSortPaths(paths);
  }

  const remaining = [...paths];
  const ordered: Path[] = [];
  let current = remaining.shift()!;
  ordered.push(current);
  let cursor = current.points[current.points.length - 1];

  while (remaining.length > 0) {
    let bestIndex = 0;
    let bestDistance = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const d = distance(cursor, remaining[i].points[0]);
      if (d < bestDistance) {
        bestDistance = d;
        bestIndex = i;
      }
    }
    current = remaining.splice(bestIndex, 1)[0];
    ordered.push(current);
    cursor = current.points[current.points.length - 1];
  }

  return ordered;
}

// Boustrophedon (serpentine) sort: bucket paths into horizontal bands by
// their start point, then sort each band by x, alternating direction band
// to band. This is the standard cheap fallback used in pen-plotter/laser
// toolpath optimization when true nearest-neighbor is too slow — it doesn't
// minimize travel as well, but keeps it low with one O(n log n) sort
// instead of an O(n^2) search.
function spatialSortPaths(paths: Path[]): Path[] {
  const bandCount = Math.max(1, Math.ceil(Math.sqrt(paths.length)));

  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of paths) {
    minY = Math.min(minY, p.points[0].y);
    maxY = Math.max(maxY, p.points[0].y);
  }
  const bandHeight = (maxY - minY || 1) / bandCount;

  return paths
    .map((path) => {
      const start = path.points[0];
      const band = Math.min(bandCount - 1, Math.floor((start.y - minY) / bandHeight));
      return { path, band, x: start.x };
    })
    .sort((a, b) => (a.band !== b.band ? a.band - b.band : a.band % 2 === 0 ? a.x - b.x : b.x - a.x))
    .map((entry) => entry.path);
}
