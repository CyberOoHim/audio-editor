import type { FadeCurve, SignalType } from '../types/audio';

export function createEmptyBuffer(
  ctx: BaseAudioContext,
  numberOfChannels: number,
  lengthInSamples: number,
  sampleRate: number
): AudioBuffer {
  const safeLength = Math.max(1, Math.floor(lengthInSamples));
  return ctx.createBuffer(numberOfChannels, safeLength, sampleRate);
}

export function cloneBuffer(ctx: BaseAudioContext, source: AudioBuffer): AudioBuffer {
  const target = ctx.createBuffer(
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
  const target = cloneBuffer(ctx, source);
  const sampleRate = target.sampleRate;
  const startSample = Math.max(0, Math.floor(startSec * sampleRate));
  const endSample = Math.min(target.length, Math.floor(endSec * sampleRate));

  for (let c = 0; c < target.numberOfChannels; c++) {
    const dstData = target.getChannelData(c);
    for (let i = startSample; i < endSample; i++) {
      dstData[i] = 0;
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
  const target = cloneBuffer(ctx, source);
  const linearGain = Math.pow(10, gainDb / 20);
  const sampleRate = target.sampleRate;
  
  const startSample = startSec !== undefined ? Math.max(0, Math.floor(startSec * sampleRate)) : 0;
  const endSample = endSec !== undefined ? Math.min(target.length, Math.floor(endSec * sampleRate)) : target.length;

  for (let c = 0; c < target.numberOfChannels; c++) {
    const dstData = target.getChannelData(c);
    for (let i = startSample; i < endSample; i++) {
      dstData[i] = Math.max(-1, Math.min(1, dstData[i] * linearGain));
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
  const target = cloneBuffer(ctx, source);
  const sampleRate = target.sampleRate;
  
  const startSample = startSec !== undefined ? Math.max(0, Math.floor(startSec * sampleRate)) : 0;
  const endSample = endSec !== undefined ? Math.min(target.length, Math.floor(endSec * sampleRate)) : target.length;

  let peak = 0;
  for (let c = 0; c < target.numberOfChannels; c++) {
    const data = target.getChannelData(c);
    for (let i = startSample; i < endSample; i++) {
      const absVal = Math.abs(data[i]);
      if (absVal > peak) peak = absVal;
    }
  }

  if (peak === 0) return target;

  const targetLinear = Math.pow(10, targetDb / 20);
  const multiplier = targetLinear / peak;

  for (let c = 0; c < target.numberOfChannels; c++) {
    const dstData = target.getChannelData(c);
    for (let i = startSample; i < endSample; i++) {
      dstData[i] = Math.max(-1, Math.min(1, dstData[i] * multiplier));
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
  const target = cloneBuffer(ctx, source);
  const sampleRate = target.sampleRate;
  const startSample = Math.max(0, Math.floor(startSec * sampleRate));
  const fadeLength = Math.max(1, Math.floor(durationSec * sampleRate));
  const endSample = Math.min(target.length, startSample + fadeLength);

  for (let c = 0; c < target.numberOfChannels; c++) {
    const data = target.getChannelData(c);
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

      data[i] = data[i] * factor;
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
  const target = cloneBuffer(ctx, source);
  const sampleRate = target.sampleRate;
  const startSample = startSec !== undefined ? Math.max(0, Math.floor(startSec * sampleRate)) : 0;
  const endSample = endSec !== undefined ? Math.min(target.length, Math.floor(endSec * sampleRate)) : target.length;

  for (let c = 0; c < target.numberOfChannels; c++) {
    const data = target.getChannelData(c);
    const region = data.subarray(startSample, endSample);
    const reversed = new Float32Array(region).reverse();
    data.set(reversed, startSample);
  }
  return target;
}

export function invertPhase(
  ctx: BaseAudioContext,
  source: AudioBuffer,
  startSec?: number,
  endSec?: number
): AudioBuffer {
  const target = cloneBuffer(ctx, source);
  const sampleRate = target.sampleRate;
  const startSample = startSec !== undefined ? Math.max(0, Math.floor(startSec * sampleRate)) : 0;
  const endSample = endSec !== undefined ? Math.min(target.length, Math.floor(endSec * sampleRate)) : target.length;

  for (let c = 0; c < target.numberOfChannels; c++) {
    const data = target.getChannelData(c);
    for (let i = startSample; i < endSample; i++) {
      data[i] = -data[i];
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

export function getDecimatedPeaks(buffer: AudioBuffer, numBuckets: number = 4096): DecimatedPeaks {
  const cached = bufferPeakCache.get(buffer);
  if (cached) return cached;

  const length = buffer.length;
  const channels = buffer.numberOfChannels;
  const bucketSize = Math.max(1, Math.floor(length / numBuckets));
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

      // Use a stride of 1 or 2 inside bucket for high precision
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

