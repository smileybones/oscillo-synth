export type ScaleType = 'major' | 'minor';

// Semitone offsets from the root, one octave, ascending.
export const SCALES: Record<ScaleType, number[]> = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
};

const MIDI_MIN = 0;
const MIDI_MAX = 127;

// All absolute MIDI notes belonging to `scaleType` rooted at `scaleRoot`
// (0-11, C=0), ascending across the full MIDI range — the ordered list a
// "scale degree index" (used by the rest of this module) indexes into.
function scaleNotes(scaleRoot: number, scaleType: ScaleType): number[] {
  const intervals = SCALES[scaleType];
  const notes: number[] = [];
  for (let midi = MIDI_MIN; midi <= MIDI_MAX; midi++) {
    const semitone = (((midi - scaleRoot) % 12) + 12) % 12;
    if (intervals.includes(semitone)) notes.push(midi);
  }
  return notes;
}

// The index (into the ascending list of in-scale MIDI notes) nearest `note`
// — the anchor a chord gets stacked upward from.
export function nearestScaleDegreeIndex(note: number, scaleRoot: number, scaleType: ScaleType): number {
  const notes = scaleNotes(scaleRoot, scaleType);
  let closestIndex = 0;
  let closestDistance = Infinity;
  for (let i = 0; i < notes.length; i++) {
    const distance = Math.abs(notes[i] - note);
    if (distance < closestDistance) {
      closestDistance = distance;
      closestIndex = i;
    }
  }
  return closestIndex;
}

export function scaleDegreeToNote(degreeIndex: number, scaleRoot: number, scaleType: ScaleType): number {
  const notes = scaleNotes(scaleRoot, scaleType);
  const clamped = Math.max(0, Math.min(notes.length - 1, degreeIndex));
  return notes[clamped];
}
