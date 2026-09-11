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

    // Bit reversal index table (N = 2^bits)
    const bits = Math.round(Math.log2(size));
    this.bitReverse = new Uint32Array(size);
    for (let i = 0; i < size; i++) {
      let rev = 0;
      for (let b = 0; b < bits; b++) {
        if ((i & (1 << b)) !== 0) {
          rev |= 1 << (bits - 1 - b);
        }
      }
      this.bitReverse[i] = rev;
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

    const cosTable = this.cosTable;
    const sinTable = this.sinTable;

    // Cooley-Tukey stages with k as outer loop for cache & SIMD optimization
    for (let len = 2; len <= n; len <<= 1) {
      const halfLen = len >> 1;
      const step = n / len;
      for (let k = 0; k < halfLen; k++) {
        const cosVal = cosTable[k * step];
        const sinVal = sinTable[k * step];
        for (let i = k; i < n; i += len) {
          const j = i + halfLen;
          const tr = real[j] * cosVal - imag[j] * sinVal;
          const ti = real[j] * sinVal + imag[j] * cosVal;

          real[j] = real[i] - tr;
          imag[j] = imag[i] - ti;
          real[i] += tr;
          imag[i] += ti;
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
  onProgress?: SeparationProgressCallback,
  abortSignal?: AbortSignal
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
  // 50% overlap (hopSize = 1024): Meets constant overlap-add (COLA) with Hann window
  // Halves frame iterations and CPU thermal dissipation compared to 75% overlap
  const hopSize = 1024;
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
    if (f < 85 || f > 8000) {
      // Hard cutoff: Vocals are never below 85Hz (sub-bass / kick) or above 8kHz (cymbals / air)
      vocalFreqWeights[k] = 0.0;
    } else {
      let weight = 1.0;
      if (f < minHz) {
        weight = Math.max(0, (f - 85) / (minHz - 85 + 0.001));
      } else if (f > maxHz) {
        weight = Math.max(0, 1.0 - (f - maxHz) / (8000 - maxHz + 0.001));
      }
      // Formant center bell boost in the critical intelligibility band (1 kHz - 3.5 kHz)
      const formantCenter = 1800;
      const formantWidth = 1100;
      const dist = Math.abs(f - formantCenter) / formantWidth;
      const formantBoost = 1.0 + 0.4 * Math.exp(-dist * dist);
      vocalFreqWeights[k] = Math.max(0, Math.min(1.4, weight * formantBoost));
    }
  }

  const debleed = Math.max(0, Math.min(1, settings.debleedStrength));
  const sensitivity = Math.max(0.2, Math.min(2.5, settings.vocalSensitivity));
  const centerWeight = Math.max(0, Math.min(1, settings.stereoCenterWeight));
  const preserveAmbience = settings.preserveStereoAmbience ?? true;

  // Allocate scratch buffers for Instrumental STFT synthesis
  const synthInstRealL = new Float32Array(fftSize);
  const synthInstImagL = new Float32Array(fftSize);
  const synthInstRealR = new Float32Array(fftSize);
  const synthInstImagR = new Float32Array(fftSize);

  const instrumentalChannels: Float32Array[] = [];
  for (let c = 0; c < numChannels; c++) {
    instrumentalChannels.push(new Float32Array(numSamples));
  }

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

    // Spectrogram Masking & Mid-Side Extraction
    for (let k = 0; k < halfFft; k++) {
      const realL = frameRealL[k];
      const imagL = frameImagL[k];
      const magL = Math.sqrt(realL * realL + imagL * imagL);

      let realR = realL;
      let imagR = imagL;
      let magR = magL;
      if (isStereo) {
        realR = frameRealR[k];
        imagR = frameImagR[k];
        magR = Math.sqrt(realR * realR + imagR * imagR);
      }

      let vocalMask = 0;
      let vocRealL = 0;
      let vocImagL = 0;
      let vocRealR = 0;
      let vocImagR = 0;
      let instRealL = 0;
      let instImagL = 0;
      let instRealR = 0;
      let instImagR = 0;

      if (isStereo) {
        // Mid (Center) and Side (Stereo difference)
        const realM = 0.5 * (realL + realR);
        const imagM = 0.5 * (imagL + imagR);
        const realS = 0.5 * (realL - realR);
        const imagS = 0.5 * (imagL - imagR);
        const magM = Math.sqrt(realM * realM + imagM * imagM);
        const magS = Math.sqrt(realS * realS + imagS * imagS);

        // Center Pan Coherence: 1.0 = dead center, 0.0 = hard panned
        const panDiff = Math.abs(magL - magR);
        const maxMag = Math.max(magL, magR) + 1e-6;
        const panRatio = panDiff / maxMag;

        // Ratio of stereo side energy to total energy
        const sideRatio = magS / (magM + magS + 1e-6);

        let panCoherence = Math.max(0, 1.0 - panRatio * 2.2) * Math.max(0, 1.0 - sideRatio * 2.0);
        panCoherence = Math.pow(panCoherence, 1.0 + centerWeight * 2.5);

        vocalMask = panCoherence * vocalFreqWeights[k] * sensitivity;

        // De-bleed gating to cut residual background instruments
        if (debleed > 0.01) {
          const thresh = debleed * 0.40;
          if (vocalMask < thresh) {
            vocalMask = vocalMask * (vocalMask / (thresh + 1e-5));
          } else {
            vocalMask = Math.min(1.0, (vocalMask - thresh) / (1.0 - thresh + 1e-5));
          }
        }
        vocalMask = Math.max(0, Math.min(1.0, vocalMask));

        // Isolated Vocal: Extracted from Mid (Center), with slight stereo ambience if desired
        const centerVocR = realM * vocalMask;
        const centerVocI = imagM * vocalMask;
        const ambFactor = preserveAmbience ? 0.12 * vocalMask : 0.0;

        vocRealL = centerVocR + ambFactor * realS;
        vocImagL = centerVocI + ambFactor * imagS;
        vocRealR = centerVocR - ambFactor * realS;
        vocImagR = centerVocI - ambFactor * imagS;

        // Instrumental: Mid-Side Phase-Exact Spectral Cancellation
        // The center vocal is cancelled right in the frequency domain, while bass, kick,
        // cymbals, guitars, and stereo instruments are preserved without phase flanging.
        instRealL = realL - vocRealL;
        instImagL = imagL - vocImagL;
        instRealR = realR - vocRealR;
        instImagR = imagR - vocImagR;
      } else {
        // Single-channel / Mono Audio
        // Uses vocal formant weighting + dynamic harmonic expansion
        vocalMask = vocalFreqWeights[k] * Math.min(1.0, sensitivity * 0.92);

        if (debleed > 0.01) {
          const thresh = debleed * 0.35;
          if (vocalMask < thresh) {
            vocalMask = vocalMask * (vocalMask / (thresh + 1e-5));
          } else {
            vocalMask = Math.min(1.0, (vocalMask - thresh) / (1.0 - thresh + 1e-5));
          }
        }
        vocalMask = Math.max(0, Math.min(1.0, vocalMask));

        vocRealL = realL * vocalMask;
        vocImagL = imagL * vocalMask;
        vocRealR = vocRealL;
        vocImagR = vocImagL;

        instRealL = realL * (1.0 - vocalMask);
        instImagL = imagL * (1.0 - vocalMask);
        instRealR = instRealL;
        instImagR = instImagL;
      }

      synthVocalRealL[k] = vocRealL;
      synthVocalImagL[k] = vocImagL;
      synthInstRealL[k] = instRealL;
      synthInstImagL[k] = instImagL;

      if (isStereo) {
        synthVocalRealR[k] = vocRealR;
        synthVocalImagR[k] = vocImagR;
        synthInstRealR[k] = instRealR;
        synthInstImagR[k] = instImagR;
      }

      // Symmetrical negative frequency bins for exact real-valued IFFT
      const symK = fftSize - k;
      if (k > 0 && symK < fftSize) {
        synthVocalRealL[symK] = vocRealL;
        synthVocalImagL[symK] = -vocImagL;
        synthInstRealL[symK] = instRealL;
        synthInstImagL[symK] = -instImagL;

        if (isStereo) {
          synthVocalRealR[symK] = vocRealR;
          synthVocalImagR[symK] = -vocImagR;
          synthInstRealR[symK] = instRealR;
          synthInstImagR[symK] = -instImagR;
        }
      }
    }

    // Inverse FFT to reconstruct Vocal and Instrumental Frames
    fft.inverse(synthVocalRealL, synthVocalImagL);
    fft.inverse(synthInstRealL, synthInstImagL);
    if (isStereo) {
      fft.inverse(synthVocalRealR, synthVocalImagR);
      fft.inverse(synthInstRealR, synthInstImagR);
    }

    // Overlap-Add to output stem channels with Hann synthesis window
    for (let i = 0; i < fftSize; i++) {
      const sIdx = startSample + i;
      if (sIdx < numSamples) {
        const w = window[i];
        vocalChannels[0][sIdx] += synthVocalRealL[i] * w;
        instrumentalChannels[0][sIdx] += synthInstRealL[i] * w;
        if (isStereo) {
          vocalChannels[1][sIdx] += synthVocalRealR[i] * w;
          instrumentalChannels[1][sIdx] += synthInstRealR[i] * w;
        }
        windowAccum[sIdx] += w * w;
      }
    }

    // Check for user cancellation
    if (abortSignal?.aborted) {
      throw new Error('Stem separation was canceled.');
    }

    // Cooperative yielding with micro-pause so iPad Safari cores stay cool
    const now = performance.now();
    if (now - lastYieldTime > 25) {
      const percent = Math.round(5 + (frame / numFrames) * 80);
      onProgress?.(percent, `Separating stems (${Math.round((frame / numFrames) * 100)}%)…`);
      // Micro-sleep gives the iPad hardware thread pool breathing room and drops thermal dissipation
      await new Promise((resolve) => setTimeout(resolve, 3));
      lastYieldTime = performance.now();
    }
  }

  onProgress?.(88, 'Normalizing spectral synthesis…');
  await yieldToMain();

  // Normalize both stems by window overlap-add accumulation
  for (let i = 0; i < numSamples; i++) {
    const norm = windowAccum[i];
    if (norm > 1e-4) {
      const inv = 1.0 / norm;
      vocalChannels[0][i] *= inv;
      instrumentalChannels[0][i] *= inv;
      if (isStereo) {
        vocalChannels[1][i] *= inv;
        instrumentalChannels[1][i] *= inv;
      }
    }
  }

  onProgress?.(94, 'Synthesizing output mix…');
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
