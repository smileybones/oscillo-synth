import type { PathCommand } from '../geometry/path-commands';
import type { Vec2 } from '../geometry/vec2';

const COMMAND_LETTERS = /[MmLlHhVvCcSsQqTtAaZz]/;

// Approximates an elliptical arc as line segments using the standard SVG
// endpoint-to-center parameterization (spec appendix F.6), since our
// pipeline ultimately needs sampled points either way.
function appendArcAsLines(
  commands: PathCommand[],
  start: Vec2,
  end: Vec2,
  rxIn: number,
  ryIn: number,
  rotationDeg: number,
  largeArcFlag: number,
  sweepFlag: number,
): void {
  if (rxIn === 0 || ryIn === 0 || (start.x === end.x && start.y === end.y)) {
    commands.push({ type: 'L', x: end.x, y: end.y });
    return;
  }

  const rx = Math.abs(rxIn);
  const ry = Math.abs(ryIn);
  const phi = (rotationDeg * Math.PI) / 180;
  const cosPhi = Math.cos(phi);
  const sinPhi = Math.sin(phi);

  const dx2 = (start.x - end.x) / 2;
  const dy2 = (start.y - end.y) / 2;
  const x1p = cosPhi * dx2 + sinPhi * dy2;
  const y1p = -sinPhi * dx2 + cosPhi * dy2;

  let rxSq = rx * rx;
  let rySq = ry * ry;
  const x1pSq = x1p * x1p;
  const y1pSq = y1p * y1p;

  let rxAdj = rx;
  let ryAdj = ry;
  const radiiCheck = x1pSq / rxSq + y1pSq / rySq;
  if (radiiCheck > 1) {
    const s = Math.sqrt(radiiCheck);
    rxAdj = rx * s;
    ryAdj = ry * s;
    rxSq = rxAdj * rxAdj;
    rySq = ryAdj * ryAdj;
  }

  const sign = largeArcFlag !== sweepFlag ? 1 : -1;
  const num = rxSq * rySq - rxSq * y1pSq - rySq * x1pSq;
  const denom = rxSq * y1pSq + rySq * x1pSq;
  const coef = sign * Math.sqrt(Math.max(0, num / denom));
  const cxp = (coef * (rxAdj * y1p)) / ryAdj;
  const cyp = (-coef * (ryAdj * x1p)) / rxAdj;

  const cx = cosPhi * cxp - sinPhi * cyp + (start.x + end.x) / 2;
  const cy = sinPhi * cxp + cosPhi * cyp + (start.y + end.y) / 2;

  function vectorAngle(ux: number, uy: number, vx: number, vy: number): number {
    const dot = ux * vx + uy * vy;
    const len = Math.sqrt(ux * ux + uy * uy) * Math.sqrt(vx * vx + vy * vy);
    let a = Math.acos(Math.min(1, Math.max(-1, dot / len)));
    if (ux * vy - uy * vx < 0) a = -a;
    return a;
  }

  const theta1 = vectorAngle(1, 0, (x1p - cxp) / rxAdj, (y1p - cyp) / ryAdj);
  let deltaTheta = vectorAngle(
    (x1p - cxp) / rxAdj,
    (y1p - cyp) / ryAdj,
    (-x1p - cxp) / rxAdj,
    (-y1p - cyp) / ryAdj,
  );

  if (sweepFlag === 0 && deltaTheta > 0) deltaTheta -= 2 * Math.PI;
  if (sweepFlag === 1 && deltaTheta < 0) deltaTheta += 2 * Math.PI;

  const samples = Math.max(2, Math.ceil((Math.abs(deltaTheta) / (Math.PI * 2)) * 64));
  for (let i = 1; i <= samples; i++) {
    const theta = theta1 + (deltaTheta * i) / samples;
    const x = cx + rxAdj * Math.cos(theta) * cosPhi - ryAdj * Math.sin(theta) * sinPhi;
    const y = cy + rxAdj * Math.cos(theta) * sinPhi + ryAdj * Math.sin(theta) * cosPhi;
    commands.push({ type: 'L', x, y });
  }
}

