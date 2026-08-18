import { encodeViaMediaRecorder } from './MediaRecorderHelper';

export interface FlacEncoderOptions {
  bitDepth?: 16 | 24;
  channels?: 1 | 2;
  sampleRate?: number;
  onProgress?: (progress: number) => void;
}

/**
 * Encodes an AudioBuffer into FLAC stream if supported by browser MediaRecorder
 */
export async function encodeFlac(
  buffer: AudioBuffer,
  options: FlacEncoderOptions = {}
): Promise<Blob> {
  return await encodeViaMediaRecorder(
    buffer,
    ['audio/flac', 'audio/x-flac'],
    {
      sampleRate: options.sampleRate,
      onProgress: options.onProgress
    }
  );
}
