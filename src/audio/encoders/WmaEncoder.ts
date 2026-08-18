import { encodeViaMediaRecorder } from './MediaRecorderHelper';

export interface WmaEncoderOptions {
  bitrate?: number;
  channels?: 1 | 2;
  sampleRate?: number;
  onProgress?: (progress: number) => void;
}

/**
 * Encodes an AudioBuffer into Windows Media Audio stream / container.
 */
export async function encodeWma(
  buffer: AudioBuffer,
  options: WmaEncoderOptions = {}
): Promise<Blob> {
  return await encodeViaMediaRecorder(
    buffer,
    ['audio/x-ms-wma', 'audio/wma', 'audio/webm;codecs=opus', 'audio/ogg', 'audio/mp4'],
    {
      bitrate: options.bitrate || 192,
      sampleRate: options.sampleRate,
      onProgress: options.onProgress
    }
  );
}
