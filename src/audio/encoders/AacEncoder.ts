import { encodeViaMediaRecorder } from './MediaRecorderHelper';

export interface AacEncoderOptions {
  bitrate?: 128 | 192 | 256 | 320;
  channels?: 1 | 2;
  sampleRate?: number;
  onProgress?: (progress: number) => void;
}

/**
 * Encodes an AudioBuffer into AAC / MP4 container using native MediaRecorder
 */
export async function encodeAac(
  buffer: AudioBuffer,
  options: AacEncoderOptions = {}
): Promise<Blob> {
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
