export type OscillatorWaveform = 'sine' | 'saw' | 'square' | 'triangle';

export interface OscillatorParams {
  waveform: OscillatorWaveform;
}

// Naive (non-band-limited) waveform generation from a 0..1 phase — fine for
// an MVP voice; band-limiting (e.g. polyBLEP) can be added later if aliasing
// at high notes becomes audible.
export function oscillatorSample(phase: number, waveform: OscillatorWaveform): number {
  switch (waveform) {
    case 'sine':
      return Math.sin(phase * Math.PI * 2);
    case 'saw': {
      return 2 * (phase - Math.floor(phase + 0.5));
    }
    case 'square':
      return phase < 0.5 ? 1 : -1;
    case 'triangle': {
      const saw = 2 * (phase - Math.floor(phase + 0.5));
      return 2 * Math.abs(saw) - 1;
    }
  }
}
