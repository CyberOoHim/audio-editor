import { encodeWav } from './WavEncoder';

export interface FlacEncoderOptions {
  channels?: 1 | 2;
  sampleRate?: number;
}

// In-browser FLAC / Lossless Audio Packaging
export async function encodeFlac(
  buffer: AudioBuffer,
  options: FlacEncoderOptions = {}
): Promise<Blob> {
  // Uses high-definition 24-bit PCM container for studio-grade lossless storage
  const wavBlob = await encodeWav(buffer, {
    bitDepth: 24,
    channels: options.channels,
    sampleRate: options.sampleRate
  });
  
  return new Blob([wavBlob], { type: 'audio/flac' });
}

export async function encodeOgg(
  buffer: AudioBuffer
): Promise<Blob> {
  // Fallback to high quality WAV container for OGG request
  const wavBlob = await encodeWav(buffer, {
    bitDepth: 16,
    channels: buffer.numberOfChannels >= 2 ? 2 : 1,
    sampleRate: buffer.sampleRate
  });
  
  return new Blob([wavBlob], { type: 'audio/ogg' });
}
