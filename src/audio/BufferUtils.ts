import type { AudioHistoryRegionPatch, FadeCurve, SignalType } from '../types/audio';
import {
  assertCanCopyEdit,
  copyFloat32Yielding,
  createBufferSafe,
  createYieldScheduler,
  estimateBufferBytes,
  estimatePcmBytes,
  yieldToMain
} from './memoryBudget';

export function createEmptyBuffer(
  ctx: BaseAudioContext,
  numberOfChannels: number,
  lengthInSamples: number,
  sampleRate: number
): AudioBuffer {
  return createBufferSafe(ctx, numberOfChannels, lengthInSamples, sampleRate);
}

export function cloneBuffer(ctx: BaseAudioContext, source: AudioBuffer): AudioBuffer {
  const target = createBufferSafe(
    ctx,
    source.numberOfChannels,
    source.length,
    source.sampleRate
  );
  for (let i = 0; i < source.numberOfChannels; i++) {
    target.getChannelData(i).set(source.getChannelData(i));
  }
  return target;
}

export function sliceBuffer(
  ctx: BaseAudioContext,
  source: AudioBuffer,
  startSec: number,
  endSec: number
): AudioBuffer {
  const sampleRate = source.sampleRate;
  const startSample = Math.max(0, Math.floor(startSec * sampleRate));
  const endSample = Math.min(source.length, Math.floor(endSec * sampleRate));
  const newLength = Math.max(1, endSample - startSample);

  const target = ctx.createBuffer(source.numberOfChannels, newLength, sampleRate);
  for (let c = 0; c < source.numberOfChannels; c++) {
    const srcData = source.getChannelData(c);
    const dstData = target.getChannelData(c);
    dstData.set(srcData.subarray(startSample, endSample));
  }
  return target;
}

export function deleteRegion(
  ctx: BaseAudioContext,
  source: AudioBuffer,
  startSec: number,
  endSec: number
): AudioBuffer {
  const sampleRate = source.sampleRate;
  const startSample = Math.max(0, Math.floor(startSec * sampleRate));
  const endSample = Math.min(source.length, Math.floor(endSec * sampleRate));
  const removeLength = endSample - startSample;
  
  if (removeLength <= 0) return cloneBuffer(ctx, source);
  const newLength = Math.max(1, source.length - removeLength);

  const target = ctx.createBuffer(source.numberOfChannels, newLength, sampleRate);
  for (let c = 0; c < source.numberOfChannels; c++) {
    const srcData = source.getChannelData(c);
    const dstData = target.getChannelData(c);
    
    // Copy first part [0..startSample]
    if (startSample > 0) {
      dstData.set(srcData.subarray(0, startSample), 0);
    }
    // Copy second part [endSample..length]
    if (endSample < source.length) {
      dstData.set(srcData.subarray(endSample, source.length), startSample);
    }
  }
  return target;
}

export function insertSilence(
  ctx: BaseAudioContext,
  source: AudioBuffer,
  atSec: number,
  durationSec: number
): AudioBuffer {
  const sampleRate = source.sampleRate;
  const atSample = Math.min(source.length, Math.max(0, Math.floor(atSec * sampleRate)));
  const silenceSamples = Math.floor(durationSec * sampleRate);
  const newLength = source.length + silenceSamples;

  const target = ctx.createBuffer(source.numberOfChannels, newLength, sampleRate);
  for (let c = 0; c < source.numberOfChannels; c++) {
    const srcData = source.getChannelData(c);
    const dstData = target.getChannelData(c);
    
    if (atSample > 0) {
      dstData.set(srcData.subarray(0, atSample), 0);
    }
    if (atSample < source.length) {
      dstData.set(srcData.subarray(atSample, source.length), atSample + silenceSamples);
    }
  }
  return target;
}

export function muteRegion(
  ctx: BaseAudioContext,
  source: AudioBuffer,
  startSec: number,
  endSec: number
): AudioBuffer {
  const sampleRate = source.sampleRate;
  const channels = source.numberOfChannels;
  const length = source.length;
  const startSample = Math.max(0, Math.floor(startSec * sampleRate));
  const endSample = Math.min(length, Math.floor(endSec * sampleRate));

  const target = ctx.createBuffer(channels, length, sampleRate);
  for (let c = 0; c < channels; c++) {
    const srcData = source.getChannelData(c);
    const dstData = target.getChannelData(c);
    if (startSample > 0) {
      dstData.set(srcData.subarray(0, startSample), 0);
    }
    // [startSample..endSample] is already 0 in newly created AudioBuffer
    if (endSample < length) {
      dstData.set(srcData.subarray(endSample, length), endSample);
    }
  }
  return target;
}

