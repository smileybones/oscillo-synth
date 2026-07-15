import { oscillatorSample } from './oscillator';
import { AdsrEnvelope } from './envelope';
import { StateVariableFilter } from './filter';
import { sumModulation } from './mod-matrix';
import type { ModSource } from './mod-matrix';
import type { SynthParams } from './synth-params';

function noteToFrequency(note: number): number {
  return 440 * Math.pow(2, (note - 69) / 12);
}

// How far a fully-turned-up "-> pitch" mod amount can bend a note, in
// semitones — wide enough to cover both a subtle vibrato (small amount) and
// a dramatic pitch-envelope "pluck" (large amount).
const PITCH_MOD_RANGE_SEMITONES = 24;

// One synth voice: an oscillator run through a resonant filter, gated by an
// ADSR envelope, with the envelope's own level and a shared LFO available as
// mod-matrix sources. A fixed pool of these is shared across all notes (see
// the worklet's voice-stealing logic) — `note`/`triggeredAt` are public so
// the pool can pick an idle or oldest-triggered voice without Voice needing
// to know about the pool.
export class Voice {
  note = -1;
  triggeredAt = 0;
  private velocity = 0;
  private phase = 0;
  private envelope = new AdsrEnvelope();
  private filter = new StateVariableFilter();

  noteOn(note: number, velocity: number, triggeredAt: number): void {
    this.note = note;
    this.velocity = velocity;
    this.triggeredAt = triggeredAt;
    this.envelope.noteOn();
  }

  noteOff(): void {
    this.envelope.noteOff();
  }

  isActive(): boolean {
    return !this.envelope.isIdle;
  }

  // Adds this voice's contribution into `output` (mono) — callers sum
  // multiple voices into the same buffer rather than allocating per-voice.
  // `lfoBlock` is one shared LFO signal (-1..1) precomputed for this block by
  // the caller, so every voice wobbles in sync rather than each owning its
  // own drifting LFO phase.
  renderBlock(output: Float32Array, lfoBlock: Float32Array, sampleRate: number, params: SynthParams): void {
    const baseFreq = noteToFrequency(this.note);
    const dt = 1 / sampleRate;
    const velocityGain = this.velocity / 127;

    for (let i = 0; i < output.length; i++) {
      const envLevel = this.envelope.advance(dt, params.envelope);
      const lfoValue = lfoBlock[i];
      const sourceValues: Record<ModSource, number> = { envelope: envLevel, lfo: lfoValue };

      const pitchMod = sumModulation(params.modMatrix, sourceValues, 'pitch');
      const freq = baseFreq * Math.pow(2, (pitchMod * PITCH_MOD_RANGE_SEMITONES) / 12);
      const phaseIncrement = freq / sampleRate;

      const raw = oscillatorSample(this.phase, params.oscillator.waveform);
      this.phase += phaseIncrement;
      if (this.phase >= 1) this.phase -= Math.floor(this.phase);

      const cutoffMod = sumModulation(params.modMatrix, sourceValues, 'cutoff');
      const cutoff = params.filter.cutoff * (1 + cutoffMod * 0.9);
      const filtered = this.filter.process(raw, sampleRate, { cutoff, resonance: params.filter.resonance });

      // Layered on top of the envelope's own always-on amplitude gating
      // (below) rather than replacing it — "envelope -> amp" here is an
      // extra emphasis knob, "lfo -> amp" is the classic tremolo.
      const ampMod = sumModulation(params.modMatrix, sourceValues, 'amp');
      const ampMultiplier = Math.max(0, Math.min(2, 1 + ampMod));

      output[i] += filtered * envLevel * velocityGain * params.volume * ampMultiplier;
    }
  }
}
