export interface DecodedAudio {
  left: Float32Array;
  right: Float32Array;
}

// Decoded via an OfflineAudioContext (rather than the app's real playback
// AudioContext) so this can run immediately at file-upload time, before
// Start has ever been pressed. The target sample rate must match whatever
// the file will eventually play back through — decodeAudioData resamples
// to the calling context's rate, so a mismatch here would play the file
// back at the wrong pitch/speed.
export async function decodeAudioFile(arrayBuffer: ArrayBuffer, sampleRate: number): Promise<DecodedAudio> {
  const context = new OfflineAudioContext(2, 1, sampleRate);
  const audioBuffer = await context.decodeAudioData(arrayBuffer);
  const left = Float32Array.from(audioBuffer.getChannelData(0));
  const right = audioBuffer.numberOfChannels > 1 ? Float32Array.from(audioBuffer.getChannelData(1)) : left.slice();
  return { left, right };
}
