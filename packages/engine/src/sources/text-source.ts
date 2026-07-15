import { parse, type Font } from 'opentype.js';
import type { Path } from '../geometry/path';
import type { Source } from './source';
import { flattenCommandsToPaths } from '../geometry/flatten-path-commands';
import { normalizePaths } from '../geometry/normalize-paths';

export function parseFont(buffer: ArrayBuffer): Font {
  return parse(buffer);
}

export class TextSource implements Source {
  private paths: Path[];

  constructor(font: Font, text: string, fontSize = 72) {
    const glyphPath = font.getPath(text, 0, 0, fontSize);
    this.paths = normalizePaths(flattenCommandsToPaths(glyphPath.commands));
  }

  render(_t: number): Path[] {
    return this.paths;
  }
}
