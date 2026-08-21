/**
 * High-Speed Lossless FLAC Encoder with Dedicated Web Worker Offloading.
 * Prevents main-thread UI freezing and uses bit-perfect streaming frame compression.
 */

import { runWorkerEncoding } from '../workers/workerClient';
import { encodeViaMediaRecorder } from './MediaRecorderHelper';

export interface FlacEncoderOptions {
  bitDepth?: 16 | 24;
  channels?: 1 | 2;
  sampleRate?: number;
  onProgress?: (progress: number) => void;
}

/**
 * Encodes an AudioBuffer into a bit-perfect lossless FLAC file (.flac).
 * Offloads encoding to a dedicated Web Worker for high-speed multi-core performance.
 */
export async function encodeFlac(
  buffer: AudioBuffer,
  options: FlacEncoderOptions = {}
): Promise<Blob> {
  try {
    const arrayBuffer = await runWorkerEncoding('encode-flac', buffer, {
      bitDepth: options.bitDepth || 24,
      channels: options.channels,
      sampleRate: options.sampleRate,
      onProgress: options.onProgress
    });
    return new Blob([arrayBuffer], { type: 'audio/flac' });
  } catch (err) {
    console.warn('Worker FLAC encoding failed, checking MediaRecorder fallback:', err);
    return await encodeViaMediaRecorder(buffer, ['audio/flac', 'audio/x-flac'], {
      sampleRate: options.sampleRate,
      onProgress: options.onProgress
    });
  }
}
