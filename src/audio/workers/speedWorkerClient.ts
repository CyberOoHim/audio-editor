/**
 * Client interface for dedicated Speed Transform Web Worker.
 *
 * Provides background processing, zero-copy transferable buffers, progress reporting,
 * and seamless fallback if workers are unavailable.
 */

import { copyFloat32Yielding, createBufferSafe } from '../memoryBudget';

let activeSpeedWorker: Worker | null = null;
let currentJobId = 0;

interface PendingJob {
  resolve: (res: { ch0: Float32Array; ch1: Float32Array | null; numChannels: number; outLen: number }) => void;
  reject: (err: Error) => void;
  onProgress?: (progress: number) => void;
}

const pendingJobs = new Map<number, PendingJob>();

function getOrCreateSpeedWorker(): Worker {
  if (!activeSpeedWorker) {
    activeSpeedWorker = new Worker(new URL('./speedWorker.ts', import.meta.url), {
      type: 'module'
    });

    activeSpeedWorker.onmessage = (e: MessageEvent) => {
      const { type, id, progress, channel0, channel1, numChannels, outLen, error } = e.data;
      const job = pendingJobs.get(id);
      if (!job) return;

      if (type === 'progress') {
        job.onProgress?.(progress);
      } else if (type === 'complete') {
        pendingJobs.delete(id);
        job.resolve({ ch0: channel0, ch1: channel1, numChannels, outLen });
      } else if (type === 'error') {
        pendingJobs.delete(id);
        job.reject(new Error(error || 'Speed worker error'));
      }
    };

    activeSpeedWorker.onerror = (err) => {
      console.warn('Speed Web Worker error:', err);
      for (const [id, job] of pendingJobs.entries()) {
        job.reject(new Error(`Worker fatal: ${err.message || 'Worker failure'}`));
        pendingJobs.delete(id);
      }
      activeSpeedWorker?.terminate();
      activeSpeedWorker = null;
    };
  }
  return activeSpeedWorker;
}

export interface SpeedTransformOptions {
  speed: number;
  keepPitch: boolean;
  onProgress?: (progress: number) => void;
}

/**
 * Runs speed transformation on a Web Worker using zero-copy ArrayBuffers.
 */
export async function runWorkerSpeedTransform(
  ctx: BaseAudioContext,
  source: AudioBuffer,
  options: SpeedTransformOptions
): Promise<AudioBuffer> {
  const { speed, keepPitch, onProgress } = options;
  const numChannels = source.numberOfChannels;
  const inLen = source.length;
  const sampleRate = source.sampleRate;

  // Extract channel data to transfer
  const ch0 = new Float32Array(inLen);
  await copyFloat32Yielding(ch0, source.getChannelData(0));

  let ch1: Float32Array | null = null;
  if (numChannels > 1) {
    ch1 = new Float32Array(inLen);
    await copyFloat32Yielding(ch1, source.getChannelData(1));
  }

  const transferList: Transferable[] = [ch0.buffer];
  if (ch1) transferList.push(ch1.buffer);

  const worker = getOrCreateSpeedWorker();
  const id = ++currentJobId;

  const result = await new Promise<{
    ch0: Float32Array;
    ch1: Float32Array | null;
    numChannels: number;
    outLen: number;
  }>((resolve, reject) => {
    pendingJobs.set(id, { resolve, reject, onProgress });
    worker.postMessage(
      {
        id,
        channel0: ch0,
        channel1: ch1,
        numChannels,
        sampleRate,
        speed,
        keepPitch
      },
      transferList
    );
  });

  const target = createBufferSafe(ctx, result.numChannels, result.outLen, sampleRate);
  target.getChannelData(0).set(result.ch0);
  if (result.numChannels > 1 && result.ch1) {
    target.getChannelData(1).set(result.ch1);
  }

  return target;
}
