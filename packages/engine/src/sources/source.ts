import type { Path } from '../geometry/path';

export interface Source {
  render(t: number): Path[];
}
