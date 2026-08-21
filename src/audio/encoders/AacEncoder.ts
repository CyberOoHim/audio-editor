import { encodeAacWithWebCodecs, isWebCodecsAudioSupported } from './WebCodecsEncoder';
import { encodeViaMediaRecorder } from './MediaRecorderHelper';

export interface AacEncoderOptions {
  bitrate?: number;
  channels?: 1 | 2;
  sampleRate?: number;
  onProgress?: (progress: number) => void;
}

/**
 * Encodes an AudioBuffer into AAC (.aac / ADTS stream).
 * Uses high-speed native hardware-accelerated WebCodecs AudioEncoder when available.
 */
export async function encodeAac(
  buffer: AudioBuffer,
  options: AacEncoderOptions = {}
): Promise<Blob> {
  if (isWebCodecsAudioSupported()) {
    try {
      return await encodeAacWithWebCodecs(buffer, {
        bitrate: options.bitrate || 192,
        channels: options.channels,
        sampleRate: options.sampleRate,
        container: 'adts',
        onProgress: options.onProgress
      });
    } catch (err) {
      console.warn('WebCodecs AAC encoding failed, falling back to MediaRecorder:', err);
    }
  }

  return await encodeViaMediaRecorder(
    buffer,
    ['audio/aac', 'audio/mp4', 'audio/x-m4a', 'audio/webm;codecs=opus'],
    {
      bitrate: options.bitrate || 192,
      sampleRate: options.sampleRate,
      onProgress: options.onProgress
    }
  );
}
