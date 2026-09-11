/**
 * High-Performance Client-Side Audio DSP Separation Engine
 * Implements Fast Fourier Transform (FFT), Center-Pan Coherence,
 * Vocal Formant Masking, and Residual Instrumental Extraction.
 *
 * Operates safely within iPad Safari memory budgets with cooperative yielding.
 */

import type { VocalRangePreset, VocalSeparationSettings } from '../../types/audio';
import { yieldToMain } from '../memoryBudget';

export interface SeparationProgressCallback {
  (progress: number, stageText: string): void;
}

export function getVocalRangeFrequencies(preset: VocalRangePreset): { minHz: number; maxHz: number } {
  switch (preset) {
    case 'female-high':
      return { minHz: 200, maxHz: 4800 };
    case 'male-low':
      return { minHz: 90, maxHz: 3500 };
    case 'speech-lead':
      return { minHz: 120, maxHz: 3200 };
    case 'all':
    default:
      return { minHz: 110, maxHz: 4500 };
  }
}

// Precomputed FFT tables for standard 2048 frame size
class FastFourierTransform {
  readonly size: number;
  private readonly cosTable: Float32Array;
  private readonly sinTable: Float32Array;
  private readonly bitReverse: Uint32Array;
  readonly window: Float32Array;

  constructor(size: number = 2048) {
    this.size = size;
    const half = size / 2;
    this.cosTable = new Float32Array(half);
    this.sinTable = new Float32Array(half);
    for (let i = 0; i < half; i++) {
      const angle = (-2 * Math.PI * i) / size;
      this.cosTable[i] = Math.cos(angle);
      this.sinTable[i] = Math.sin(angle);
    }

    // Bit reversal index table
    this.bitReverse = new Uint32Array(size);
    let j = 0;
    for (let i = 0; i < size; i++) {
      this.bitReverse[i] = j;
      let bit = size >> 1;
      while (bit <= j) {
        j -= bit;
        bit >>= 1;
      }
      j += bit;
    }

    // Precompute Hann Window
    this.window = new Float32Array(size);
    for (let i = 0; i < size; i++) {
      this.window[i] = 0.5 * (1.0 - Math.cos((2 * Math.PI * i) / (size - 1)));
    }
  }

  // Radix-2 in-place Cooley-Tukey FFT
  forward(real: Float32Array, imag: Float32Array): void {
    const n = this.size;
    // Bit reversal ordering
    for (let i = 0; i < n; i++) {
      const rev = this.bitReverse[i];
      if (i < rev) {
        const tr = real[i];
        real[i] = real[rev];
        real[rev] = tr;
        const ti = imag[i];
        imag[i] = imag[rev];
        imag[rev] = ti;
      }
    }

    // Cooley-Tukey stages
    for (let len = 2; len <= n; len <<= 1) {
      const halfLen = len >> 1;
      const step = n / len;
      for (let i = 0; i < n; i += len) {
        for (let k = 0; k < halfLen; k++) {
          const cosVal = this.cosTable[k * step];
          const sinVal = this.sinTable[k * step];
          const tr = real[i + k + halfLen] * cosVal - imag[i + k + halfLen] * sinVal;
          const ti = real[i + k + halfLen] * sinVal + imag[i + k + halfLen] * cosVal;

          real[i + k + halfLen] = real[i + k] - tr;
          imag[i + k + halfLen] = imag[i + k] - ti;
          real[i + k] += tr;
          imag[i + k] += ti;
        }
      }
    }
  }

  // Inverse FFT
  inverse(real: Float32Array, imag: Float32Array): void {
    const n = this.size;
    // Invert imaginary parts
    for (let i = 0; i < n; i++) {
      imag[i] = -imag[i];
    }
    this.forward(real, imag);
    // Scale by 1/N and re-invert
    const invN = 1.0 / n;
    for (let i = 0; i < n; i++) {
      real[i] *= invN;
      imag[i] = -imag[i] * invN;
    }
  }
}

// Global cached instance
let fftInstance: FastFourierTransform | null = null;
function getFft(): FastFourierTransform {
  if (!fftInstance) {
    fftInstance = new FastFourierTransform(2048);
  }
  return fftInstance;
}

/**
 * Executes high-precision On-Device Vocal & Instrumental Stem Separation.
 */
