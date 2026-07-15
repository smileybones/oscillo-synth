import type { Effect } from './effect';

export interface BitcrushParams {
  levels: number;
}

export function createBitcrushEffect(params: BitcrushParams): Effect {
  return {
    name: 'bitcrush',
    processSample(x, y) {
      const step = 2 / Math.max(2, params.levels);
      const quantize = (v: number) => Math.round(v / step) * step;
      return [quantize(x), quantize(y)];
    },
  };
}
