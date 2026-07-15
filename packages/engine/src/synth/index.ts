// Narrow barrel for code that runs inside an AudioWorkletProcessor's global
// scope, which lacks most Window/Worker APIs. Importing the top-level engine
// barrel (`@oscillo-synth/engine`) would drag in unrelated modules that assume a
// normal browser context (e.g. the Lua source's wasmoon dependency) into
// that restricted scope — this file re-exports only the pure-math DSP the
// synth worklet actually needs.
export { oscillatorSample } from './oscillator';
export type { OscillatorWaveform, OscillatorParams } from './oscillator';
export { AdsrEnvelope } from './envelope';
export type { AdsrParams } from './envelope';
export { StateVariableFilter } from './filter';
export type { FilterParams } from './filter';
export { Lfo } from './lfo';
export type { LfoParams } from './lfo';
export { sumModulation, defaultModMatrix } from './mod-matrix';
export type { ModSource, ModDestination, ModConnection } from './mod-matrix';
export { Arpeggiator } from './arpeggiator';
export type { ArpPattern, ArpParams, ArpNoteEvent } from './arpeggiator';
export { Voice } from './voice';
export { defaultSynthParams } from './synth-params';
export type { SynthParams } from './synth-params';
export { SCALES, nearestScaleDegreeIndex, scaleDegreeToNote } from './scales';
export type { ScaleType } from './scales';
export { generateChordNotes } from './smart-chords';
export type { SmartChordsParams } from './smart-chords';