export function applyGain(
  ctx: BaseAudioContext,
  source: AudioBuffer,
  gainDb: number,
  startSec?: number,
  endSec?: number
): AudioBuffer {
  const sampleRate = source.sampleRate;
  const channels = source.numberOfChannels;
  const length = source.length;
  const target = ctx.createBuffer(channels, length, sampleRate);
  const linearGain = Math.pow(10, gainDb / 20);
  
  const startSample = startSec !== undefined ? Math.max(0, Math.floor(startSec * sampleRate)) : 0;
  const endSample = endSec !== undefined ? Math.min(length, Math.floor(endSec * sampleRate)) : length;

  for (let c = 0; c < channels; c++) {
    const srcData = source.getChannelData(c);
    const dstData = target.getChannelData(c);

    if (startSample > 0) {
      dstData.set(srcData.subarray(0, startSample), 0);
    }
    for (let i = startSample; i < endSample; i++) {
      const v = srcData[i] * linearGain;
      dstData[i] = v > 1 ? 1 : v < -1 ? -1 : v;
    }
    if (endSample < length) {
      dstData.set(srcData.subarray(endSample, length), endSample);
    }
  }
  return target;
}

export function normalizeBuffer(
  ctx: BaseAudioContext,
  source: AudioBuffer,
  targetDb: number = 0,
  startSec?: number,
  endSec?: number
): AudioBuffer {
  const sampleRate = source.sampleRate;
  const channels = source.numberOfChannels;
  const length = source.length;
  const startSample = startSec !== undefined ? Math.max(0, Math.floor(startSec * sampleRate)) : 0;
  const endSample = endSec !== undefined ? Math.min(length, Math.floor(endSec * sampleRate)) : length;

  let peak = 0;
  for (let c = 0; c < channels; c++) {
    const data = source.getChannelData(c);
    for (let i = startSample; i < endSample; i++) {
      const absVal = Math.abs(data[i]);
      if (absVal > peak) peak = absVal;
    }
  }

  const target = ctx.createBuffer(channels, length, sampleRate);
  if (peak === 0) {
    for (let c = 0; c < channels; c++) {
      target.getChannelData(c).set(source.getChannelData(c));
    }
    return target;
  }

  const targetLinear = Math.pow(10, targetDb / 20);
  const multiplier = targetLinear / peak;

  for (let c = 0; c < channels; c++) {
    const srcData = source.getChannelData(c);
    const dstData = target.getChannelData(c);
    if (startSample > 0) {
      dstData.set(srcData.subarray(0, startSample), 0);
    }
    for (let i = startSample; i < endSample; i++) {
      const v = srcData[i] * multiplier;
      dstData[i] = v > 1 ? 1 : v < -1 ? -1 : v;
    }
    if (endSample < length) {
      dstData.set(srcData.subarray(endSample, length), endSample);
    }
  }
  return target;
}

export function applyFade(
  ctx: BaseAudioContext,
  source: AudioBuffer,
  startSec: number,
  durationSec: number,
  type: 'in' | 'out',
  curve: FadeCurve = 'linear'
): AudioBuffer {
  const sampleRate = source.sampleRate;
  const channels = source.numberOfChannels;
  const length = source.length;
  const startSample = Math.max(0, Math.floor(startSec * sampleRate));
  const fadeLength = Math.max(1, Math.floor(durationSec * sampleRate));
  const endSample = Math.min(length, startSample + fadeLength);

  const target = ctx.createBuffer(channels, length, sampleRate);

  for (let c = 0; c < channels; c++) {
    const srcData = source.getChannelData(c);
    const dstData = target.getChannelData(c);

    if (startSample > 0) {
      dstData.set(srcData.subarray(0, startSample), 0);
    }
    for (let i = startSample; i < endSample; i++) {
      const progress = (i - startSample) / fadeLength;
      let factor = type === 'in' ? progress : (1 - progress);

      switch (curve) {
        case 'exponential':
          factor = type === 'in' ? Math.pow(progress, 2) : Math.pow(1 - progress, 2);
          break;
        case 'logarithmic':
          factor = type === 'in' ? Math.sqrt(progress) : Math.sqrt(1 - progress);
          break;
        case 's-curve':
          factor = type === 'in' 
            ? (0.5 - 0.5 * Math.cos(progress * Math.PI))
            : (0.5 + 0.5 * Math.cos(progress * Math.PI));
          break;
        case 'linear':
        default:
          break;
      }

      dstData[i] = srcData[i] * factor;
    }
    if (endSample < length) {
      dstData.set(srcData.subarray(endSample, length), endSample);
    }
  }
  return target;
}

export function reverseBuffer(
  ctx: BaseAudioContext,
  source: AudioBuffer,
  startSec?: number,
  endSec?: number
): AudioBuffer {
  const sampleRate = source.sampleRate;
  const channels = source.numberOfChannels;
  const length = source.length;
  const startSample = startSec !== undefined ? Math.max(0, Math.floor(startSec * sampleRate)) : 0;
  const endSample = endSec !== undefined ? Math.min(length, Math.floor(endSec * sampleRate)) : length;

  const target = ctx.createBuffer(channels, length, sampleRate);

  for (let c = 0; c < channels; c++) {
    const srcData = source.getChannelData(c);
    const dstData = target.getChannelData(c);

    if (startSample > 0) {
      dstData.set(srcData.subarray(0, startSample), 0);
    }
    // Reverse directly from source into target without intermediate array allocation
    for (let i = startSample; i < endSample; i++) {
      dstData[i] = srcData[endSample - 1 - (i - startSample)];
    }
    if (endSample < length) {
      dstData.set(srcData.subarray(endSample, length), endSample);
    }
  }
  return target;
}

