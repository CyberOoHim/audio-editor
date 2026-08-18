import { encodeViaMediaRecorder } from './MediaRecorderHelper';

export interface M4aEncoderOptions {
  bitrate?: 128 | 192 | 256 | 320;
  channels?: 1 | 2;
  sampleRate?: number;
  onProgress?: (progress: number) => void;
}

/**
 * Encodes an AudioBuffer into M4A / MP4 container using native MediaRecorder
 */
export async function encodeM4a(
  buffer: AudioBuffer,
  options: M4aEncoderOptions = {}
): Promise<Blob> {
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
