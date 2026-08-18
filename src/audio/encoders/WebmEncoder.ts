import { encodeViaMediaRecorder } from './MediaRecorderHelper';

export interface WebmEncoderOptions {
  bitrate?: number;
  channels?: 1 | 2;
  sampleRate?: number;
  onProgress?: (progress: number) => void;
}

/**
 * Encodes an AudioBuffer into WebM container using native MediaRecorder
 */
export async function encodeWebm(
  buffer: AudioBuffer,
  options: WebmEncoderOptions = {}
): Promise<Blob> {
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
