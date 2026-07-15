import type { OscillatorParams } from './oscillator';
import type { AdsrParams } from './envelope';
import type { FilterParams } from './filter';
import type { LfoParams } from './lfo';
import type { ModConnection } from './mod-matrix';
import { defaultModMatrix } from './mod-matrix';
import type { ArpParams } from './arpeggiator';
import type { SmartChordsParams } from './smart-chords';

// The "patch": everything a Voice needs to render, sent from the UI to the
// worklet as one object and read fresh by every voice on each render block —
// changing a slider never requires reconstructing voice state. `arpEnabled`
// is separate from `arp` (pattern/rate) since it changes how incoming notes
// are handled at all (direct voice trigger vs. arpeggiator queue), not just
// a sequencing parameter. Same split for `smartChordsEnabled`/`smartChords`
// — note that unlike every other field here, the worklet never reads
// `smartChords`: chord expansion happens entirely on the main thread (see
// triggerNote() in app.ts), which sends the worklet one noteOn/noteOff per
// chord tone, indistinguishable from several keys pressed at once. It's
// still carried on this shared params object purely for state-management
// consistency with every other synth setting.
export interface SynthParams {
  oscillator: OscillatorParams;
  envelope: AdsrParams;
  filter: FilterParams;
  lfo: LfoParams;
  modMatrix: ModConnection[];
  arpEnabled: boolean;
  arp: ArpParams;
  smartChordsEnabled: boolean;
  smartChords: SmartChordsParams;
  volume: number;
}

export function defaultSynthParams(): SynthParams {
  return {
    oscillator: { waveform: 'saw' },
    envelope: { attack: 0.01, decay: 0.15, sustain: 0.7, release: 0.3 },
    filter: { cutoff: 4000, resonance: 0.2 },
    lfo: { rate: 5, waveform: 'sine' },
    modMatrix: defaultModMatrix(),
    arpEnabled: false,
    arp: { pattern: 'up', rate: 8 },
    smartChordsEnabled: false,
    smartChords: { scaleRoot: 0, scaleType: 'major', pitchRange: 2, density: 3, strumMs: 0 },
    volume: 0.5,
  };
}
