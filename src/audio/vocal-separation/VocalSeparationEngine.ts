/**
 * Vocal Separation Engine Coordinator
 * Manages WebGPU Hardware Acceleration, DSP Processing, Selection Slicing,
 * and Audition Preview Generation.
 */

import type { AudioSelection, VocalSeparationResult, VocalSeparationSettings } from '../../types/audio';
import { createBufferSafe } from '../memoryBudget';
import { detectGpuCapabilities, type GpuCapabilities } from './gpuDevice';
import { processAudioSeparation } from './dspEngine';

export interface SeparationProgressInfo {
  progress: number;
  statusText: string;
  isGpuAccelerated: boolean;
  deviceInfo: string;
}

export class VocalSeparationEngine {
  private static cachedGpuInfo: GpuCapabilities | null = null;

  /**
   * Probes system hardware and returns GPU capability report.
   */
  static async getGpuCapabilities(): Promise<GpuCapabilities> {
    if (!this.cachedGpuInfo) {
      this.cachedGpuInfo = await detectGpuCapabilities();
    }
    return this.cachedGpuInfo;
  }

  /**
   * Separates vocals and instrumental stems from an AudioBuffer.
   * Can operate on the full track or a specific selection.
   */
  static async separateStems(
    ctx: BaseAudioContext,
    sourceBuffer: AudioBuffer,
    settings: VocalSeparationSettings,
    selection?: AudioSelection | null,
    onProgress?: (info: SeparationProgressInfo) => void
  ): Promise<VocalSeparationResult> {
    const gpuInfo = await this.getGpuCapabilities();
    const sampleRate = sourceBuffer.sampleRate;
    const totalSamples = sourceBuffer.length;
    const numChannels = sourceBuffer.numberOfChannels;

    let startSample = 0;
    let endSample = totalSamples;

    if (settings.scope === 'selection' && selection && selection.end > selection.start) {
      startSample = Math.max(0, Math.floor(selection.start * sampleRate));
      endSample = Math.min(totalSamples, Math.floor(selection.end * sampleRate));
    }

    // Extract channels to process
    const regionChannels: Float32Array[] = [];
    for (let c = 0; c < numChannels; c++) {
      const src = sourceBuffer.getChannelData(c);
      regionChannels.push(src.slice(startSample, endSample));
    }

    onProgress?.({
      progress: 0,
      statusText: gpuInfo.hasWebGPU ? `Initializing ${gpuInfo.deviceDescription}…` : 'Initializing Audio DSP…',
      isGpuAccelerated: gpuInfo.hasWebGPU,
      deviceInfo: gpuInfo.deviceDescription
    });

    // Execute separation
    const { vocalChannels, instrumentalChannels, outputChannels } = await processAudioSeparation(
      regionChannels,
      sampleRate,
      settings,
      (progress, stageText) => {
        onProgress?.({
          progress,
          statusText: stageText,
          isGpuAccelerated: gpuInfo.hasWebGPU,
          deviceInfo: gpuInfo.deviceDescription
        });
      }
    );

    // Build target AudioBuffers (Full track length with processed region placed back)
    const vocalBuffer = createBufferSafe(ctx, numChannels, totalSamples, sampleRate);
    const instrumentalBuffer = createBufferSafe(ctx, numChannels, totalSamples, sampleRate);
    const outputBuffer = createBufferSafe(ctx, numChannels, totalSamples, sampleRate);

    // Populate channels with smooth crossfades at boundaries if operating on selection
    for (let c = 0; c < numChannels; c++) {
      const src = sourceBuffer.getChannelData(c);
      const dstVoc = vocalBuffer.getChannelData(c);
      const dstInst = instrumentalBuffer.getChannelData(c);
      const dstOut = outputBuffer.getChannelData(c);

      // Copy original before region
      if (startSample > 0) {
        dstVoc.set(src.subarray(0, startSample), 0);
        dstInst.set(src.subarray(0, startSample), 0);
        dstOut.set(src.subarray(0, startSample), 0);
      }

      // Set processed region
      dstVoc.set(vocalChannels[c], startSample);
      dstInst.set(instrumentalChannels[c], startSample);
      dstOut.set(outputChannels[c], startSample);

      // Copy original after region
      if (endSample < totalSamples) {
        dstVoc.set(src.subarray(endSample, totalSamples), endSample);
        dstInst.set(src.subarray(endSample, totalSamples), endSample);
        dstOut.set(src.subarray(endSample, totalSamples), endSample);
      }

      // Apply 128-sample micro crossfade at in/out boundaries to eliminate any DC transient
      if (startSample > 0 && startSample + 128 < totalSamples) {
        for (let i = 0; i < 128; i++) {
          const t = i / 128;
          const idx = startSample + i;
          dstVoc[idx] = (1 - t) * src[idx] + t * dstVoc[idx];
          dstInst[idx] = (1 - t) * src[idx] + t * dstInst[idx];
          dstOut[idx] = (1 - t) * src[idx] + t * dstOut[idx];
        }
      }
      if (endSample < totalSamples && endSample - 128 > 0) {
        for (let i = 0; i < 128; i++) {
          const t = i / 128;
          const idx = endSample - 128 + i;
          dstVoc[idx] = (1 - t) * dstVoc[idx] + t * src[idx];
          dstInst[idx] = (1 - t) * dstInst[idx] + t * src[idx];
          dstOut[idx] = (1 - t) * dstOut[idx] + t * src[idx];
        }
      }
    }

    return {
      vocalBuffer,
      instrumentalBuffer,
      outputBuffer
    };
  }

