import { LuaFactory, type LuaEngine } from 'wasmoon';
import type { Path } from '../geometry/path';
import type { Source } from './source';

// The user's script must define a global `generate(t)` function returning a
// flat array of {x, y} points for one closed path — deliberately the
// simplest possible contract (matching ParametricSource's single-shape
// output) rather than a multi-path structure, to keep the scripting surface
// approachable for a first script.
//
// Spiked against wasmoon directly before committing to this shape: a single
// call returning a whole point array runs in the low milliseconds even for
// a few hundred points (well under the render loop's 80ms budget), and both
// compile-time and runtime Lua errors surface as regular catchable JS
// Errors, so no bespoke error-marshaling was needed.
//
// Known limitation, deliberately not solved here: a script with a genuine
// infinite loop (e.g. `while true do end`) will hang the tab, since this
// runs synchronously on the main thread to match every other Source. Fixing
// that properly would mean running the Lua VM in a Worker and redesigning
// Source.render() around a stale-cache/async-refresh split — out of
// proportion for a personal creative-coding tool; callers should surface a
// clear warning instead.
export class LuaSource implements Source {
  private lastError: string | null = null;

  private constructor(
    private engine: LuaEngine,
    private generateFn: (t: number) => unknown,
  ) {}

  static async fromScript(script: string): Promise<LuaSource> {
    const factory = new LuaFactory();
    const engine = await factory.createEngine();
    try {
      await engine.doString(script);
    } catch (err) {
      engine.global.close();
      throw err;
    }

    const generateFn: unknown = engine.global.get('generate');
    if (typeof generateFn !== 'function') {
      engine.global.close();
      throw new Error('Script must define a global "generate(t)" function');
    }

    return new LuaSource(engine, generateFn as (t: number) => unknown);
  }

  getLastError(): string | null {
    return this.lastError;
  }

  render(t: number): Path[] {
    try {
      const result = this.generateFn(t);
      if (!Array.isArray(result)) {
        this.lastError = 'generate(t) must return an array of {x, y} points';
        return [];
      }

      const points = result
        .filter(
          (p): p is { x: number; y: number } =>
            typeof p === 'object' && p !== null && typeof p.x === 'number' && typeof p.y === 'number',
        )
        .map((p) => ({ x: p.x, y: p.y }));

      this.lastError = null;
      return points.length > 0 ? [{ points, closed: true }] : [];
    } catch (err) {
      this.lastError = err instanceof Error ? err.message : String(err);
      return [];
    }
  }

  dispose(): void {
    this.engine.global.close();
  }
}
