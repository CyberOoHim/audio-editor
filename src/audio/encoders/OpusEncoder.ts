import { encodeViaMediaRecorder } from './MediaRecorderHelper';

export interface OpusEncoderOptions {
  bitrate?: number;
  channels?: 1 | 2;
  sampleRate?: number;
  onProgress?: (progress: number) => void;
}

/**
 * Encodes an AudioBuffer into OPUS stream using native MediaRecorder
 */
export async function encodeOpus(
  buffer: AudioBuffer,
  options: OpusEncoderOptions = {}
): Promise<Blob> {
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
