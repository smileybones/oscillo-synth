import type { Path } from '../geometry/path';
import type { Vec2 } from '../geometry/vec2';

export interface PixelBuffer {
  width: number;
  height: number;
  /** RGBA, length = width * height * 4 (same layout as ImageData.data). */
  data: Uint8ClampedArray;
}

export interface TracePixelsOptions {
  /** Edge-magnitude threshold (0..1) above which a contour is traced. */
  threshold?: number;
}

interface Segment {
  a: Vec2;
  b: Vec2;
}

function toGrayscale(pixels: PixelBuffer): Float32Array {
  const { width, height, data } = pixels;
  const gray = new Float32Array(width * height);
  for (let i = 0; i < width * height; i++) {
    const r = data[i * 4];
    const g = data[i * 4 + 1];
    const b = data[i * 4 + 2];
    gray[i] = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  }
  return gray;
}

function sobelEdgeMagnitude(gray: Float32Array, width: number, height: number): Float32Array {
  const out = new Float32Array(width * height);
  const at = (x: number, y: number): number => {
    const cx = Math.min(width - 1, Math.max(0, x));
    const cy = Math.min(height - 1, Math.max(0, y));
    return gray[cy * width + cx];
  };

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const gx =
        -at(x - 1, y - 1) - 2 * at(x - 1, y) - at(x - 1, y + 1) + at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1);
      const gy =
        -at(x - 1, y - 1) - 2 * at(x, y - 1) - at(x + 1, y - 1) + at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1);
      out[y * width + x] = Math.min(1, Math.hypot(gx, gy) / 4);
    }
  }
  return out;
}

// Edge indices per cell: 0=top, 1=right, 2=bottom, 3=left.
// Table maps a 4-bit corner-inside code (tl|tr<<1|br<<2|bl<<3) to the pair(s)
// of edges a contour line connects through that cell. The two saddle cases
// (5, 10) are resolved as two separate corner-isolating segments rather than
// implementing a full asymptotic decider — a standard simplification that
// can misjoin exactly at ambiguous saddle points but never produces invalid
// output, which is an acceptable trade for stylized line art.
const EDGE_TABLE: ReadonlyArray<ReadonlyArray<readonly [number, number]>> = [
  [],
  [[3, 0]],
  [[0, 1]],
  [[3, 1]],
  [[1, 2]],
  [
    [3, 0],
    [1, 2],
  ],
  [[0, 2]],
  [[3, 2]],
  [[2, 3]],
  [[0, 2]],
  [
    [0, 1],
    [2, 3],
  ],
  [[1, 2]],
  [[3, 1]],
  [[0, 1]],
  [[3, 0]],
  [],
];

function interpolateEdge(v0: number, v1: number, p0: Vec2, p1: Vec2, threshold: number): Vec2 {
  const denom = v1 - v0;
  const t = Math.abs(denom) < 1e-6 ? 0.5 : (threshold - v0) / denom;
  const clamped = Math.max(0, Math.min(1, t));
  return { x: p0.x + (p1.x - p0.x) * clamped, y: p0.y + (p1.y - p0.y) * clamped };
}

function marchingSquaresSegments(field: Float32Array, width: number, height: number, threshold: number): Segment[] {
  const segments: Segment[] = [];

  for (let y = 0; y < height - 1; y++) {
    for (let x = 0; x < width - 1; x++) {
      const vTL = field[y * width + x];
      const vTR = field[y * width + x + 1];
      const vBR = field[(y + 1) * width + x + 1];
      const vBL = field[(y + 1) * width + x];

      const caseIndex =
        (vTL >= threshold ? 1 : 0) |
        (vTR >= threshold ? 2 : 0) |
        (vBR >= threshold ? 4 : 0) |
        (vBL >= threshold ? 8 : 0);

      const pairs = EDGE_TABLE[caseIndex];
      if (pairs.length === 0) continue;

      const pTL = { x, y };
      const pTR = { x: x + 1, y };
      const pBR = { x: x + 1, y: y + 1 };
      const pBL = { x, y: y + 1 };

      const edgePoints: Vec2[] = [
        interpolateEdge(vTL, vTR, pTL, pTR, threshold),
        interpolateEdge(vTR, vBR, pTR, pBR, threshold),
        interpolateEdge(vBL, vBR, pBL, pBR, threshold),
        interpolateEdge(vTL, vBL, pTL, pBL, threshold),
      ];

      for (const [e0, e1] of pairs) {
        segments.push({ a: edgePoints[e0], b: edgePoints[e1] });
      }
    }
  }

  return segments;
}

