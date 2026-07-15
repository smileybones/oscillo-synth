import type { Path } from '../geometry/path';
import type { Effect, EffectContext } from './effect';

// Path-stage effects run first (in order), then sample-stage effects run on
// the rendered buffer (in order). Reordering only changes relative order
// within the same stage — the two stages operate on different granularities
// (path vertices vs. audio-rate samples), so they can't be meaningfully
// interleaved into one pass.
export class EffectChain {
  constructor(private effects: Effect[]) {}

  applyToPaths(paths: Path[], ctx: EffectContext): Path[] {
    return this.effects.reduce(
      (current, effect) => (effect.processPaths ? effect.processPaths(current, ctx) : current),
      paths,
    );
  }

  applyToSample(x: number, y: number, ctx: EffectContext): [number, number] {
    let sx = x;
    let sy = y;
    for (const effect of this.effects) {
      if (effect.processSample) {
        [sx, sy] = effect.processSample(sx, sy, ctx);
      }
    }
    return [sx, sy];
  }
}
