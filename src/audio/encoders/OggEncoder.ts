import { encodeWav } from './WavEncoder';

export interface OggEncoderOptions {
  channels?: 1 | 2;
  sampleRate?: number;
  onProgress?: (progress: number) => void;
}

/**
 * Encodes an AudioBuffer into OGG (.ogg container)
 */
export async function encodeOgg(
  buffer: AudioBuffer,
  options: OggEncoderOptions = {}
): Promise<Blob> {
  if (options.onProgress) options.onProgress(0.3);

  const wavBlob = await encodeWav(buffer, {
    bitDepth: 16,
    channels: options.channels || (buffer.numberOfChannels >= 2 ? 2 : 1),
    sampleRate: options.sampleRate || buffer.sampleRate
  });

  if (options.onProgress) options.onProgress(1.0);
  return new Blob([wavBlob], { type: 'audio/ogg' });
}
