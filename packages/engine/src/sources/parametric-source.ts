import type { Path } from '../geometry/path';
import type { Source } from './source';

export interface LissajousParams {
  kind: 'lissajous';
  freqX: number;
  freqY: number;
  phase: number;
  ampX?: number;
  ampY?: number;
  samples?: number;
}

export interface CircleParams {
  kind: 'circle';
  radius?: number;
  samples?: number;
}

export interface SquareParams {
  kind: 'square';
  size?: number;
}

export type ParametricShape = LissajousParams | CircleParams | SquareParams;

const TWO_PI = Math.PI * 2;

function renderLissajous(p: LissajousParams): Path {
  const samples = p.samples ?? 512;
  const ampX = p.ampX ?? 1;
  const ampY = p.ampY ?? 1;
  const points = [];
  for (let i = 0; i < samples; i++) {
    const t = (i / samples) * TWO_PI;
    points.push({
      x: ampX * Math.sin(p.freqX * t + p.phase),
      y: ampY * Math.sin(p.freqY * t),
    });
  }
  return { points, closed: true };
}

function renderCircle(p: CircleParams): Path {
  const samples = p.samples ?? 256;
  const radius = p.radius ?? 1;
  const points = [];
  for (let i = 0; i < samples; i++) {
    const t = (i / samples) * TWO_PI;
    points.push({ x: radius * Math.cos(t), y: radius * Math.sin(t) });
  }
  return { points, closed: true };
}

// Subdivided into many points per edge (like circle/Lissajous) rather than
// just the 4 corners — Smoothing pulls each point toward the midpoint of its
// neighbors, and with only 4 points those neighbors are the opposite two
// corners, whose midpoint is the shape's center, so the whole square would
// collapse inward instead of just rounding at the corners.
function renderSquare(p: SquareParams): Path {
  const s = p.size ?? 1;
  const pointsPerSide = 32;
  const corners = [
    { x: -s, y: -s },
    { x: s, y: -s },
    { x: s, y: s },
    { x: -s, y: s },
  ];
  const points = [];
  for (let c = 0; c < corners.length; c++) {
    const start = corners[c];
    const end = corners[(c + 1) % corners.length];
    for (let i = 0; i < pointsPerSide; i++) {
      const t = i / pointsPerSide;
      points.push({ x: start.x + (end.x - start.x) * t, y: start.y + (end.y - start.y) * t });
    }
  }
  return { points, closed: true };
}

export class ParametricSource implements Source {
  constructor(private shape: ParametricShape) {}

  render(_t: number): Path[] {
    switch (this.shape.kind) {
      case 'lissajous':
        return [renderLissajous(this.shape)];
      case 'circle':
        return [renderCircle(this.shape)];
      case 'square':
        return [renderSquare(this.shape)];
    }
  }
}