export function invertPhase(
  ctx: BaseAudioContext,
  source: AudioBuffer,
  startSec?: number,
  endSec?: number
): AudioBuffer {
  const sampleRate = source.sampleRate;
  const channels = source.numberOfChannels;
  const length = source.length;
  const startSample = startSec !== undefined ? Math.max(0, Math.floor(startSec * sampleRate)) : 0;
  const endSample = endSec !== undefined ? Math.min(length, Math.floor(endSec * sampleRate)) : length;

  const target = ctx.createBuffer(channels, length, sampleRate);

  for (let c = 0; c < channels; c++) {
    const srcData = source.getChannelData(c);
    const dstData = target.getChannelData(c);

    if (startSample > 0) {
      dstData.set(srcData.subarray(0, startSample), 0);
    }
    for (let i = startSample; i < endSample; i++) {
      dstData[i] = -srcData[i];
    }
    if (endSample < length) {
      dstData.set(srcData.subarray(endSample, length), endSample);
    }
  }
  return target;
}

export function appendBuffers(
  ctx: BaseAudioContext,
  bufferA: AudioBuffer,
  bufferB: AudioBuffer
): AudioBuffer {
  const channels = Math.max(bufferA.numberOfChannels, bufferB.numberOfChannels);
  const newLength = bufferA.length + bufferB.length;
  const sampleRate = bufferA.sampleRate;

  const target = ctx.createBuffer(channels, newLength, sampleRate);
  for (let c = 0; c < channels; c++) {
    const dst = target.getChannelData(c);
    const srcA = c < bufferA.numberOfChannels ? bufferA.getChannelData(c) : bufferA.getChannelData(0);
    const srcB = c < bufferB.numberOfChannels ? bufferB.getChannelData(c) : bufferB.getChannelData(0);
    dst.set(srcA, 0);
    dst.set(srcB, bufferA.length);
  }
  return target;
}

export function insertBufferAt(
  ctx: BaseAudioContext,
  source: AudioBuffer,
  insertBuf: AudioBuffer,
  atSec: number
): AudioBuffer {
  const sampleRate = source.sampleRate;
  const atSample = Math.min(source.length, Math.max(0, Math.floor(atSec * sampleRate)));
  const insertLength = insertBuf.length;
  const channels = Math.max(source.numberOfChannels, insertBuf.numberOfChannels);
  const newLength = source.length + insertLength;

  const target = ctx.createBuffer(channels, newLength, sampleRate);
  for (let c = 0; c < channels; c++) {
    const dstData = target.getChannelData(c);
    const srcData = c < source.numberOfChannels ? source.getChannelData(c) : source.getChannelData(0);
    const insData = c < insertBuf.numberOfChannels ? insertBuf.getChannelData(c) : insertBuf.getChannelData(0);

    if (atSample > 0) {
      dstData.set(srcData.subarray(0, atSample), 0);
    }
    dstData.set(insData, atSample);
    if (atSample < source.length) {
      dstData.set(srcData.subarray(atSample, source.length), atSample + insertLength);
    }
  }
  return target;
}

export function replaceBufferRegion(
  ctx: BaseAudioContext,
  source: AudioBuffer,
  replaceBuf: AudioBuffer,
  startSec: number,
  endSec: number
): AudioBuffer {
  const sampleRate = source.sampleRate;
  const minSec = Math.min(startSec, endSec);
  const maxSec = Math.max(startSec, endSec);
  const startSample = Math.max(0, Math.floor(minSec * sampleRate));
  const endSample = Math.min(source.length, Math.floor(maxSec * sampleRate));
  const channels = Math.max(source.numberOfChannels, replaceBuf.numberOfChannels);
  const newLength = source.length - (endSample - startSample) + replaceBuf.length;

  const target = ctx.createBuffer(channels, Math.max(1, newLength), sampleRate);
  for (let c = 0; c < channels; c++) {
    const dstData = target.getChannelData(c);
    const srcData = c < source.numberOfChannels ? source.getChannelData(c) : source.getChannelData(0);
    const repData = c < replaceBuf.numberOfChannels ? replaceBuf.getChannelData(c) : replaceBuf.getChannelData(0);

    if (startSample > 0) {
      dstData.set(srcData.subarray(0, startSample), 0);
    }
    dstData.set(repData, startSample);
    if (endSample < source.length) {
      dstData.set(srcData.subarray(endSample, source.length), startSample + replaceBuf.length);
    }
  }
  return target;
}

