import { oscillatorSample } from './oscillator';
import type { OscillatorWaveform } from './oscillator';

export interface LfoParams {
  rate: number;
  waveform: OscillatorWaveform;
}

// Shared by the whole voice pool (one LFO, not one per voice) so every note
// wobbles in sync — advance() is called once per output sample from the
// worklet, independent of any individual voice's own oscillator phase.
export class Lfo {
  private phase = 0;

  advance(sampleRate: number, params: LfoParams): number {
    const value = oscillatorSample(this.phase, params.waveform);
    this.phase += params.rate / sampleRate;
    if (this.phase >= 1) this.phase -= Math.floor(this.phase);
    return value;
  }
}