export async function processAudioSeparation(
  channels: Float32Array[],
  sampleRate: number,
  settings: VocalSeparationSettings,
  onProgress?: SeparationProgressCallback
): Promise<{
  vocalChannels: Float32Array[];
  instrumentalChannels: Float32Array[];
  outputChannels: Float32Array[];
}> {
  const numChannels = channels.length;
  const numSamples = channels[0].length;
  const isStereo = numChannels >= 2;

  const fft = getFft();
  const fftSize = fft.size;
  const hopSize = 512; // 75% overlap for artifact-free STFT synthesis
  const halfFft = fftSize >> 1;
  const numFrames = Math.max(1, Math.floor((numSamples - fftSize) / hopSize) + 1);

  const { minHz, maxHz } = getVocalRangeFrequencies(settings.vocalRange);

  // Allocate Vocal PCM channels and Normalization Window Accumulator
  const vocalChannels: Float32Array[] = [];
  for (let c = 0; c < numChannels; c++) {
    vocalChannels.push(new Float32Array(numSamples));
  }
  const windowAccum = new Float32Array(numSamples);

  // Scratch frame buffers
  const frameRealL = new Float32Array(fftSize);
  const frameImagL = new Float32Array(fftSize);
  const frameRealR = new Float32Array(fftSize);
  const frameImagR = new Float32Array(fftSize);
  const synthVocalRealL = new Float32Array(fftSize);
  const synthVocalImagL = new Float32Array(fftSize);
  const synthVocalRealR = new Float32Array(fftSize);
  const synthVocalImagR = new Float32Array(fftSize);

  // Pre-calculate frequency map and vocal frequency weights
  const vocalFreqWeights = new Float32Array(halfFft);
  const binHz = sampleRate / fftSize;
  for (let k = 0; k < halfFft; k++) {
    const f = k * binHz;
    if (f < minHz * 0.7 || f > maxHz * 1.5) {
      vocalFreqWeights[k] = 0.05;
    } else {
      let weight = 1.0;
      if (f < minHz) {
        weight = (f - minHz * 0.7) / (minHz * 0.3 + 0.001);
      } else if (f > maxHz) {
        weight = 1.0 - (f - maxHz) / (maxHz * 0.5 + 0.001);
      }
      // Formant center bell boost
      const formantCenter = 1800;
      const formantWidth = 1200;
      const dist = Math.abs(f - formantCenter) / formantWidth;
      const formantBoost = 1.0 + 0.35 * Math.exp(-dist * dist);
      vocalFreqWeights[k] = Math.max(0, Math.min(1.35, weight * formantBoost));
    }
  }

  const debleed = Math.max(0, Math.min(1, settings.debleedStrength));
  const sensitivity = Math.max(0.2, Math.min(2.5, settings.vocalSensitivity));
  const centerWeight = Math.max(0, Math.min(1, settings.stereoCenterWeight));

  const window = fft.window;
  let lastYieldTime = performance.now();

  onProgress?.(5, 'Analyzing audio spectrogram…');

  // Process frames
  for (let frame = 0; frame < numFrames; frame++) {
    const startSample = frame * hopSize;

    // Window input frame
    for (let i = 0; i < fftSize; i++) {
      const sIdx = startSample + i;
      const w = window[i];
      if (sIdx < numSamples) {
        frameRealL[i] = channels[0][sIdx] * w;
        frameRealR[i] = isStereo ? channels[1][sIdx] * w : frameRealL[i];
      } else {
        frameRealL[i] = 0;
        frameRealR[i] = 0;
      }
      frameImagL[i] = 0;
      frameImagR[i] = 0;
    }

    // FFT on Left and Right channels
    fft.forward(frameRealL, frameImagL);
    if (isStereo) {
      fft.forward(frameRealR, frameImagR);
    }

    // Spectrogram Masking
    for (let k = 0; k < halfFft; k++) {
      const realL = frameRealL[k];
      const imagL = frameImagL[k];
      const magL = Math.sqrt(realL * realL + imagL * imagL);

      let magR = magL;
      let realR = realL;
      let imagR = imagL;
      if (isStereo) {
        realR = frameRealR[k];
        imagR = frameImagR[k];
        magR = Math.sqrt(realR * realR + imagR * imagR);
      }

      // 1. Stereo Center-Pan Coherence
      let panCoherence = 1.0;
      if (isStereo) {
        const diff = Math.abs(magL - magR);
        const sum = magL + magR + 1e-6;
        const stereoDiffRatio = diff / sum; // 0 = dead center, 1 = hard panned
        panCoherence = Math.max(0, 1.0 - stereoDiffRatio);
        panCoherence = Math.pow(panCoherence, 1.0 + centerWeight * 2.5);
      }

      // 2. Combine with vocal formant frequency weight
      let mask = panCoherence * vocalFreqWeights[k] * sensitivity;

      // 3. De-bleed gating to cut residual background instruments
      if (debleed > 0.01) {
        const thresh = debleed * 0.45;
        if (mask < thresh) {
          mask = mask * (mask / (thresh + 1e-5));
        } else {
          mask = Math.min(1.0, (mask - thresh) / (1.0 - thresh + 1e-5));
        }
      }

      mask = Math.max(0, Math.min(1.0, mask));

      // Symmetrical positive & negative frequency bins
      const symK = fftSize - k;

      synthVocalRealL[k] = realL * mask;
      synthVocalImagL[k] = imagL * mask;
      if (k > 0 && symK < fftSize) {
        synthVocalRealL[symK] = frameRealL[symK] * mask;
        synthVocalImagL[symK] = frameImagL[symK] * mask;
      }

      if (isStereo) {
        synthVocalRealR[k] = realR * mask;
        synthVocalImagR[k] = imagR * mask;
        if (k > 0 && symK < fftSize) {
          synthVocalRealR[symK] = frameRealR[symK] * mask;
          synthVocalImagR[symK] = frameImagR[symK] * mask;
        }
      }
    }

    // Inverse FFT to reconstruct Vocal Frame
    fft.inverse(synthVocalRealL, synthVocalImagL);
    if (isStereo) {
      fft.inverse(synthVocalRealR, synthVocalImagR);
    }

    // Overlap-Add to output vocal channels with Hann synthesis window
    for (let i = 0; i < fftSize; i++) {
      const sIdx = startSample + i;
      if (sIdx < numSamples) {
        const w = window[i];
        vocalChannels[0][sIdx] += synthVocalRealL[i] * w;
        if (isStereo) {
          vocalChannels[1][sIdx] += synthVocalRealR[i] * w;
        }
        windowAccum[sIdx] += w * w;
      }
    }

    // Cooperative yielding every ~15ms so iPad Safari stays responsive
    const now = performance.now();
    if (now - lastYieldTime > 16) {
      const percent = Math.round(5 + (frame / numFrames) * 75);
      onProgress?.(percent, `Separating vocal formants (${Math.round((frame / numFrames) * 100)}%)…`);
      await yieldToMain();
      lastYieldTime = performance.now();
    }
  }

  onProgress?.(82, 'Normalizing spectral synthesis…');
  await yieldToMain();

  // Normalize by window overlap-add accumulation
  for (let i = 0; i < numSamples; i++) {
    const norm = windowAccum[i];
    if (norm > 1e-4) {
      const inv = 1.0 / norm;
      vocalChannels[0][i] *= inv;
      if (isStereo) {
        vocalChannels[1][i] *= inv;
      }
    }
  }

  onProgress?.(90, 'Calculating instrumental residual…');
  await yieldToMain();

  // Compute Instrumental Channels via Phase-Exact Residual Subtraction:
  // Instrumental = Original - Vocal
  const instrumentalChannels: Float32Array[] = [];
  for (let c = 0; c < numChannels; c++) {
    const orig = channels[c];
    const voc = vocalChannels[c];
    const inst = new Float32Array(numSamples);
    for (let i = 0; i < numSamples; i++) {
      let instVal = orig[i] - voc[i];
      // Soft saturation clamp to prevent numeric clipping
      if (instVal > 1.0) instVal = 1.0;
      if (instVal < -1.0) instVal = -1.0;
      inst[i] = instVal;
    }
    instrumentalChannels.push(inst);
  }

  onProgress?.(96, 'Synthesizing output mix…');
  await yieldToMain();

  // Generate requested output mix
  const outputChannels: Float32Array[] = [];
  const mode = settings.mode;
  const balance = Math.max(0, Math.min(1, settings.vocalBalance));

  for (let c = 0; c < numChannels; c++) {
    const out = new Float32Array(numSamples);
    const voc = vocalChannels[c];
    const inst = instrumentalChannels[c];

    if (mode === 'vocals-only') {
      out.set(voc);
    } else if (mode === 'music-only') {
      out.set(inst);
    } else if (mode === 'custom-balance') {
      // Linear or equal-power crossfade between Vocal and Instrumental
      const vocGain = balance <= 0.5 ? balance * 2.0 : 1.0;
      const instGain = balance >= 0.5 ? (1.0 - balance) * 2.0 : 1.0;
      for (let i = 0; i < numSamples; i++) {
        let val = voc[i] * vocGain + inst[i] * instGain;
        if (val > 1.0) val = 1.0;
        if (val < -1.0) val = -1.0;
        out[i] = val;
      }
    } else {
      // 'both-stems' defaults to balanced/vocal
      out.set(voc);
    }
    outputChannels.push(out);
  }

  onProgress?.(100, 'Stem separation complete!');

  return {
    vocalChannels,
    instrumentalChannels,
    outputChannels
  };
}
