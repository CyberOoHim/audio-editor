import type { EQSettings, FilterSettings, CompressorSettings } from '../types/audio';
import * as BufferUtils from './BufferUtils';

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
    
    // If keepPitch is false or standard speed, offlineCtx buffer source playbackRate handles standard resampling
    const sourcePlaybackRate = (isStandardSpeed || keepPitch) ? 1.0 : speedMultiplier;
    const targetLength = (isStandardSpeed || keepPitch) 
      ? sourceBuffer.length 
      : Math.max(1, Math.floor(sourceBuffer.length / speedMultiplier));
    const targetSampleRate = sourceBuffer.sampleRate;
    
    const offlineCtx = new OfflineAudioContext(
      sourceBuffer.numberOfChannels,
      targetLength,
      targetSampleRate
    );

    // Source Node
    const sourceNode = offlineCtx.createBufferSource();
    sourceNode.buffer = sourceBuffer;
    sourceNode.playbackRate.value = sourcePlaybackRate;

    let currentNode: AudioNode = sourceNode;

    // 1. High-Pass Filter
    if (filters.highpassEnabled) {
      const hp = offlineCtx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = filters.highpassFreq;
      hp.Q.value = 0.707;
      currentNode.connect(hp);
      currentNode = hp;
    }

    // 2. Low-Pass Filter
    if (filters.lowpassEnabled) {
      const lp = offlineCtx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = filters.lowpassFreq;
      lp.Q.value = 0.707;
      currentNode.connect(lp);
      currentNode = lp;
    }

    // 3. 3-Band Parametric EQ
    if (eq.enabled) {
      // Low Shelf
      const lowShelf = offlineCtx.createBiquadFilter();
      lowShelf.type = 'lowshelf';
      lowShelf.frequency.value = eq.lowFreq;
      lowShelf.gain.value = eq.lowGain;
      currentNode.connect(lowShelf);
      currentNode = lowShelf;

      // Peaking Mid
      const midPeak = offlineCtx.createBiquadFilter();
      midPeak.type = 'peaking';
      midPeak.frequency.value = eq.midFreq;
      midPeak.gain.value = eq.midGain;
      midPeak.Q.value = 1.0;
      currentNode.connect(midPeak);
      currentNode = midPeak;

      // High Shelf
      const highShelf = offlineCtx.createBiquadFilter();
      highShelf.type = 'highshelf';
      highShelf.frequency.value = eq.highFreq;
      highShelf.gain.value = eq.highGain;
      currentNode.connect(highShelf);
      currentNode = highShelf;
    }

    // 4. Dynamics Compressor
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

    // Connect to destination
    currentNode.connect(offlineCtx.destination);

    // Start playback and render
    sourceNode.start(0);
    const rendered = await offlineCtx.startRendering();

    // If speed changed and keepPitch is true, apply timeStretchBuffer (WSOLA)
    if (!isStandardSpeed && keepPitch) {
      return BufferUtils.timeStretchBuffer(offlineCtx, rendered, speedMultiplier, true);
    }

    return rendered;
  }
}
