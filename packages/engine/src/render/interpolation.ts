import type { Path } from '../geometry/path';
import type { Vec2 } from '../geometry/vec2';

// Smoothstep-like easing between vertices, avoiding sharp velocity discontinuities at corners.
export function quinticEase(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

export function resamplePathToSamples(path: Path, samplesPerPath: number): Vec2[] {
  const verts = path.points;
  const edgeCount = path.closed ? verts.length : verts.length - 1;
  if (edgeCount <= 0) return [];

  const samplesPerEdge = Math.max(1, Math.floor(samplesPerPath / edgeCount));
  const out: Vec2[] = [];

  for (let e = 0; e < edgeCount; e++) {
    const a = verts[e];
    const b = verts[(e + 1) % verts.length];
    for (let s = 0; s < samplesPerEdge; s++) {
      const t = quinticEase(s / samplesPerEdge);
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    }
  }

  return out;
}