export function generateSignalBuffer(
  ctx: BaseAudioContext,
  options: {
    type: SignalType;
    frequency: number;
    gainDb: number;
    durationSec: number;
    channels: 1 | 2;
    sampleRate?: number;
  }
): AudioBuffer {
  const sampleRate = options.sampleRate || ctx.sampleRate || 44100;
  const numSamples = Math.max(1, Math.floor(options.durationSec * sampleRate));
  const channels = options.channels;
  const buffer = ctx.createBuffer(channels, numSamples, sampleRate);
  const linearGain = Math.pow(10, options.gainDb / 20);
  const freq = options.frequency;

  for (let c = 0; c < channels; c++) {
    const data = buffer.getChannelData(c);

    if (options.type === 'white-noise') {
      for (let i = 0; i < numSamples; i++) {
        data[i] = (Math.random() * 2 - 1) * linearGain;
      }
    } else if (options.type === 'pink-noise') {
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
      for (let i = 0; i < numSamples; i++) {
        const white = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + white * 0.0555179;
        b1 = 0.99332 * b1 + white * 0.0750759;
        b2 = 0.96900 * b2 + white * 0.1538520;
        b3 = 0.86650 * b3 + white * 0.3104856;
        b4 = 0.55000 * b4 + white * 0.5329522;
        b5 = -0.7616 * b5 - white * 0.0168980;
        const pink = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362;
        b6 = white * 0.115926;
        data[i] = Math.max(-1, Math.min(1, pink * 0.11 * linearGain));
      }
    } else {
      for (let i = 0; i < numSamples; i++) {
        const phase = (i * freq / sampleRate) % 1;
        let val = 0;

        switch (options.type) {
          case 'sine':
            val = Math.sin(2 * Math.PI * phase);
            break;
          case 'square':
            val = phase < 0.5 ? 1.0 : -1.0;
            break;
          case 'triangle':
            val = Math.abs(4 * phase - 2) - 1.0;
            break;
          case 'sawtooth':
            val = 2 * phase - 1.0;
            break;
        }

        data[i] = val * linearGain;
      }
    }
  }

  return buffer;
}

export interface DecimatedPeaks {
  mins: Float32Array[];
  maxs: Float32Array[];
  bucketSize: number;
  totalBuckets: number;
}

// WeakMap cache so AudioBuffer peak calculations are done once and automatically garbage collected
const bufferPeakCache = new WeakMap<AudioBuffer, DecimatedPeaks>();

export function getDecimatedPeaks(buffer: AudioBuffer, numBuckets: number = 8192): DecimatedPeaks {
  const cached = bufferPeakCache.get(buffer);
  if (cached) return cached;

  const length = buffer.length;
  const channels = buffer.numberOfChannels;
  const bucketSize = Math.max(64, Math.floor(length / numBuckets));
  const actualBuckets = Math.ceil(length / bucketSize);

  const mins: Float32Array[] = [];
  const maxs: Float32Array[] = [];

  for (let c = 0; c < channels; c++) {
    const channelData = buffer.getChannelData(c);
    const minArr = new Float32Array(actualBuckets);
    const maxArr = new Float32Array(actualBuckets);

    for (let b = 0; b < actualBuckets; b++) {
      const start = b * bucketSize;
      const end = Math.min(start + bucketSize, length);
      let min = 1.0;
      let max = -1.0;

      // Use a stride within bucket for rapid single-pass calculation
      const stride = bucketSize > 128 ? Math.max(1, Math.floor(bucketSize / 64)) : 1;
      for (let i = start; i < end; i += stride) {
        const v = channelData[i];
        if (v < min) min = v;
        if (v > max) max = v;
      }

      if (max < min) {
        min = 0;
        max = 0;
      }

      minArr[b] = min;
      maxArr[b] = max;
    }

    mins.push(minArr);
    maxs.push(maxArr);
  }

  const result: DecimatedPeaks = {
    mins,
    maxs,
    bucketSize,
    totalBuckets: actualBuckets
  };

  bufferPeakCache.set(buffer, result);
  return result;
}

export function invalidateDecimatedPeaks(buffer: AudioBuffer): void {
  bufferPeakCache.delete(buffer);
}

export function snapshotRegion(
  buffer: AudioBuffer,
  startSample: number,
  endSample: number
): AudioHistoryRegionPatch {
  const start = Math.max(0, Math.floor(startSample));
  const end = Math.min(buffer.length, Math.floor(endSample));
  const length = Math.max(0, end - start);
  const channels: Float32Array[] = [];
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    channels.push(buffer.getChannelData(c).slice(start, start + length));
  }
  return { startSample: start, channels };
}

export function swapRegion(buffer: AudioBuffer, patch: AudioHistoryRegionPatch): void {
  const start = patch.startSample;
  const length = patch.channels[0]?.length ?? 0;
  if (length <= 0) return;
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const live = buffer.getChannelData(c);
    const stored = patch.channels[Math.min(c, patch.channels.length - 1)];
    const tmp = live.slice(start, start + length);
    live.set(stored, start);
    stored.set(tmp);
  }
  invalidateDecimatedPeaks(buffer);
}

export async function cloneBufferAsync(ctx: BaseAudioContext, source: AudioBuffer): Promise<AudioBuffer> {
  assertCanCopyEdit(estimateBufferBytes(source), estimateBufferBytes(source), 'Clone');
  const target = createBufferSafe(ctx, source.numberOfChannels, source.length, source.sampleRate);
  for (let i = 0; i < source.numberOfChannels; i++) {
    await copyFloat32Yielding(target.getChannelData(i), source.getChannelData(i));
  }
  return target;
}

