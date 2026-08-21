import { encodeOpusWithWebCodecs, isWebCodecsAudioSupported } from './WebCodecsEncoder';
import { encodeViaMediaRecorder } from './MediaRecorderHelper';

export interface OpusEncoderOptions {
  bitrate?: number;
  channels?: 1 | 2;
  sampleRate?: number;
  onProgress?: (progress: number) => void;
}

/**
 * Encodes an AudioBuffer into OPUS stream using native WebCodecs AudioEncoder with fallback.
 */
export async function encodeOpus(
  buffer: AudioBuffer,
  options: OpusEncoderOptions = {}
): Promise<Blob> {
  if (isWebCodecsAudioSupported()) {
    try {
      return await encodeOpusWithWebCodecs(buffer, {
        bitrate: options.bitrate || 160,
        channels: options.channels,
        sampleRate: options.sampleRate,
        onProgress: options.onProgress
      });
    } catch (err) {
      console.warn('WebCodecs Opus encoding failed, falling back to MediaRecorder:', err);
    }
  }

  return await encodeViaMediaRecorder(
    buffer,
    ['audio/ogg;codecs=opus', 'audio/opus', 'audio/webm;codecs=opus'],
    {
      bitrate: options.bitrate || 160,
      sampleRate: options.sampleRate,
      onProgress: options.onProgress
    }
  );
}
