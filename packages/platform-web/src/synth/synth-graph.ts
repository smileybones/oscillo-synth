import type { SynthParams } from '@oscillo-synth/engine/synth';
// Same Vite bundling trick as audio-graph.ts's render-worklet import — see
// that file's comment for why the `?worker&url` suffix is needed.
import workletUrl from './synth-worklet.ts?worker&url';
import { createReverbImpulse } from './reverb-impulse';

export interface SynthGraph {
  context: AudioContext;
  node: AudioWorkletNode;
  delay: DelayNode;
  delayFeedback: GainNode;
  delayWet: GainNode;
  reverbWet: GainNode;
  analyser: AnalyserNode;
}

// Delay/reverb are native Web Audio nodes rather than hand-rolled DSP inside
// the worklet — simpler, and the browser's own ConvolverNode/DelayNode are
// well-suited to this rather than reimplementing convolution. They're wired
// as parallel "sends" (dry path always on, each effect an additive wet path)
// rather than a serial insert with dry/wet crossfade, which keeps delay and
// reverb independently controllable with one wet knob each.
export async function createSynthGraph(options: { sampleRate?: number } = {}): Promise<SynthGraph> {
  const context = new AudioContext(options.sampleRate ? { sampleRate: options.sampleRate } : undefined);
  await context.audioWorklet.addModule(workletUrl);

  const node = new AudioWorkletNode(context, 'synth-worklet-processor', {
    numberOfInputs: 0,
    numberOfOutputs: 1,
    outputChannelCount: [2],
  });

  const masterGain = context.createGain();
  node.connect(masterGain);

  const delay = context.createDelay(2);
  delay.delayTime.value = 0.25;
  const delayFeedback = context.createGain();
  delayFeedback.gain.value = 0.3;
  const delayWet = context.createGain();
  delayWet.gain.value = 0; // starts inaudible until the user turns it up

  node.connect(delay);
  delay.connect(delayFeedback);
  delayFeedback.connect(delay);
  delay.connect(delayWet);
  delayWet.connect(masterGain);

  const reverb = context.createConvolver();
  reverb.buffer = createReverbImpulse(context, 2, 2);
  const reverbWet = context.createGain();
  reverbWet.gain.value = 0;

  node.connect(reverb);
  reverb.connect(reverbWet);
  reverbWet.connect(masterGain);

  masterGain.connect(context.destination);

  // Tapped post-effects (after masterGain) so the waveform preview matches
  // what's actually audible, including delay/reverb — a dead-end tap, since
  // AnalyserNode doesn't need to forward audio onward to be read from.
  const analyser = context.createAnalyser();
  analyser.fftSize = 2048;
  masterGain.connect(analyser);

  return { context, node, delay, delayFeedback, delayWet, reverbWet, analyser };
}

export function sendNoteOn(node: AudioWorkletNode, note: number, velocity: number): void {
  node.port.postMessage({ type: 'noteOn', note, velocity });
}

export function sendNoteOff(node: AudioWorkletNode, note: number): void {
  node.port.postMessage({ type: 'noteOff', note });
}

export function sendSynthParams(node: AudioWorkletNode, params: SynthParams): void {
  node.port.postMessage({ type: 'setParams', params });
}