export async function sliceBufferAsync(
  ctx: BaseAudioContext,
  source: AudioBuffer,
  startSec: number,
  endSec: number
): Promise<AudioBuffer> {
  const sampleRate = source.sampleRate;
  const startSample = Math.max(0, Math.floor(startSec * sampleRate));
  const endSample = Math.min(source.length, Math.floor(endSec * sampleRate));
  const newLength = Math.max(1, endSample - startSample);
  assertCanCopyEdit(estimateBufferBytes(source), estimatePcmBytes(newLength, source.numberOfChannels), 'Trim / slice');
  const target = createBufferSafe(ctx, source.numberOfChannels, newLength, sampleRate);
  for (let c = 0; c < source.numberOfChannels; c++) {
    await copyFloat32Yielding(target.getChannelData(c), source.getChannelData(c), 0, startSample, endSample);
  }
  return target;
}

export async function deleteRegionAsync(
  ctx: BaseAudioContext,
  source: AudioBuffer,
  startSec: number,
  endSec: number
): Promise<AudioBuffer> {
  const sampleRate = source.sampleRate;
  const startSample = Math.max(0, Math.floor(startSec * sampleRate));
  const endSample = Math.min(source.length, Math.floor(endSec * sampleRate));
  const removeLength = endSample - startSample;
  if (removeLength <= 0) return cloneBufferAsync(ctx, source);
  const newLength = Math.max(1, source.length - removeLength);
  assertCanCopyEdit(estimateBufferBytes(source), estimatePcmBytes(newLength, source.numberOfChannels), 'Cut');
  const target = createBufferSafe(ctx, source.numberOfChannels, newLength, sampleRate);
  for (let c = 0; c < source.numberOfChannels; c++) {
    const srcData = source.getChannelData(c);
    const dstData = target.getChannelData(c);
    if (startSample > 0) {
      await copyFloat32Yielding(dstData, srcData, 0, 0, startSample);
    }
    if (endSample < source.length) {
      await copyFloat32Yielding(dstData, srcData, startSample, endSample, source.length);
    }
  }
  return target;
}

export async function insertSilenceAsync(
  ctx: BaseAudioContext,
  source: AudioBuffer,
  atSec: number,
  durationSec: number
): Promise<AudioBuffer> {
  const sampleRate = source.sampleRate;
  const atSample = Math.min(source.length, Math.max(0, Math.floor(atSec * sampleRate)));
  const silenceSamples = Math.floor(durationSec * sampleRate);
  const newLength = source.length + silenceSamples;
  assertCanCopyEdit(
    estimateBufferBytes(source),
    estimatePcmBytes(newLength, source.numberOfChannels),
    'Insert silence'
  );
  const target = createBufferSafe(ctx, source.numberOfChannels, newLength, sampleRate);
  for (let c = 0; c < source.numberOfChannels; c++) {
    const srcData = source.getChannelData(c);
    const dstData = target.getChannelData(c);
    if (atSample > 0) {
      await copyFloat32Yielding(dstData, srcData, 0, 0, atSample);
    }
    if (atSample < source.length) {
      await copyFloat32Yielding(dstData, srcData, atSample + silenceSamples, atSample, source.length);
    }
  }
  return target;
}

export async function insertBufferAtAsync(
  ctx: BaseAudioContext,
  source: AudioBuffer,
  insertBuf: AudioBuffer,
  atSec: number
): Promise<AudioBuffer> {
  const sampleRate = source.sampleRate;
  const atSample = Math.min(source.length, Math.max(0, Math.floor(atSec * sampleRate)));
  const insertLength = insertBuf.length;
  const channels = Math.max(source.numberOfChannels, insertBuf.numberOfChannels);
  const newLength = source.length + insertLength;
  assertCanCopyEdit(estimateBufferBytes(source) + estimateBufferBytes(insertBuf), estimatePcmBytes(newLength, channels), 'Insert');
  const target = createBufferSafe(ctx, channels, newLength, sampleRate);
  for (let c = 0; c < channels; c++) {
    const dstData = target.getChannelData(c);
    const srcData = c < source.numberOfChannels ? source.getChannelData(c) : source.getChannelData(0);
    const insData = c < insertBuf.numberOfChannels ? insertBuf.getChannelData(c) : insertBuf.getChannelData(0);
    if (atSample > 0) {
      await copyFloat32Yielding(dstData, srcData, 0, 0, atSample);
    }
    await copyFloat32Yielding(dstData, insData, atSample);
    if (atSample < source.length) {
      await copyFloat32Yielding(dstData, srcData, atSample + insertLength, atSample, source.length);
    }
  }
  return target;
}

export async function replaceBufferRegionAsync(
  ctx: BaseAudioContext,
  source: AudioBuffer,
  replaceBuf: AudioBuffer,
  startSec: number,
  endSec: number
): Promise<AudioBuffer> {
  const sampleRate = source.sampleRate;
  const minSec = Math.min(startSec, endSec);
  const maxSec = Math.max(startSec, endSec);
  const startSample = Math.max(0, Math.floor(minSec * sampleRate));
  const endSample = Math.min(source.length, Math.floor(maxSec * sampleRate));
  const channels = Math.max(source.numberOfChannels, replaceBuf.numberOfChannels);
  const newLength = source.length - (endSample - startSample) + replaceBuf.length;
  assertCanCopyEdit(
    estimateBufferBytes(source) + estimateBufferBytes(replaceBuf),
    estimatePcmBytes(Math.max(1, newLength), channels),
    'Replace region'
  );
  const target = createBufferSafe(ctx, channels, Math.max(1, newLength), sampleRate);
  for (let c = 0; c < channels; c++) {
    const dstData = target.getChannelData(c);
    const srcData = c < source.numberOfChannels ? source.getChannelData(c) : source.getChannelData(0);
    const repData = c < replaceBuf.numberOfChannels ? replaceBuf.getChannelData(c) : replaceBuf.getChannelData(0);
    if (startSample > 0) {
      await copyFloat32Yielding(dstData, srcData, 0, 0, startSample);
    }
    await copyFloat32Yielding(dstData, repData, startSample);
    if (endSample < source.length) {
      await copyFloat32Yielding(dstData, srcData, startSample + replaceBuf.length, endSample, source.length);
    }
  }
  return target;
}

