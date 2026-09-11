/**
 * Chunked OfflineAudioContext rendering.
 *
 * iOS/iPadOS WebKit throws or Jetsam-kills the tab when a single OfflineAudioContext
 * covers tens of minutes of audio. Processing 12–45 s slices with overlap
 * (IIR warmup + convolution tail) stays under that limit.
 */

import {
  copyFloat32Yielding,
  createBufferSafe,
  createYieldScheduler,
  getMemoryProfile,
  yieldToMain
} from './memoryBudget';

export type OfflineGraphBuilder = (
  ctx: OfflineAudioContext,
  sourceNode: AudioBufferSourceNode
) => void;

export interface ChunkedOfflineOptions {
  playbackRate?: number;
  /** Look-back to warm IIR / compressor state (discarded from output). */
  overlapSec?: number;
  /** Extra rendered silence after the last slice so convolution can ring out. */
  tailSec?: number;
  outputChannels?: number;
  onProgress?: (progress: number) => void;
}

function extractSlice(
  ctx: BaseAudioContext,
  source: AudioBuffer,
  startSample: number,
  endSample: number
): AudioBuffer {
  const start = Math.max(0, startSample);
  const end = Math.min(source.length, endSample);
  const length = Math.max(1, end - start);
  const slice = ctx.createBuffer(source.numberOfChannels, length, source.sampleRate);
  for (let c = 0; c < source.numberOfChannels; c++) {
    slice.getChannelData(c).set(source.getChannelData(c).subarray(start, end));
  }
  return slice;
}

function crossfadeAdd(
  dest: Float32Array,
  destOffset: number,
  src: Float32Array,
  srcOffset: number,
  fadeSamples: number
): void {
  const n = fadeSamples;
  if (n <= 0) return;
  for (let i = 0; i < n; i++) {
    const t = i / n;
    dest[destOffset + i] = dest[destOffset + i] * (1 - t) + src[srcOffset + i] * t;
  }
}

/**
 * Render `source` through a Web Audio graph in memory-safe chunks.
 * `builder` must connect `sourceNode` into `ctx.destination`.
 */
export async function renderOfflineChunked(
  source: AudioBuffer,
  builder: OfflineGraphBuilder,
  options: ChunkedOfflineOptions = {}
): Promise<AudioBuffer> {
  const rate = Math.max(0.05, options.playbackRate ?? 1);
  const profile = getMemoryProfile();
  const overlapSec = Math.max(0.05, options.overlapSec ?? 0.2);
  const tailSec = Math.max(0, options.tailSec ?? overlapSec);
  const outChannels = options.outputChannels ?? source.numberOfChannels;
  const sampleRate = source.sampleRate;
  const outputLength = Math.max(1, Math.floor(source.length / rate));

  const dummy = new OfflineAudioContext(1, 1, sampleRate);
  const output = createBufferSafe(dummy, outChannels, outputLength, sampleRate);

  const chunkSrc = Math.max(1, Math.floor(profile.offlineChunkSec * sampleRate));
  const overlapSrc = Math.max(1, Math.floor(overlapSec * sampleRate));
  const tailSrc = Math.max(0, Math.floor(tailSec * sampleRate));
  const maybeYield = createYieldScheduler();

  let srcPos = 0;
  let chunkIndex = 0;
  const totalChunks = Math.max(1, Math.ceil(source.length / chunkSrc));

  while (srcPos < source.length) {
    const isFirst = srcPos === 0;
    const isLast = srcPos + chunkSrc >= source.length;
    const sliceStart = Math.max(0, srcPos - (isFirst ? 0 : overlapSrc));
    const sliceEnd = Math.min(source.length, srcPos + chunkSrc + overlapSrc);
    const slice = extractSlice(dummy, source, sliceStart, sliceEnd);

    const sliceOutLen = Math.max(1, Math.floor(slice.length / rate));
    const extraTail = isLast ? Math.floor(tailSrc / rate) : 0;
    const offlineLen = Math.max(1, sliceOutLen + extraTail);

    const offlineCtx = new OfflineAudioContext(outChannels, offlineLen, sampleRate);
    const sourceNode = offlineCtx.createBufferSource();
    sourceNode.buffer = slice;
    sourceNode.playbackRate.value = rate;
    builder(offlineCtx, sourceNode);
    sourceNode.start(0);

    const rendered = await offlineCtx.startRendering();

    const destPos = Math.min(outputLength, Math.round(srcPos / rate));
    const renderedOffset = Math.round((srcPos - sliceStart) / rate);
    const copyLen = Math.min(outputLength - destPos, rendered.length - renderedOffset);
    if (copyLen > 0 && destPos < outputLength) {
      const fade = isFirst ? 0 : Math.min(Math.round(overlapSrc / rate), copyLen);
      for (let c = 0; c < outChannels; c++) {
        const dst = output.getChannelData(c);
        const srcCh = rendered.getChannelData(Math.min(c, rendered.numberOfChannels - 1));
        if (fade > 0) {
          crossfadeAdd(dst, destPos, srcCh, renderedOffset, fade);
          if (copyLen > fade) {
            dst.set(
              srcCh.subarray(renderedOffset + fade, renderedOffset + copyLen),
              destPos + fade
            );
          }
        } else {
          dst.set(srcCh.subarray(renderedOffset, renderedOffset + copyLen), destPos);
        }
      }
    }

    srcPos += chunkSrc;
    chunkIndex++;
    options.onProgress?.(Math.min(0.99, chunkIndex / totalChunks));
    await maybeYield();
    await yieldToMain();
  }

  options.onProgress?.(1);
  return output;
}

