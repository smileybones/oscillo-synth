import type { Path } from '../geometry/path';
import type { Source } from './source';

export class SceneSource implements Source {
  constructor(private sources: Source[]) {}

  render(t: number): Path[] {
    return this.sources.flatMap((source) => source.render(t));
  }
}
