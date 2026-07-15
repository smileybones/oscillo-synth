export type ArpPattern = 'up' | 'down' | 'up-down' | 'random';

export interface ArpParams {
  pattern: ArpPattern;
  rate: number; // steps per second
}

export interface ArpNoteEvent {
  noteOff: number | null;
  noteOn: { note: number; velocity: number } | null;
}

interface HeldNote {
  note: number;
  velocity: number;
}

function buildArpSequence(heldNotes: HeldNote[], pattern: ArpPattern): HeldNote[] {
  const sorted = [...heldNotes].sort((a, b) => a.note - b.note);
  switch (pattern) {
    case 'up':
      return sorted;
    case 'down':
      return [...sorted].reverse();
    case 'up-down': {
      // Drop both endpoints from the descending half so the top and bottom
      // notes don't each play twice in a row at the turnaround.
      if (sorted.length <= 1) return sorted;
      const descending = [...sorted].reverse().slice(1, -1);
      return [...sorted, ...descending];
    }
    case 'random':
      return sorted;
  }
}

// Pure note-sequencing logic — no audio. Given the set of currently held
// notes and how much time has elapsed, decides which single note (if any)
// should be sounding; the caller (the synth worklet) is responsible for
// actually triggering/releasing a voice when that changes.
export class Arpeggiator {
  private heldNotes: HeldNote[] = [];
  private stepIndex = 0;
  private elapsedSinceStep = 0;
  private currentNote: number | null = null;

  noteHeld(note: number, velocity: number): void {
    if (!this.heldNotes.some((h) => h.note === note)) this.heldNotes.push({ note, velocity });
  }

  noteReleased(note: number): void {
    const index = this.heldNotes.findIndex((h) => h.note === note);
    if (index !== -1) this.heldNotes.splice(index, 1);
  }

  get currentlyPlayingNote(): number | null {
    return this.currentNote;
  }

  reset(): void {
    this.heldNotes = [];
    this.currentNote = null;
    this.stepIndex = 0;
    this.elapsedSinceStep = 0;
  }

  advance(deltaSeconds: number, params: ArpParams): ArpNoteEvent | null {
    if (this.heldNotes.length === 0) {
      if (this.currentNote !== null) {
        const noteOff = this.currentNote;
        this.currentNote = null;
        this.stepIndex = 0;
        this.elapsedSinceStep = 0;
        return { noteOff, noteOn: null };
      }
      return null;
    }

    this.elapsedSinceStep += deltaSeconds;
    const stepDuration = 1 / Math.max(0.1, params.rate);
    if (this.currentNote !== null && this.elapsedSinceStep < stepDuration) return null;
    this.elapsedSinceStep = 0;

    const sequence = buildArpSequence(this.heldNotes, params.pattern);
    const next =
      params.pattern === 'random'
        ? sequence[Math.floor(Math.random() * sequence.length)]
        : sequence[this.stepIndex % sequence.length];
    if (params.pattern !== 'random') this.stepIndex += 1;

    // Always retrigger, even when the next note is the same pitch as the
    // last step — a single held note re-articulating every step is the
    // whole point of an arpeggiator's rhythmic pulse, not a no-op.
    const noteOff = this.currentNote;
    this.currentNote = next.note;
    return { noteOff, noteOn: { note: next.note, velocity: next.velocity } };
  }
}
