import { encodeOpusWithWebCodecs, isWebCodecsAudioSupported } from './WebCodecsEncoder';
import { encodeViaMediaRecorder } from './MediaRecorderHelper';

export interface OggEncoderOptions {
  bitrate?: number;
  channels?: 1 | 2;
  sampleRate?: number;
  onProgress?: (progress: number) => void;
}

/**
 * Encodes an AudioBuffer into OGG container using WebCodecs with MediaRecorder fallback.
 */
export async function encodeOgg(
  buffer: AudioBuffer,
  options: OggEncoderOptions = {}
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
      console.warn('WebCodecs OGG encoding failed, falling back to MediaRecorder:', err);
    }
  }

  return await encodeViaMediaRecorder(
    buffer,
    ['audio/ogg;codecs=opus', 'audio/ogg', 'audio/webm;codecs=opus'],
    {
      bitrate: options.bitrate || 192,
      sampleRate: options.sampleRate,
      onProgress: options.onProgress
    }
  );
}