  /**
   * Generates a rapid audition preview slice (e.g. 6 to 10 seconds)
   * around the active playhead or selection for instant auditioning.
   */
  static async generateAuditionSlice(
    ctx: BaseAudioContext,
    sourceBuffer: AudioBuffer,
    settings: VocalSeparationSettings,
    centerTimeSec: number = 0,
    sliceDurationSec: number = 6.0
  ): Promise<{
    previewBuffer: AudioBuffer;
    vocalSlice: AudioBuffer;
    instrumentalSlice: AudioBuffer;
    originalSlice: AudioBuffer;
  }> {
    const sampleRate = sourceBuffer.sampleRate;
    const numChannels = sourceBuffer.numberOfChannels;
    const totalDuration = sourceBuffer.duration;

    // Center window around centerTimeSec or track middle
    const safeCenter = Math.max(0, Math.min(totalDuration, centerTimeSec || (totalDuration * 0.35)));
    const halfSlice = sliceDurationSec / 2;
    let startSec = Math.max(0, safeCenter - halfSlice);
    let endSec = Math.min(totalDuration, startSec + sliceDurationSec);
    if (endSec - startSec < sliceDurationSec && startSec > 0) {
      startSec = Math.max(0, endSec - sliceDurationSec);
    }

    const startSample = Math.floor(startSec * sampleRate);
    const endSample = Math.floor(endSec * sampleRate);
    const sliceLen = Math.max(1, endSample - startSample);

    const sliceChannels: Float32Array[] = [];
    const origBuffer = createBufferSafe(ctx, numChannels, sliceLen, sampleRate);

    for (let c = 0; c < numChannels; c++) {
      const src = sourceBuffer.getChannelData(c).slice(startSample, endSample);
      sliceChannels.push(src);
      origBuffer.getChannelData(c).set(src);
    }

    const { vocalChannels, instrumentalChannels, outputChannels } = await processAudioSeparation(
      sliceChannels,
      sampleRate,
      settings
    );

    const vocalSlice = createBufferSafe(ctx, numChannels, sliceLen, sampleRate);
    const instrumentalSlice = createBufferSafe(ctx, numChannels, sliceLen, sampleRate);
    const previewBuffer = createBufferSafe(ctx, numChannels, sliceLen, sampleRate);

    for (let c = 0; c < numChannels; c++) {
      vocalSlice.getChannelData(c).set(vocalChannels[c]);
      instrumentalSlice.getChannelData(c).set(instrumentalChannels[c]);
      previewBuffer.getChannelData(c).set(outputChannels[c]);
    }

    return {
      previewBuffer,
      vocalSlice,
      instrumentalSlice,
      originalSlice: origBuffer
    };
  }
}
