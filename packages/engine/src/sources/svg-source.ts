import type { Path } from '../geometry/path';
import type { Source } from './source';
import { flattenCommandsToPaths } from '../geometry/flatten-path-commands';
import { normalizePaths } from '../geometry/normalize-paths';
import { parseSvgPathData } from './svg-path-parser';

export class SvgSource implements Source {
  private paths: Path[];

  constructor(pathData: string[]) {
    const rawPaths: Path[] = [];
    for (const d of pathData) {
      if (!d.trim()) continue;
      try {
        rawPaths.push(...flattenCommandsToPaths(parseSvgPathData(d)));
      } catch {
        // Skip unparseable path data rather than breaking the whole scene.
      }
    }
    this.paths = normalizePaths(rawPaths);
  }

  render(_t: number): Path[] {
    return this.paths;
  }
}
