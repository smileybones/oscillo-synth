import type { Path } from './path';
import type { Vec2 } from './vec2';
import type { PathCommand } from './path-commands';

const CURVE_SAMPLES = 24;

function cubicPoint(p0: Vec2, p1: Vec2, p2: Vec2, p3: Vec2, t: number): Vec2 {
  const mt = 1 - t;
  const a = mt * mt * mt;
  const b = 3 * mt * mt * t;
  const c = 3 * mt * t * t;
  const d = t * t * t;
  return {
    x: a * p0.x + b * p1.x + c * p2.x + d * p3.x,
    y: a * p0.y + b * p1.y + c * p2.y + d * p3.y,
  };
}

function quadraticPoint(p0: Vec2, p1: Vec2, p2: Vec2, t: number): Vec2 {
  const mt = 1 - t;
  const a = mt * mt;
  const b = 2 * mt * t;
  const c = t * t;
  return { x: a * p0.x + b * p1.x + c * p2.x, y: a * p0.y + b * p1.y + c * p2.y };
}

// Turns a flat command stream into separate Path entries, splitting a new
// subpath at every 'M' — this is the piece our previous SVG handling was
// missing, which let unrelated contours (separate letters, a glyph's inner
// and outer outline, etc.) get treated as one continuously-drawn path.
export function flattenCommandsToPaths(commands: PathCommand[]): Path[] {
  const paths: Path[] = [];
  let points: Vec2[] = [];
  let cursor: Vec2 = { x: 0, y: 0 };
  let subpathStart: Vec2 = { x: 0, y: 0 };
  let closed = false;

  function endSubpath(): void {
    if (points.length > 0) paths.push({ points, closed });
    points = [];
    closed = false;
  }

  for (const cmd of commands) {
    switch (cmd.type) {
      case 'M':
        endSubpath();
        cursor = { x: cmd.x, y: cmd.y };
        subpathStart = cursor;
        points.push(cursor);
        break;
      case 'L':
        cursor = { x: cmd.x, y: cmd.y };
        points.push(cursor);
        break;
      case 'C': {
        const p1 = { x: cmd.x1, y: cmd.y1 };
        const p2 = { x: cmd.x2, y: cmd.y2 };
        const p3 = { x: cmd.x, y: cmd.y };
        for (let i = 1; i <= CURVE_SAMPLES; i++) {
          points.push(cubicPoint(cursor, p1, p2, p3, i / CURVE_SAMPLES));
        }
        cursor = p3;
        break;
      }
      case 'Q': {
        const p1 = { x: cmd.x1, y: cmd.y1 };
        const p2 = { x: cmd.x, y: cmd.y };
        for (let i = 1; i <= CURVE_SAMPLES; i++) {
          points.push(quadraticPoint(cursor, p1, p2, i / CURVE_SAMPLES));
        }
        cursor = p2;
        break;
      }
      case 'Z':
        closed = true;
        cursor = subpathStart;
        break;
    }
  }
  endSubpath();
  return paths;
}