function regionBounds(source: AudioBuffer, startSec?: number, endSec?: number): { start: number; end: number } {
  const start = startSec !== undefined ? Math.max(0, Math.floor(startSec * source.sampleRate)) : 0;
  const end = endSec !== undefined ? Math.min(source.length, Math.floor(endSec * source.sampleRate)) : source.length;
  return { start, end };
}

export async function applyGainInPlace(
  source: AudioBuffer,
  gainDb: number,
  startSec?: number,
  endSec?: number
): Promise<AudioHistoryRegionPatch> {
  const { start, end } = regionBounds(source, startSec, endSec);
  const patch = snapshotRegion(source, start, end);
  const linearGain = Math.pow(10, gainDb / 20);
  const maybeYield = createYieldScheduler();
  for (let c = 0; c < source.numberOfChannels; c++) {
    const data = source.getChannelData(c);
    for (let i = start; i < end; i++) {
      const v = data[i] * linearGain;
      data[i] = v > 1 ? 1 : v < -1 ? -1 : v;
      if ((i & 0xffff) === 0) await maybeYield();
    }
  }
  invalidateDecimatedPeaks(source);
  return patch;
}

export async function muteRegionInPlace(
  source: AudioBuffer,
  startSec: number,
  endSec: number
): Promise<AudioHistoryRegionPatch> {
  const { start, end } = regionBounds(source, startSec, endSec);
  const patch = snapshotRegion(source, start, end);
  for (let c = 0; c < source.numberOfChannels; c++) {
    source.getChannelData(c).fill(0, start, end);
  }
  invalidateDecimatedPeaks(source);
  await yieldToMain();
  return patch;
}

export async function normalizeBufferInPlace(
  source: AudioBuffer,
  targetDb: number = 0,
  startSec?: number,
  endSec?: number
): Promise<AudioHistoryRegionPatch> {
  const { start, end } = regionBounds(source, startSec, endSec);
  const patch = snapshotRegion(source, start, end);
  const maybeYield = createYieldScheduler();

  let peak = 0;
  for (let c = 0; c < source.numberOfChannels; c++) {
    const data = source.getChannelData(c);
    for (let i = start; i < end; i++) {
      const absVal = Math.abs(data[i]);
      if (absVal > peak) peak = absVal;
      if ((i & 0xffff) === 0) await maybeYield();
    }
  }

  if (peak === 0) {
    invalidateDecimatedPeaks(source);
    return patch;
  }

  const multiplier = Math.pow(10, targetDb / 20) / peak;
  for (let c = 0; c < source.numberOfChannels; c++) {
    const data = source.getChannelData(c);
    for (let i = start; i < end; i++) {
      const v = data[i] * multiplier;
      data[i] = v > 1 ? 1 : v < -1 ? -1 : v;
      if ((i & 0xffff) === 0) await maybeYield();
    }
  }
  invalidateDecimatedPeaks(source);
  return patch;
}

export async function applyFadeInPlace(
  source: AudioBuffer,
  startSec: number,
  durationSec: number,
  type: 'in' | 'out',
  curve: FadeCurve = 'linear'
): Promise<AudioHistoryRegionPatch> {
  const sampleRate = source.sampleRate;
  const startSample = Math.max(0, Math.floor(startSec * sampleRate));
  const fadeLength = Math.max(1, Math.floor(durationSec * sampleRate));
  const endSample = Math.min(source.length, startSample + fadeLength);
  const patch = snapshotRegion(source, startSample, endSample);
  const maybeYield = createYieldScheduler();

  for (let c = 0; c < source.numberOfChannels; c++) {
    const data = source.getChannelData(c);
    for (let i = startSample; i < endSample; i++) {
      const progress = (i - startSample) / fadeLength;
      let factor = type === 'in' ? progress : (1 - progress);
      switch (curve) {
        case 'exponential':
          factor = type === 'in' ? Math.pow(progress, 2) : Math.pow(1 - progress, 2);
          break;
        case 'logarithmic':
          factor = type === 'in' ? Math.sqrt(progress) : Math.sqrt(1 - progress);
          break;
        case 's-curve':
          factor = type === 'in'
            ? (0.5 - 0.5 * Math.cos(progress * Math.PI))
            : (0.5 + 0.5 * Math.cos(progress * Math.PI));
          break;
        default:
          break;
      }
      data[i] *= factor;
      if ((i & 0xffff) === 0) await maybeYield();
    }
  }
  invalidateDecimatedPeaks(source);
  return patch;
}

