// Synthesizes a stereo impulse response (exponentially-decaying white noise)
// for ConvolverNode, rather than fetching a recorded IR file — a standard
// lightweight technique for a serviceable, if generic, reverb tail with no
// external asset to bundle.
export function createReverbImpulse(context: AudioContext, durationSeconds: number, decay: number): AudioBuffer {
  const length = Math.max(1, Math.floor(context.sampleRate * durationSeconds));
  const impulse = context.createBuffer(2, length, context.sampleRate);
  for (let channel = 0; channel < impulse.numberOfChannels; channel++) {
    const data = impulse.getChannelData(channel);
    for (let i = 0; i < length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
    }
  }
  return impulse;
}