/**
 * Channel/sample-rate convert without one giant OfflineAudioContext.
 */
export async function resampleBufferChunked(
  buffer: AudioBuffer,
  targetChannels: number,
  targetSampleRate: number,
  onProgress?: (progress: number) => void
): Promise<AudioBuffer> {
  if (buffer.sampleRate === targetSampleRate && buffer.numberOfChannels === targetChannels) {
    return buffer;
  }

  const ratio = targetSampleRate / buffer.sampleRate;
  const outputLength = Math.max(1, Math.ceil(buffer.length * ratio));
  const dummy = new OfflineAudioContext(1, 1, targetSampleRate);
  const output = createBufferSafe(dummy, targetChannels, outputLength, targetSampleRate);

  const profile = getMemoryProfile();
  const chunkSrc = Math.max(1, Math.floor(profile.offlineChunkSec * buffer.sampleRate));
  const overlapSrc = Math.min(buffer.sampleRate, Math.floor(0.03 * buffer.sampleRate));
  const maybeYield = createYieldScheduler();
  const totalChunks = Math.max(1, Math.ceil(buffer.length / chunkSrc));

  let srcPos = 0;
  let chunkIndex = 0;

  while (srcPos < buffer.length) {
    const isFirst = srcPos === 0;
    const sliceStart = Math.max(0, srcPos - (isFirst ? 0 : overlapSrc));
    const sliceEnd = Math.min(buffer.length, srcPos + chunkSrc + overlapSrc);
    const slice = extractSlice(dummy, buffer, sliceStart, sliceEnd);

    const sliceOut = Math.max(1, Math.ceil(slice.length * ratio));
    const offlineCtx = new OfflineAudioContext(targetChannels, sliceOut, targetSampleRate);
    const sourceNode = offlineCtx.createBufferSource();
    sourceNode.buffer = slice;
    sourceNode.connect(offlineCtx.destination);
    sourceNode.start(0);
    const rendered = await offlineCtx.startRendering();

    const destPos = Math.min(outputLength, Math.round(srcPos * ratio));
    const renderedOffset = Math.round((srcPos - sliceStart) * ratio);
    const copyLen = Math.min(outputLength - destPos, rendered.length - renderedOffset);

    if (copyLen > 0) {
      const fade = isFirst ? 0 : Math.min(Math.round(overlapSrc * ratio), copyLen);
      for (let c = 0; c < targetChannels; c++) {
        const dst = output.getChannelData(c);
        const srcCh = rendered.getChannelData(Math.min(c, rendered.numberOfChannels - 1));
        if (fade > 0) {
          crossfadeAdd(dst, destPos, srcCh, renderedOffset, fade);
          if (copyLen > fade) {
            dst.set(
              srcCh.subarray(renderedOffset + fade, renderedOffset + copyLen),
              destPos + fade
            );
          }
        } else {
          await copyFloat32Yielding(
            dst,
            srcCh,
            destPos,
            renderedOffset,
            renderedOffset + copyLen
          );
        }
      }
    }

    srcPos += chunkSrc;
    chunkIndex++;
    onProgress?.(Math.min(0.99, chunkIndex / totalChunks));
    await maybeYield();
  }

  onProgress?.(1);
  return output;
}
