import { nearestScaleDegreeIndex, scaleDegreeToNote, SCALES } from './scales';
import type { ScaleType } from './scales';

export interface SmartChordsParams {
  scaleRoot: number; // 0-11, C=0
  scaleType: ScaleType;
  pitchRange: number; // octaves the chord's notes span
  density: number; // notes per chord
  strumMs: number; // ms between each chord note's onset
}

// Builds a `density`-note, in-scale chord anchored at the scale degree
// nearest `pressedNote`, stacking degrees upward. The degree-to-degree step
// is derived from `pitchRange` and `density` together (not fixed at thirds)
// so the two axes stay independently meaningful: density picks the note
// count, pitchRange picks how far the whole voicing spans; a step of 2
// (stacked thirds) is the floor so dense chords don't degenerate into a
// scale run.
export function generateChordNotes(pressedNote: number, params: SmartChordsParams): number[] {
  const { scaleRoot, scaleType, pitchRange, density } = params;
  const scaleLength = SCALES[scaleType].length;
  const rootDegreeIndex = nearestScaleDegreeIndex(pressedNote, scaleRoot, scaleType);

  const span = Math.max(1, pitchRange) * scaleLength;
  const stepDegrees = Math.max(2, Math.round(span / Math.max(density - 1, 1)));

  const notes: number[] = [];
  for (let i = 0; i < density; i++) {
    notes.push(scaleDegreeToNote(rootDegreeIndex + i * stepDegrees, scaleRoot, scaleType));
  }

  return [...new Set(notes)].sort((a, b) => a - b);
}
