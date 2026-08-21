import { encodeAacWithWebCodecs, isWebCodecsAudioSupported } from './WebCodecsEncoder';
import { encodeViaMediaRecorder } from './MediaRecorderHelper';

export interface M4rEncoderOptions {
  bitrate?: number;
  channels?: 1 | 2;
  sampleRate?: number;
  onProgress?: (progress: number) => void;
}

/**
 * Encodes an AudioBuffer into iPhone Ringtone (.m4r) format using high-speed WebCodecs AAC.
 */
export async function encodeM4r(
  buffer: AudioBuffer,
  options: M4rEncoderOptions = {}
): Promise<Blob> {
  if (isWebCodecsAudioSupported()) {
    try {
      return await encodeAacWithWebCodecs(buffer, {
        bitrate: options.bitrate || 256,
        channels: options.channels,
        sampleRate: options.sampleRate,
        container: 'm4r',
        onProgress: options.onProgress
      });
    } catch (err) {
      console.warn('WebCodecs M4R encoding failed, falling back to MediaRecorder:', err);
    }
  }

  return await encodeViaMediaRecorder(
    buffer,
    ['audio/mp4', 'audio/aac', 'audio/x-m4a', 'audio/webm;codecs=opus'],
    {
      bitrate: options.bitrate || 256,
      sampleRate: options.sampleRate,
      onProgress: options.onProgress
    }
  );
}
