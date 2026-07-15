// The standard DOM lib doesn't ship AudioWorkletGlobalScope types, so the
// worklet source declares just enough of the surface it actually uses.
declare class AudioWorkletProcessor {
  readonly port: MessagePort;
  process(
    inputs: Float32Array[][],
    outputs: Float32Array[][],
    parameters: Record<string, Float32Array>,
  ): boolean;
}

declare function registerProcessor(
  name: string,
  processorCtor: new () => AudioWorkletProcessor,
): void;

// AudioWorkletGlobalScope also exposes this as a plain global — needed by
// worklets (like the synth) that generate audio from scratch rather than
// just replaying a pre-rendered buffer.
declare const sampleRate: number;
