import { Voice, Lfo, Arpeggiator, defaultSynthParams } from '@oscillo-synth/engine/synth';
import type { SynthParams } from '@oscillo-synth/engine/synth';

const MAX_VOICES = 8;

type SynthMessage =
  | { type: 'noteOn'; note: number; velocity: number }
  | { type: 'noteOff'; note: number }
  | { type: 'setParams'; params: SynthParams };

class SynthWorkletProcessor extends AudioWorkletProcessor {
  private voices: Voice[] = Array.from({ length: MAX_VOICES }, () => new Voice());
  private nextTriggerId = 0;
  private params: SynthParams = defaultSynthParams();
  private monoBuffer = new Float32Array(128);
  // One shared LFO for the whole voice pool, not one per voice, so every
  // note wobbles in sync rather than drifting apart.
  private lfo = new Lfo();
  private lfoBuffer = new Float32Array(128);
  private arpeggiator = new Arpeggiator();

  constructor() {
    super();
    this.port.onmessage = (event: MessageEvent<SynthMessage>) => {
      const data = event.data;
      if (data.type === 'noteOn') this.handleNoteOn(data.note, data.velocity);
      else if (data.type === 'noteOff') this.handleNoteOff(data.note);
      else this.setParams(data.params);
    };
  }

  // While the arp is on, incoming notes feed its held-note set instead of
  // triggering a voice directly — the arp itself decides which single note
  // actually sounds and when, via triggerVoiceNoteOn/Off in process() below.
  private handleNoteOn(note: number, velocity: number): void {
    if (this.params.arpEnabled) this.arpeggiator.noteHeld(note, velocity);
    else this.triggerVoiceNoteOn(note, velocity);
  }

  private handleNoteOff(note: number): void {
    if (this.params.arpEnabled) this.arpeggiator.noteReleased(note);
    else this.triggerVoiceNoteOff(note);
  }

  private setParams(params: SynthParams): void {
    const wasArpEnabled = this.params.arpEnabled;
    this.params = params;
    if (wasArpEnabled && !params.arpEnabled) {
      // Turning the arp off mid-hold shouldn't leave its last note stuck
      // sounding forever, and any notes it was tracking are no longer
      // meaningful once direct note-on/off resumes.
      const current = this.arpeggiator.currentlyPlayingNote;
      if (current !== null) this.triggerVoiceNoteOff(current);
      this.arpeggiator.reset();
    }
  }

  private triggerVoiceNoteOn(note: number, velocity: number): void {
    // Reuse the same voice if this note is already sounding (e.g. still
    // releasing) so a fast retrigger doesn't produce two overlapping tails
    // of the same pitch.
    let voice = this.voices.find((v) => v.note === note);
    if (!voice) voice = this.voices.find((v) => !v.isActive());
    if (!voice) {
      // No idle voice: steal the oldest-triggered one (FIFO) — simpler and
      // adequate for 8 voices played by one person than a "quietest voice"
      // heuristic.
      voice = this.voices.reduce((oldest, v) => (v.triggeredAt < oldest.triggeredAt ? v : oldest));
    }
    voice.noteOn(note, velocity, this.nextTriggerId++);
  }

  private triggerVoiceNoteOff(note: number): void {
    for (const voice of this.voices) {
      if (voice.note === note) voice.noteOff();
    }
  }

  process(_inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const output = outputs[0];
    const outL = output[0];
    const outR = output[1] ?? output[0];
    const len = outL.length;

    if (this.params.arpEnabled) {
      const event = this.arpeggiator.advance(len / sampleRate, this.params.arp);
      if (event) {
        if (event.noteOff !== null) this.triggerVoiceNoteOff(event.noteOff);
        if (event.noteOn !== null) this.triggerVoiceNoteOn(event.noteOn.note, event.noteOn.velocity);
      }
    }

    if (this.monoBuffer.length !== len) this.monoBuffer = new Float32Array(len);
    if (this.lfoBuffer.length !== len) this.lfoBuffer = new Float32Array(len);
    this.monoBuffer.fill(0);
    for (let i = 0; i < len; i++) this.lfoBuffer[i] = this.lfo.advance(sampleRate, this.params.lfo);

    for (const voice of this.voices) {
      if (voice.isActive()) voice.renderBlock(this.monoBuffer, this.lfoBuffer, sampleRate, this.params);
    }

    for (let i = 0; i < len; i++) {
      outL[i] = this.monoBuffer[i];
      outR[i] = this.monoBuffer[i];
    }

    return true;
  }
}

registerProcessor('synth-worklet-processor', SynthWorkletProcessor);
