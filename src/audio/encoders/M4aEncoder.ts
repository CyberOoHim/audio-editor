import { encodeAacWithWebCodecs, isWebCodecsAudioSupported } from './WebCodecsEncoder';
import { encodeViaMediaRecorder } from './MediaRecorderHelper';

export interface M4aEncoderOptions {
  bitrate?: number;
  channels?: 1 | 2;
  sampleRate?: number;
  onProgress?: (progress: number) => void;
}

/**
 * Encodes an AudioBuffer into Apple MPEG-4 Audio (.m4a) container.
 * Uses high-speed native hardware-accelerated WebCodecs AudioEncoder + ISOBMFF muxing.
 */
export async function encodeM4a(
  buffer: AudioBuffer,
  options: M4aEncoderOptions = {}
): Promise<Blob> {
  if (isWebCodecsAudioSupported()) {
    try {
      return await encodeAacWithWebCodecs(buffer, {
        bitrate: options.bitrate || 192,
        channels: options.channels,
        sampleRate: options.sampleRate,
        container: 'm4a',
        onProgress: options.onProgress
      });
    } catch (err) {
      console.warn('WebCodecs M4A encoding failed, falling back to MediaRecorder:', err);
    }
  }

  return await encodeViaMediaRecorder(
    buffer,
    ['audio/mp4', 'audio/x-m4a', 'audio/aac', 'audio/webm;codecs=opus'],
    {
      bitrate: options.bitrate || 192,
      sampleRate: options.sampleRate,
      onProgress: options.onProgress
    }
  );
}
