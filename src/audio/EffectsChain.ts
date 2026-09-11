import type { EQSettings, FilterSettings, CompressorSettings } from '../types/audio';
import * as BufferUtils from './BufferUtils';
import { renderOfflineChunked } from './offlineRender';

export class EffectsChain {
  public static async renderEffects(
    sourceBuffer: AudioBuffer,
    eq: EQSettings,
    filters: FilterSettings,
    comp: CompressorSettings,
    speedMultiplier: number = 1.0,
    keepPitch: boolean = true
  ): Promise<AudioBuffer> {
    const isStandardSpeed = Math.abs(speedMultiplier - 1.0) < 0.005;
    const hasEq = eq.enabled && (eq.lowGain !== 0 || eq.midGain !== 0 || eq.highGain !== 0);
    const hasFilters = filters.highpassEnabled || filters.lowpassEnabled;
    const hasComp = comp.enabled;
    const hasGraph = hasEq || hasFilters || hasComp;

    if (!hasGraph) {
      const dummy = new OfflineAudioContext(1, 1, sourceBuffer.sampleRate);
      if (isStandardSpeed) return BufferUtils.cloneBufferAsync(dummy, sourceBuffer);
      return BufferUtils.timeStretchBufferAsync(dummy, sourceBuffer, speedMultiplier, keepPitch);
    }

    // keepPitch false: OfflineAudioContext playbackRate resamples. keepPitch true: WSOLA after.
    const sourcePlaybackRate = (isStandardSpeed || keepPitch) ? 1.0 : speedMultiplier;
    const overlapSec = comp.enabled ? Math.max(0.2, comp.release + 0.08) : 0.2;

    const rendered = await renderOfflineChunked(
      sourceBuffer,
      (offlineCtx, sourceNode) => {
        sourceNode.playbackRate.value = sourcePlaybackRate;

        let currentNode: AudioNode = sourceNode;

        if (filters.highpassEnabled) {
          const hp = offlineCtx.createBiquadFilter();
          hp.type = 'highpass';
          hp.frequency.value = filters.highpassFreq;
          hp.Q.value = 0.707;
          currentNode.connect(hp);
          currentNode = hp;
        }

        if (filters.lowpassEnabled) {
          const lp = offlineCtx.createBiquadFilter();
          lp.type = 'lowpass';
          lp.frequency.value = filters.lowpassFreq;
          lp.Q.value = 0.707;
          currentNode.connect(lp);
          currentNode = lp;
        }

        if (eq.enabled) {
          const lowShelf = offlineCtx.createBiquadFilter();
          lowShelf.type = 'lowshelf';
          lowShelf.frequency.value = eq.lowFreq;
          lowShelf.gain.value = eq.lowGain;
          currentNode.connect(lowShelf);
          currentNode = lowShelf;

          const midPeak = offlineCtx.createBiquadFilter();
          midPeak.type = 'peaking';
          midPeak.frequency.value = eq.midFreq;
          midPeak.gain.value = eq.midGain;
          midPeak.Q.value = 1.0;
          currentNode.connect(midPeak);
          currentNode = midPeak;

          const highShelf = offlineCtx.createBiquadFilter();
          highShelf.type = 'highshelf';
          highShelf.frequency.value = eq.highFreq;
          highShelf.gain.value = eq.highGain;
          currentNode.connect(highShelf);
          currentNode = highShelf;
        }

        if (comp.enabled) {
          const compressor = offlineCtx.createDynamicsCompressor();
          compressor.threshold.value = comp.threshold;
          compressor.knee.value = comp.knee;
          compressor.ratio.value = comp.ratio;
          compressor.attack.value = comp.attack;
          compressor.release.value = comp.release;
          currentNode.connect(compressor);
          currentNode = compressor;
        }

        currentNode.connect(offlineCtx.destination);
      },
      {
        playbackRate: sourcePlaybackRate,
        overlapSec,
        tailSec: overlapSec
      }
    );

    if (!isStandardSpeed && keepPitch) {
      const dummy = new OfflineAudioContext(1, 1, rendered.sampleRate);
      return BufferUtils.timeStretchBufferAsync(dummy, rendered, speedMultiplier, true);
    }

    return rendered;
  }
}