export async function reverseBufferInPlace(
  source: AudioBuffer,
  startSec?: number,
  endSec?: number
): Promise<AudioHistoryRegionPatch> {
  const { start, end } = regionBounds(source, startSec, endSec);
  const patch = snapshotRegion(source, start, end);
  const maybeYield = createYieldScheduler();
  const last = end - 1;
  const mid = start + Math.floor((end - start) / 2);
  for (let c = 0; c < source.numberOfChannels; c++) {
    const data = source.getChannelData(c);
    for (let i = start, j = last; i < mid; i++, j--) {
      const tmp = data[i];
      data[i] = data[j];
      data[j] = tmp;
      if ((i & 0xffff) === 0) await maybeYield();
    }
  }
  invalidateDecimatedPeaks(source);
  return patch;
}

export async function invertPhaseInPlace(
  source: AudioBuffer,
  startSec?: number,
  endSec?: number
): Promise<AudioHistoryRegionPatch> {
  const { start, end } = regionBounds(source, startSec, endSec);
  const patch = snapshotRegion(source, start, end);
  const maybeYield = createYieldScheduler();
  for (let c = 0; c < source.numberOfChannels; c++) {
    const data = source.getChannelData(c);
    for (let i = start; i < end; i++) {
      data[i] = -data[i];
      if ((i & 0xffff) === 0) await maybeYield();
    }
  }
  invalidateDecimatedPeaks(source);
  return patch;
}

/**
 * Time-stretches an AudioBuffer at a specified speed multiplier.
 * @param ctx BaseAudioContext
 * @param source AudioBuffer to transform
 * @param speed Speed multiplier (e.g. 0.25x to 2.0x)
 * @param keepPitch When true (default), pitch is preserved (time-stretch). When false, pitch shifts with speed (resampling/tape/vinyl).
 * @param startSec Optional start time in seconds
 * @param endSec Optional end time in seconds
 */
export function timeStretchBuffer(
  ctx: BaseAudioContext,
  source: AudioBuffer,
  speed: number,
  keepPitch: boolean = true,
  startSec?: number,
  endSec?: number
): AudioBuffer {
  const safeSpeed = Math.max(0.1, Math.min(10.0, speed));
  const isNoOp = Math.abs(safeSpeed - 1.0) < 0.005;

  // Handle region selection
  if (startSec !== undefined && endSec !== undefined && (endSec - startSec) < source.duration) {
    const minSec = Math.max(0, Math.min(startSec, endSec));
    const maxSec = Math.min(source.duration, Math.max(startSec, endSec));
    if (maxSec - minSec <= 0.001 || isNoOp) {
      return cloneBuffer(ctx, source);
    }
    const region = sliceBuffer(ctx, source, minSec, maxSec);
    const stretchedRegion = timeStretchBuffer(ctx, region, safeSpeed, keepPitch);
    return replaceBufferRegion(ctx, source, stretchedRegion, minSec, maxSec);
  }

  if (isNoOp) {
    return cloneBuffer(ctx, source);
  }

  const numChannels = source.numberOfChannels;
  const inLen = source.length;
  const sampleRate = source.sampleRate;
  const outLen = Math.max(1, Math.floor(inLen / safeSpeed));
  const target = ctx.createBuffer(numChannels, outLen, sampleRate);

  if (!keepPitch) {
    // Linear interpolation resampling (pitch changes with speed)
    for (let c = 0; c < numChannels; c++) {
      const src = source.getChannelData(c);
      const dst = target.getChannelData(c);
      for (let i = 0; i < outLen; i++) {
        const srcPos = i * safeSpeed;
        const idx = Math.floor(srcPos);
        const frac = srcPos - idx;
        const s0 = idx < inLen ? src[idx] : src[inLen - 1];
        const s1 = (idx + 1) < inLen ? src[idx + 1] : src[inLen - 1];
        dst[i] = s0 + frac * (s1 - s0);
      }
    }
    return target;
  }

  // WSOLA Time-Stretching (preserves pitch)
  const N = sampleRate > 48000 ? 2048 : 1024;
  const Hs = N >> 1; // 50% overlap synthesis hop
  const searchRange = Math.min(256, Hs);

  // Precomputed Hann window
  const win = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    win[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / N));
  }

  const ch0 = source.getChannelData(0);
  const srcChannels: Float32Array[] = [];
  const dstChannels: Float32Array[] = [];
  for (let c = 0; c < numChannels; c++) {
    srcChannels.push(source.getChannelData(c));
    dstChannels.push(target.getChannelData(c));
  }

  // First frame copy
  let prevCandidate = 0;
  const initialLen = Math.min(N, inLen, outLen);
  for (let c = 0; c < numChannels; c++) {
    const src = srcChannels[c];
    const dst = dstChannels[c];
    for (let i = 0; i < initialLen; i++) {
      dst[i] = src[i] * win[i];
    }
  }

  let synPos = Hs;

  while (synPos + N <= outLen) {
    const targetAna = Math.round(synPos * safeSpeed);
    const natCont = prevCandidate + Hs;

    const minSearch = Math.max(0, targetAna - searchRange);
    const maxSearch = Math.min(inLen - N, targetAna + searchRange);

    let bestCand = Math.max(0, Math.min(inLen - N, targetAna));
    let maxCorr = -Infinity;

    if (natCont + Hs <= inLen && minSearch <= maxSearch) {
      for (let cand = minSearch; cand <= maxSearch; cand += 4) {
        let corr = 0;
        for (let k = 0; k < Hs; k += 8) {
          corr += ch0[cand + k] * ch0[natCont + k];
        }
        if (corr > maxCorr) {
          maxCorr = corr;
          bestCand = cand;
        }
      }
    }

    for (let c = 0; c < numChannels; c++) {
      const src = srcChannels[c];
      const dst = dstChannels[c];
      for (let i = 0; i < N; i++) {
        dst[synPos + i] += src[bestCand + i] * win[i];
      }
    }

    prevCandidate = bestCand;
    synPos += Hs;
  }

  return target;
}

