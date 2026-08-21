/**
 * Client manager for Audio Encoder Web Worker.
 * Handles background execution, zero-copy buffer transfers, progress streaming, and fallback.
 */

let activeWorker: Worker | null = null;
let currentJobId = 0;
const pendingJobs = new Map<
  number,
  {
    resolve: (buf: ArrayBuffer) => void;
    reject: (err: Error) => void;
    onProgress?: (p: number) => void;
  }
>();

function getOrCreateWorker(): Worker {
  if (!activeWorker) {
    try {
      activeWorker = new Worker(new URL('./encoderWorker.ts', import.meta.url), {
        type: 'module'
      });

      activeWorker.onmessage = (e: MessageEvent) => {
        const { type, id, progress, buffer, error } = e.data;
        const job = pendingJobs.get(id);
        if (!job) return;

        if (type === 'progress') {
          job.onProgress?.(progress);
        } else if (type === 'complete') {
          pendingJobs.delete(id);
          job.resolve(buffer);
        } else if (type === 'error') {
          pendingJobs.delete(id);
          job.reject(new Error(error || 'Worker encoding error'));
        }
      };

      activeWorker.onerror = (err) => {
        console.error('Audio Encoder Worker error:', err);
        // Reject all pending jobs
        for (const [id, job] of pendingJobs.entries()) {
          job.reject(new Error(`Worker fatal error: ${err.message}`));
          pendingJobs.delete(id);
        }
        activeWorker?.terminate();
        activeWorker = null;
      };
    } catch (err) {
      console.warn('Could not instantiate encoder module worker, using fallback:', err);
      throw err;
    }
  }
  return activeWorker;
}

export interface WorkerEncoderOptions {
  bitrate?: number;
  bitDepth?: 16 | 24;
  channels?: 1 | 2;
  sampleRate?: number;
  onProgress?: (progress: number) => void;
}

/**
 * Resamples source buffer offline if needed before worker encoding
 */
async function prepareSourceBuffer(
  buffer: AudioBuffer,
  targetChannels: 1 | 2,
  targetSampleRate: number
): Promise<AudioBuffer> {
  if (buffer.sampleRate === targetSampleRate && buffer.numberOfChannels === targetChannels) {
    return buffer;
  }

  const targetLength = Math.max(1, Math.ceil(buffer.duration * targetSampleRate));
  const offlineCtx = new OfflineAudioContext(targetChannels, targetLength, targetSampleRate);
  const sourceNode = offlineCtx.createBufferSource();
  sourceNode.buffer = buffer;
  sourceNode.connect(offlineCtx.destination);
  sourceNode.start(0);
  return await offlineCtx.startRendering();
}

/**
 * Dispatches an encoding job to the Web Worker with transferable Float32 buffers.
 */
export async function runWorkerEncoding(
  action: 'encode-mp3' | 'encode-flac',
  buffer: AudioBuffer,
  options: WorkerEncoderOptions = {}
): Promise<ArrayBuffer> {
  const targetChannels = options.channels || (buffer.numberOfChannels >= 2 ? 2 : 1);
  const targetSampleRate = options.sampleRate || buffer.sampleRate;

  const sourceBuffer = await prepareSourceBuffer(buffer, targetChannels, targetSampleRate);
  const numChannels = sourceBuffer.numberOfChannels as 1 | 2;

  // Copy channel Float32Arrays for zero-copy worker transfer
  const ch0 = new Float32Array(sourceBuffer.getChannelData(0));
  const ch1 = numChannels > 1 ? new Float32Array(sourceBuffer.getChannelData(1)) : null;

  const transferList: Transferable[] = [ch0.buffer];
  if (ch1) transferList.push(ch1.buffer);

  const worker = getOrCreateWorker();
  const id = ++currentJobId;

  return new Promise<ArrayBuffer>((resolve, reject) => {
    pendingJobs.set(id, {
      resolve,
      reject,
      onProgress: options.onProgress
    });

    worker.postMessage(
      {
        type: action,
        id,
        channel0: ch0,
        channel1: ch1,
        numChannels,
        sampleRate: targetSampleRate,
        bitrate: options.bitrate || 192,
        bitDepth: options.bitDepth || 24
      },
      transferList
    );
  });
}
