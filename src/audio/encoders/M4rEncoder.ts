import { encodeViaMediaRecorder } from './MediaRecorderHelper';

export interface M4rEncoderOptions {
  bitrate?: number;
  channels?: 1 | 2;
  sampleRate?: number;
  onProgress?: (progress: number) => void;
}

/**
 * Encodes an AudioBuffer into iPhone Ringtone (.m4r) format using AAC/MP4.
 */
export async function encodeM4r(
  buffer: AudioBuffer,
  options: M4rEncoderOptions = {}
): Promise<Blob> {
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