/**
 * Cooperative WSOLA / resample so hour-long files cannot freeze or watchdog-kill Safari.
 */
export async function timeStretchBufferAsync(
  ctx: BaseAudioContext,
  source: AudioBuffer,
  speed: number,
  keepPitch: boolean = true,
  startSec?: number,
  endSec?: number
): Promise<AudioBuffer> {
  const safeSpeed = Math.max(0.1, Math.min(10.0, speed));
  const isNoOp = Math.abs(safeSpeed - 1.0) < 0.005;

  if (startSec !== undefined && endSec !== undefined && (endSec - startSec) < source.duration) {
    const minSec = Math.max(0, Math.min(startSec, endSec));
    const maxSec = Math.min(source.duration, Math.max(startSec, endSec));
    if (maxSec - minSec <= 0.001 || isNoOp) {
      return cloneBufferAsync(ctx, source);
    }
    const region = await sliceBufferAsync(ctx, source, minSec, maxSec);
    const stretchedRegion = await timeStretchBufferAsync(ctx, region, safeSpeed, keepPitch);
    return replaceBufferRegionAsync(ctx, source, stretchedRegion, minSec, maxSec);
  }

  if (isNoOp) {
    return cloneBufferAsync(ctx, source);
  }

  const numChannels = source.numberOfChannels;
  const inLen = source.length;
  const sampleRate = source.sampleRate;
  const outLen = Math.max(1, Math.floor(inLen / safeSpeed));
  assertCanCopyEdit(estimateBufferBytes(source), estimatePcmBytes(outLen, numChannels), 'Speed transform');
  const target = createBufferSafe(ctx, numChannels, outLen, sampleRate);
  const maybeYield = createYieldScheduler();

  if (!keepPitch) {
    for (let c = 0; c < numChannels; c++) {
      const src = source.getChannelData(c);
      const dst = target.getChannelData(c);
      for (let i = 0; i < outLen; i++) {
        const srcPos = i * safeSpeed;
        const idx = Math.floor(srcPos);
        const frac = srcPos - idx;
        const s0 = idx < inLen ? src[idx] : src[inLen - 1];
        const s1 = (idx + 1) < inLen ? src[idx + 1] : src[inLen - 1];
        dst[i] = s0 + frac * (s1 - s0);
        if ((i & 0xffff) === 0) await maybeYield();
      }
    }
    return target;
  }

  const N = sampleRate > 48000 ? 2048 : 1024;
  const Hs = N >> 1;
  const searchRange = Math.min(256, Hs);

  const win = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    win[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / N));
  }

  const ch0 = source.getChannelData(0);
  const srcChannels: Float32Array[] = [];
  const dstChannels: Float32Array[] = [];
  for (let c = 0; c < numChannels; c++) {
    srcChannels.push(source.getChannelData(c));
    dstChannels.push(target.getChannelData(c));
  }

  let prevCandidate = 0;
  const initialLen = Math.min(N, inLen, outLen);
  for (let c = 0; c < numChannels; c++) {
    const src = srcChannels[c];
    const dst = dstChannels[c];
    for (let i = 0; i < initialLen; i++) {
      dst[i] = src[i] * win[i];
    }
  }

  let synPos = Hs;
  let hops = 0;

  while (synPos + N <= outLen) {
    const targetAna = Math.round(synPos * safeSpeed);
    const natCont = prevCandidate + Hs;

    const minSearch = Math.max(0, targetAna - searchRange);
    const maxSearch = Math.min(inLen - N, targetAna + searchRange);

    let bestCand = Math.max(0, Math.min(inLen - N, targetAna));
    let maxCorr = -Infinity;

    if (natCont + Hs <= inLen && minSearch <= maxSearch) {
      for (let cand = minSearch; cand <= maxSearch; cand += 4) {
        let corr = 0;
        for (let k = 0; k < Hs; k += 8) {
          corr += ch0[cand + k] * ch0[natCont + k];
        }
        if (corr > maxCorr) {
          maxCorr = corr;
          bestCand = cand;
        }
      }
    }

    for (let c = 0; c < numChannels; c++) {
      const src = srcChannels[c];
      const dst = dstChannels[c];
      for (let i = 0; i < N; i++) {
        dst[synPos + i] += src[bestCand + i] * win[i];
      }
    }

    prevCandidate = bestCand;
    synPos += Hs;
    hops++;
    if ((hops & 15) === 0) await maybeYield();
  }

  return target;
}

