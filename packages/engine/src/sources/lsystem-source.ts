import type { Path } from '../geometry/path';
import type { Vec2 } from '../geometry/vec2';
import type { Source } from './source';
import { normalizePaths } from '../geometry/normalize-paths';

export interface LSystemParams {
  axiom: string;
  rules: Record<string, string>;
  angleDeg: number;
  iterations: number;
  /** Characters that mean "move forward, drawing a line" (default: "F"). Any
   * other letter is treated as a structural placeholder with no turtle action,
   * matching how L-system grammars commonly use symbols purely to shape the
   * rewriting (e.g. Sierpinski's "A"/"B" both draw, but other systems use a
   * non-drawing "X" just to control recursion). */
  drawSymbols?: string;
  stepLength?: number;
}

function expand(axiom: string, rules: Record<string, string>, iterations: number): string {
  let current = axiom;
  for (let i = 0; i < iterations; i++) {
    let next = '';
    for (const ch of current) {
      next += rules[ch] ?? ch;
    }
    current = next;
  }
  return current;
}

function interpretTurtle(
  commands: string,
  angleDeg: number,
  drawSymbols: Set<string>,
  stepLength: number,
): Path[] {
  const paths: Path[] = [];
  let x = 0;
  let y = 0;
  let headingDeg = 90;
  let currentPoints: Vec2[] = [{ x, y }];
  const stack: { x: number; y: number; headingDeg: number }[] = [];

  // Ends the current pen stroke as its own Path and starts a fresh one at
  // the turtle's current position — used at every point the pen "jumps"
  // (branch push/pop, move-without-drawing), so each stroke run becomes an
  // independently travel-optimizable path rather than one artificially
  // connected polyline.
  function flush(): void {
    if (currentPoints.length > 1) {
      paths.push({ points: currentPoints, closed: false });
    }
    currentPoints = [{ x, y }];
  }

  for (const ch of commands) {
    if (drawSymbols.has(ch)) {
      const rad = (headingDeg * Math.PI) / 180;
      x += Math.cos(rad) * stepLength;
      y += Math.sin(rad) * stepLength;
      currentPoints.push({ x, y });
    } else if (ch === 'f') {
      flush();
      const rad = (headingDeg * Math.PI) / 180;
      x += Math.cos(rad) * stepLength;
      y += Math.sin(rad) * stepLength;
      currentPoints = [{ x, y }];
    } else if (ch === '+') {
      headingDeg += angleDeg;
    } else if (ch === '-') {
      headingDeg -= angleDeg;
    } else if (ch === '[') {
      flush();
      stack.push({ x, y, headingDeg });
    } else if (ch === ']') {
      flush();
      const popped = stack.pop();
      if (popped) {
        x = popped.x;
        y = popped.y;
        headingDeg = popped.headingDeg;
      }
      currentPoints = [{ x, y }];
    }
    // Any other character is a structural placeholder — no turtle action.
  }
  flush();
  return paths;
}

export class LSystemSource implements Source {
  private paths: Path[];

  constructor(params: LSystemParams) {
    const drawSymbols = new Set((params.drawSymbols ?? 'F').split(''));
    const expanded = expand(params.axiom, params.rules, params.iterations);
    const rawPaths = interpretTurtle(expanded, params.angleDeg, drawSymbols, params.stepLength ?? 1);
    this.paths = normalizePaths(rawPaths);
  }

  render(_t: number): Path[] {
    return this.paths;
  }
}
