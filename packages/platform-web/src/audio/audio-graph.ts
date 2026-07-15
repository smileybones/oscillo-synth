// The `?worker&url` suffix tells Vite to bundle this TS file (transpiling +
// resolving imports) the same way it would a Web Worker entry, but hand back
// the resulting URL instead of constructing a Worker — which is what
// AudioContext.audioWorklet.addModule() needs.
import workletUrl from './render-worklet.ts?worker&url';

export interface AudioGraph {
  context: AudioContext;
  node: AudioWorkletNode;
}

export async function createAudioGraph(options: { sampleRate?: number } = {}): Promise<AudioGraph> {
  const context = new AudioContext(options.sampleRate ? { sampleRate: options.sampleRate } : undefined);
  await context.audioWorklet.addModule(workletUrl);

  const node = new AudioWorkletNode(context, 'render-worklet-processor', {
    numberOfInputs: 0,
    numberOfOutputs: 1,
    outputChannelCount: [2],
  });
  node.connect(context.destination);

  return { context, node };
}

export function sendSamples(node: AudioWorkletNode, left: Float32Array, right: Float32Array): void {
  node.port.postMessage({ type: 'buffer', left, right }, [left.buffer, right.buffer]);
}

// Jumps to a position within the currently loaded buffer (0..1) without
// reloading it — for scrubbing through passthrough audio.
export function seekAudioTo(node: AudioWorkletNode, fraction: number): void {
  node.port.postMessage({ type: 'seek', fraction });
}
