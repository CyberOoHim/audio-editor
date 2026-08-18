import { encodeViaMediaRecorder } from './MediaRecorderHelper';

export interface AmrEncoderOptions {
  bitrate?: number;
  channels?: 1 | 2;
  sampleRate?: number;
  onProgress?: (progress: number) => void;
}

/**
 * Encodes an AudioBuffer into AMR / 3GPP voice format.
 */
export async function encodeAmr(
  buffer: AudioBuffer,
  options: AmrEncoderOptions = {}
): Promise<Blob> {
  return await encodeViaMediaRecorder(
    buffer,
    ['audio/amr', 'audio/3gpp', 'audio/ogg;codecs=opus', 'audio/webm'],
    {
      bitrate: options.bitrate || 64,
      sampleRate: options.sampleRate || 8000,
      onProgress: options.onProgress
    }
  );
}