export function parseSvgPathData(d: string): PathCommand[] {
  const commands: PathCommand[] = [];
  const len = d.length;
  let i = 0;

  function skipSeparators(): void {
    while (i < len && /[\s,]/.test(d[i])) i++;
  }

  function readNumber(): number {
    skipSeparators();
    const start = i;
    if (d[i] === '-' || d[i] === '+') i++;
    while (i < len && /\d/.test(d[i])) i++;
    if (d[i] === '.') {
      i++;
      while (i < len && /\d/.test(d[i])) i++;
    }
    if (d[i] === 'e' || d[i] === 'E') {
      i++;
      if (d[i] === '-' || d[i] === '+') i++;
      while (i < len && /\d/.test(d[i])) i++;
    }
    const text = d.slice(start, i);
    if (text.length === 0 || text === '-' || text === '+') {
      throw new Error(`Invalid number in path data at index ${start}`);
    }
    return Number(text);
  }

  function readFlag(): number {
    skipSeparators();
    const ch = d[i];
    if (ch !== '0' && ch !== '1') {
      throw new Error(`Invalid arc flag in path data at index ${i}`);
    }
    i++;
    return ch === '0' ? 0 : 1;
  }

  let cursor: Vec2 = { x: 0, y: 0 };
  let subpathStart: Vec2 = { x: 0, y: 0 };
  let lastControl: Vec2 | null = null;
  let lastCommandLetter = '';

  while (i < len) {
    skipSeparators();
    if (i >= len) break;

    let commandLetter = lastCommandLetter;
    if (COMMAND_LETTERS.test(d[i])) {
      commandLetter = d[i];
      i++;
    } else if (!lastCommandLetter) {
      throw new Error(`Path data must start with a command at index ${i}`);
    }

    const isRelative = commandLetter === commandLetter.toLowerCase();
    const upper = commandLetter.toUpperCase();
    const resolve = (x: number, y: number): Vec2 =>
      isRelative ? { x: cursor.x + x, y: cursor.y + y } : { x, y };

    switch (upper) {
      case 'M': {
        const abs = resolve(readNumber(), readNumber());
        commands.push({ type: 'M', x: abs.x, y: abs.y });
        cursor = abs;
        subpathStart = abs;
        lastControl = null;
        // Extra coordinate pairs after M are implicit linetos, not more movetos.
        lastCommandLetter = isRelative ? 'l' : 'L';
        break;
      }
      case 'L': {
        const abs = resolve(readNumber(), readNumber());
        commands.push({ type: 'L', x: abs.x, y: abs.y });
        cursor = abs;
        lastControl = null;
        lastCommandLetter = commandLetter;
        break;
      }
      case 'H': {
        const x = readNumber();
        const point = { x: isRelative ? cursor.x + x : x, y: cursor.y };
        commands.push({ type: 'L', x: point.x, y: point.y });
        cursor = point;
        lastControl = null;
        lastCommandLetter = commandLetter;
        break;
      }
      case 'V': {
        const y = readNumber();
        const point = isRelative ? { x: cursor.x, y: cursor.y + y } : { x: cursor.x, y };
        commands.push({ type: 'L', x: point.x, y: point.y });
        cursor = point;
        lastControl = null;
        lastCommandLetter = commandLetter;
        break;
      }
      case 'C': {
        const c1 = resolve(readNumber(), readNumber());
        const c2 = resolve(readNumber(), readNumber());
        const end = resolve(readNumber(), readNumber());
        commands.push({ type: 'C', x1: c1.x, y1: c1.y, x2: c2.x, y2: c2.y, x: end.x, y: end.y });
        cursor = end;
        lastControl = c2;
        lastCommandLetter = commandLetter;
        break;
      }
      case 'S': {
        const c1: Vec2 = lastControl
          ? { x: 2 * cursor.x - lastControl.x, y: 2 * cursor.y - lastControl.y }
          : cursor;
        const c2 = resolve(readNumber(), readNumber());
        const end = resolve(readNumber(), readNumber());
        commands.push({ type: 'C', x1: c1.x, y1: c1.y, x2: c2.x, y2: c2.y, x: end.x, y: end.y });
        cursor = end;
        lastControl = c2;
        lastCommandLetter = commandLetter;
        break;
      }
      case 'Q': {
        const c1 = resolve(readNumber(), readNumber());
        const end = resolve(readNumber(), readNumber());
        commands.push({ type: 'Q', x1: c1.x, y1: c1.y, x: end.x, y: end.y });
        cursor = end;
        lastControl = c1;
        lastCommandLetter = commandLetter;
        break;
      }
      case 'T': {
        const reflected: Vec2 = lastControl
          ? { x: 2 * cursor.x - lastControl.x, y: 2 * cursor.y - lastControl.y }
          : cursor;
        const end = resolve(readNumber(), readNumber());
        commands.push({ type: 'Q', x1: reflected.x, y1: reflected.y, x: end.x, y: end.y });
        cursor = end;
        lastControl = reflected;
        lastCommandLetter = commandLetter;
        break;
      }
      case 'A': {
        const rx = readNumber();
        const ry = readNumber();
        const rotation = readNumber();
        const largeArcFlag = readFlag();
        const sweepFlag = readFlag();
        const end = resolve(readNumber(), readNumber());
        appendArcAsLines(commands, cursor, end, rx, ry, rotation, largeArcFlag, sweepFlag);
        cursor = end;
        lastControl = null;
        lastCommandLetter = commandLetter;
        break;
      }
      case 'Z': {
        commands.push({ type: 'Z' });
        cursor = subpathStart;
        lastControl = null;
        lastCommandLetter = commandLetter;
        break;
      }
      default:
        throw new Error(`Unsupported path command "${commandLetter}"`);
    }
  }

  return commands;
}
