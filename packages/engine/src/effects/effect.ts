import type { Path } from '../geometry/path';

export interface EffectContext {
  t: number;
}

// Effects can hook the geometry stage (before paths become samples), the
// per-sample stage (after rendering), or both.
export interface Effect {
  name: string;
  processPaths?(paths: Path[], ctx: EffectContext): Path[];
  processSample?(x: number, y: number, ctx: EffectContext): [number, number];
}
