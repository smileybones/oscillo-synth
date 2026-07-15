import type { Vec2 } from './vec2';

export interface Path {
  points: Vec2[];
  closed: boolean;
}
