export type MidiListener = (controller: number, value: number, channel: number) => void;
export type NoteListener = (note: number, velocity: number, on: boolean, channel: number) => void;

// Thin wrapper over the Web MIDI API — handles Control Change (CC) messages
// for knob/slider parameter mapping, and Note On/Off for the synth and note
// visualizer. Both message kinds can come from the same input simultaneously
// (e.g. a keyboard with both keys and knobs), so they're parsed independently
// off the same event stream rather than one replacing the other.
export class MidiManager {
  private access: MIDIAccess | null = null;
  private listeners = new Set<MidiListener>();
  private noteListeners = new Set<NoteListener>();

  async enable(): Promise<boolean> {
    if (!navigator.requestMIDIAccess) return false;
    try {
      this.access = await navigator.requestMIDIAccess();
      this.attachInputs();
      this.access.onstatechange = () => this.attachInputs();
      return true;
    } catch {
      return false;
    }
  }

  private attachInputs(): void {
    if (!this.access) return;
    this.access.inputs.forEach((input) => {
      input.onmidimessage = (event) => this.handleMessage(event);
    });
  }

  private handleMessage(event: MIDIMessageEvent): void {
    const data = event.data;
    if (!data || data.length < 3) return;
    const status = data[0];
    const channel = status & 0x0f;
    const statusKind = status & 0xf0;

    if (statusKind === 0xb0) {
      const controller = data[1];
      const value = data[2];
      for (const listener of this.listeners) listener(controller, value, channel);
      return;
    }

    if (statusKind === 0x90 || statusKind === 0x80) {
      const note = data[1];
      const velocity = data[2];
      // A Note On with velocity 0 is a widely-used shorthand for Note Off
      // (lets a keyboard avoid switching status bytes on release).
      const on = statusKind === 0x90 && velocity > 0;
      for (const listener of this.noteListeners) listener(note, velocity, on, channel);
    }
  }

  onMessage(listener: MidiListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  onNote(listener: NoteListener): () => void {
    this.noteListeners.add(listener);
    return () => this.noteListeners.delete(listener);
  }

  get deviceNames(): string[] {
    if (!this.access) return [];
    const names: string[] = [];
    this.access.inputs.forEach((input) => names.push(input.name ?? 'Unknown device'));
    return names;
  }
}
