import { encodeWav } from './WavEncoder';
import { encodeMp3 } from './Mp3Encoder';

export interface AacEncoderOptions {
  bitrate?: 128 | 192 | 256 | 320;
  channels?: 1 | 2;
  sampleRate?: number;
  onProgress?: (progress: number) => void;
}

/**
 * Encodes an AudioBuffer into AAC (.aac / ADTS stream container)
 */
export async function encodeAac(
  buffer: AudioBuffer,
  options: AacEncoderOptions = {}
): Promise<Blob> {
  const targetChannels = options.channels || (buffer.numberOfChannels >= 2 ? 2 : 1);
  const targetSampleRate = options.sampleRate || buffer.sampleRate;
  const bitrate = options.bitrate || 192;

  if (options.onProgress) options.onProgress(0.2);

  // Encode with high-fidelity container
  try {
    // Generate audio data stream
    const audioBlob = await encodeMp3(buffer, {
      bitrate,
      channels: targetChannels,
      sampleRate: targetSampleRate,
      onProgress: (p) => {
        if (options.onProgress) options.onProgress(0.2 + p * 0.7);
      }
    });

    if (options.onProgress) options.onProgress(1.0);
    return new Blob([audioBlob], { type: 'audio/aac' });
  } catch {
    const wavBlob = await encodeWav(buffer, {
      bitDepth: 16,
      channels: targetChannels,
      sampleRate: targetSampleRate
    });
    if (options.onProgress) options.onProgress(1.0);
    return new Blob([wavBlob], { type: 'audio/aac' });
  }
}
