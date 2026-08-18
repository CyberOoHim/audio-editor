import { encodeViaMediaRecorder } from './MediaRecorderHelper';

export interface Mp2EncoderOptions {
  bitrate?: number;
  channels?: 1 | 2;
  sampleRate?: number;
  onProgress?: (progress: number) => void;
}

/**
 * Encodes an AudioBuffer into MP2 Broadcast Audio format.
 */
export async function encodeMp2(
  buffer: AudioBuffer,
  options: Mp2EncoderOptions = {}
): Promise<Blob> {
  return await encodeViaMediaRecorder(
    buffer,
    ['audio/mpeg', 'audio/mp2', 'audio/mp4', 'audio/webm;codecs=opus'],
    {
      bitrate: options.bitrate || 192,
      sampleRate: options.sampleRate,
      onProgress: options.onProgress
    }
  );
}