function pointKey(p: Vec2): string {
  return `${Math.round(p.x * 1000)},${Math.round(p.y * 1000)}`;
}

// Links segments sharing endpoints into longer polylines in O(n) (via a
// hash map keyed by quantized endpoint position) rather than an O(n^2)
// all-pairs search — marching squares over even a modest grid produces
// thousands of segments per frame, and this runs every rendered frame.
function chainSegmentsToPaths(segments: Segment[]): Path[] {
  const pointToSegments = new Map<string, { index: number; end: 'a' | 'b' }[]>();
  const used = new Array<boolean>(segments.length).fill(false);

  segments.forEach((seg, index) => {
    for (const end of ['a', 'b'] as const) {
      const key = pointKey(seg[end]);
      const list = pointToSegments.get(key);
      if (list) list.push({ index, end });
      else pointToSegments.set(key, [{ index, end }]);
    }
  });

  const paths: Path[] = [];

  for (let i = 0; i < segments.length; i++) {
    if (used[i]) continue;
    used[i] = true;
    const points: Vec2[] = [segments[i].a, segments[i].b];

    let extending = true;
    while (extending) {
      extending = false;
      const key = pointKey(points[points.length - 1]);
      for (const cand of pointToSegments.get(key) ?? []) {
        if (used[cand.index]) continue;
        const seg = segments[cand.index];
        points.push(cand.end === 'a' ? seg.b : seg.a);
        used[cand.index] = true;
        extending = true;
        break;
      }
    }

    extending = true;
    while (extending) {
      extending = false;
      const key = pointKey(points[0]);
      for (const cand of pointToSegments.get(key) ?? []) {
        if (used[cand.index]) continue;
        const seg = segments[cand.index];
        points.unshift(cand.end === 'a' ? seg.b : seg.a);
        used[cand.index] = true;
        extending = true;
        break;
      }
    }

    const closed = points.length > 2 && pointKey(points[0]) === pointKey(points[points.length - 1]);
    if (closed) points.pop();
    paths.push({ points, closed });
  }

  return paths;
}

// Maps pixel coordinates directly onto [-1, 1] using the frame's fixed
// dimensions, not an adaptive per-content bounding box — unlike a static
// SVG/OBJ, video content shifts every frame, so normalizing to its own
// bounding box each time would make the image visibly zoom/jitter in scale
// frame to frame. The mapping needs to stay constant; only the traced
// content changes.
function normalizeToFrame(paths: Path[], width: number, height: number): Path[] {
  const scale = 2 / Math.max(width, height);
  const cx = width / 2;
  const cy = height / 2;
  return paths.map((path) => ({
    ...path,
    points: path.points.map((p) => ({ x: (p.x - cx) * scale, y: -(p.y - cy) * scale })),
  }));
}

export function tracePixelsToPaths(pixels: PixelBuffer, options: TracePixelsOptions = {}): Path[] {
  const threshold = options.threshold ?? 0.25;
  const gray = toGrayscale(pixels);
  const edges = sobelEdgeMagnitude(gray, pixels.width, pixels.height);
  const segments = marchingSquaresSegments(edges, pixels.width, pixels.height, threshold);
  const rawPaths = chainSegmentsToPaths(segments);
  return normalizeToFrame(rawPaths, pixels.width, pixels.height);
}
