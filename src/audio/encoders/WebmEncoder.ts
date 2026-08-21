import { encodeOpusWithWebCodecs, isWebCodecsAudioSupported } from './WebCodecsEncoder';
import { encodeViaMediaRecorder } from './MediaRecorderHelper';

export interface WebmEncoderOptions {
  bitrate?: number;
  channels?: 1 | 2;
  sampleRate?: number;
  onProgress?: (progress: number) => void;
}

/**
 * Encodes an AudioBuffer into WebM / Opus container using WebCodecs with MediaRecorder fallback.
 */
export async function encodeWebm(
  buffer: AudioBuffer,
  options: WebmEncoderOptions = {}
): Promise<Blob> {
  if (isWebCodecsAudioSupported()) {
    try {
      return await encodeOpusWithWebCodecs(buffer, {
        bitrate: options.bitrate || 192,
        channels: options.channels,
        sampleRate: options.sampleRate,
        onProgress: options.onProgress
      });
    } catch (err) {
      console.warn('WebCodecs WebM encoding failed, falling back to MediaRecorder:', err);
    }
  }

  return await encodeViaMediaRecorder(
    buffer,
    ['audio/webm;codecs=opus', 'audio/webm'],
    {
      bitrate: options.bitrate || 192,
      sampleRate: options.sampleRate,
      onProgress: options.onProgress
    }
  );
}
