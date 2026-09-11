import type { VoiceChangerSettings, VoiceChangerEnvironment, VoiceChangerBandpass } from '../types/audio';
import { replaceBufferRegion, sliceBuffer } from './BufferUtils';

// Memory cache for generated Impulse Responses (avoids recalculating and saves iPad CPU/battery)
const irCache = new Map<string, AudioBuffer>();

// Precomputed WaveShaper curves cache
const curveCache = new Map<string, Float32Array>();

export class VoiceChangerEngine {
  private static previewCtx: AudioContext | null = null;
  private static previewSource: AudioBufferSourceNode | null = null;
  private static previewAnalyser: AnalyserNode | null = null;
  private static previewPlaying: boolean = false;
  private static vinylNoiseBuffer: AudioBuffer | null = null;

  /**
   * Generates a procedurally synthesized room impulse response.
   * Runs once and is cached in memory.
   */
  public static getImpulseResponse(
    ctx: BaseAudioContext,
    environment: VoiceChangerEnvironment,
    decaySec: number,
    dampingHz: number,
    preDelaySec: number = 0.02
  ): AudioBuffer {
    const cacheKey = `${environment}_${decaySec.toFixed(2)}_${dampingHz.toFixed(0)}_${preDelaySec.toFixed(3)}_${ctx.sampleRate}`;
    const cached = irCache.get(cacheKey);
    if (cached) return cached;

    const sampleRate = ctx.sampleRate;
    const duration = Math.max(0.2, Math.min(6.0, decaySec));
    const totalSamples = Math.floor(duration * sampleRate);
    const preDelaySamples = Math.min(totalSamples - 1, Math.floor(preDelaySec * sampleRate));

    const irBuffer = ctx.createBuffer(2, totalSamples, sampleRate);
    const left = irBuffer.getChannelData(0);
    const right = irBuffer.getChannelData(1);

    // Damping filter coefficient (one-pole low-pass decay)
    // As dampingHz decreases, highs are absorbed faster
    const normCutoff = Math.min(0.99, Math.max(0.01, dampingHz / (sampleRate / 2)));
    const alpha = 1.0 - Math.exp(-2.0 * Math.PI * normCutoff);

    let lFilter = 0;
    let rFilter = 0;

    // Environmental density and diffusion tweaks
    const isBrightCeramic = environment === 'bathroom';
    const isCathedral = environment === 'cathedral';
    const isUnderwater = environment === 'underwater';
    const isBehindWall = environment === 'behind-wall';

    for (let i = 0; i < totalSamples; i++) {
      if (i < preDelaySamples) {
        left[i] = 0;
        right[i] = 0;
        continue;
      }

      const t = (i - preDelaySamples) / sampleRate;
      // Exponential decay envelope (-60dB at duration)
      let decay = Math.exp((-3.5 * t) / duration);

      if (isBrightCeramic) {
        // Bathroom: denser early spikes, metallic reflections
        const flutter = 1.0 + 0.3 * Math.sin(2.0 * Math.PI * 180 * t);
        decay *= flutter;
      } else if (isCathedral) {
        // Cathedral: slow, lush build up of diffuse reflections
        const buildUp = Math.min(1.0, t / 0.08);
        decay *= buildUp;
      }

      // Independent white noise for stereo decorrelation
      let noiseL = Math.random() * 2 - 1;
      let noiseR = Math.random() * 2 - 1;

      // Air absorption / damping filter simulation
      lFilter += alpha * (noiseL - lFilter);
      rFilter += alpha * (noiseR - rFilter);

      let sampleL = lFilter * decay;
      let sampleR = rFilter * decay;

      if (isUnderwater) {
        sampleL *= 0.6;
        sampleR *= 0.6;
      } else if (isBehindWall) {
        sampleL *= 0.4;
        sampleR *= 0.4;
      }

      left[i] = sampleL;
      right[i] = sampleR;
    }

    irCache.set(cacheKey, irBuffer);
    return irBuffer;
  }

  /**
   * Generates or retrieves a soft-clipping tape saturation transfer curve.
   */
  public static getSaturationCurve(amount: number): Float32Array {
    const key = `sat_${amount.toFixed(2)}`;
    const cached = curveCache.get(key);
    if (cached) return cached;

    const n = 1024;
    const curve = new Float32Array(n);
    const drive = 1.0 + amount * 3.5;

    for (let i = 0; i < n; i++) {
      const x = (i * 2) / n - 1;
      // Soft saturation using tanh approximation
      curve[i] = Math.tanh(x * drive) / Math.tanh(drive);
    }

    curveCache.set(key, curve);
    return curve;
  }

  /**
   * Generates or retrieves a stepped bit-depth quantization transfer curve.
   */
  public static getBitcrushCurve(bitDepth: number): Float32Array {
    const key = `bit_${bitDepth}`;
    const cached = curveCache.get(key);
    if (cached) return cached;

    const n = 1024;
    const curve = new Float32Array(n);
    const steps = Math.pow(2, Math.max(2, Math.min(16, bitDepth)));

    for (let i = 0; i < n; i++) {
      const x = (i * 2) / n - 1;
      curve[i] = Math.round(x * steps) / steps;
    }

    curveCache.set(key, curve);
    return curve;
  }

  /**
   * Procedurally generates a vinyl crackle noise buffer.
   */
  private static getVinylNoiseBuffer(ctx: BaseAudioContext): AudioBuffer {
    if (this.vinylNoiseBuffer && this.vinylNoiseBuffer.sampleRate === ctx.sampleRate) {
      return this.vinylNoiseBuffer;
    }

    const duration = 4.0;
    const length = Math.floor(duration * ctx.sampleRate);
    const buf = ctx.createBuffer(2, length, ctx.sampleRate);
    const left = buf.getChannelData(0);
    const right = buf.getChannelData(1);

    for (let i = 0; i < length; i++) {
      // Gentle surface noise
      let hiss = (Math.random() * 2 - 1) * 0.015;

      // Random micro vinyl pops & clicks (dust)
      if (Math.random() < 0.0008) {
        const pop = (Math.random() > 0.5 ? 1 : -1) * (0.25 + Math.random() * 0.4);
        hiss += pop;
      }

      left[i] = hiss;
      right[i] = hiss * 0.9 + (Math.random() * 2 - 1) * 0.005;
    }

    this.vinylNoiseBuffer = buf;
    return buf;
  }

  /**
   * Builds the entire Web Audio DSP graph for voice transformation.
   * Can be attached to any BaseAudioContext (live AudioContext or OfflineAudioContext).
   */
  public static buildDspChain(
    ctx: BaseAudioContext,
    settings: VoiceChangerSettings,
    destination: AudioNode
  ): {
    inputNode: AudioNode;
    cleanup: () => void;
  } {
    const disposers: Array<() => void> = [];

    // Master Dry / Wet Mixer
    const inputNode = ctx.createGain();
    const dryGain = ctx.createGain();
    const wetGain = ctx.createGain();
    const masterOut = ctx.createGain();

    const dryRatio = Math.max(0, 1.0 - settings.mix);
    const wetRatio = Math.max(0, Math.min(1.0, settings.mix));
    dryGain.gain.value = dryRatio;
    wetGain.gain.value = wetRatio;

    // Connect dry path directly
    inputNode.connect(dryGain);
    dryGain.connect(masterOut);

    let currentWetNode: AudioNode = inputNode;

    // --- 1. Ring Modulator (Robot / Alien voice) ---
    if (settings.ringModFreq > 0 && settings.ringModMix > 0) {
      const ringOsc = ctx.createOscillator();
      ringOsc.type = 'sine';
      ringOsc.frequency.value = settings.ringModFreq;

      const ringGain = ctx.createGain();
      ringGain.gain.value = 0; // modulated by carrier oscillator

      ringOsc.connect(ringGain.gain);

      const dryMod = ctx.createGain();
      dryMod.gain.value = 1.0 - settings.ringModMix;

      const wetMod = ctx.createGain();
      wetMod.gain.value = settings.ringModMix;

      const modSum = ctx.createGain();

      currentWetNode.connect(dryMod);
      currentWetNode.connect(ringGain);
      dryMod.connect(modSum);
      ringGain.connect(wetMod);
      wetMod.connect(modSum);

      try {
        ringOsc.start();
        disposers.push(() => {
          try { ringOsc.stop(); } catch { /* ignore */ }
          try { ringOsc.disconnect(); } catch { /* ignore */ }
        });
      } catch { /* ignore */ }

      currentWetNode = modSum;
    }

    // --- 2. Lo-Fi Suite: Bandpass & Resonant Communication Filters ---
    if (settings.bandpass !== 'none') {
      currentWetNode = this.applyBandpassFilter(ctx, currentWetNode, settings.bandpass);
    }

    // --- 3. Lo-Fi Suite: Bitcrusher ---
    if (settings.bitDepth < 16) {
      const crusher = ctx.createWaveShaper();
      crusher.curve = this.getBitcrushCurve(settings.bitDepth) as any;
      crusher.oversample = 'none'; // intentional raw aliasing for genuine lofi
      currentWetNode.connect(crusher);
      currentWetNode = crusher;
    }

    // --- 4. Lo-Fi Suite: Sample Rate Decimation Filter ---
    if (settings.sampleRateKhz < 44) {
      const cutoff = Math.min((settings.sampleRateKhz * 1000) / 2, ctx.sampleRate / 2 - 100);
      const decimateFilter = ctx.createBiquadFilter();
      decimateFilter.type = 'lowpass';
      decimateFilter.frequency.value = cutoff;
      decimateFilter.Q.value = 1.2;
      currentWetNode.connect(decimateFilter);
      currentWetNode = decimateFilter;
    }

    // --- 5. Lo-Fi Suite: Tape Saturation (Overdrive / Warmth) ---
    if (settings.tapeSaturation > 0.05) {
      const saturator = ctx.createWaveShaper();
      saturator.curve = this.getSaturationCurve(settings.tapeSaturation) as any;
      saturator.oversample = '2x';
      currentWetNode.connect(saturator);
      currentWetNode = saturator;
    }

    // --- 6. Lo-Fi Suite: Tape Wow & Flutter (Motor instability) ---
    if (settings.tapeFlutter > 0.05) {
      const flutterDelay = ctx.createDelay(0.05);
      flutterDelay.delayTime.value = 0.015; // 15ms base delay

      const flutterOsc = ctx.createOscillator();
      flutterOsc.type = 'sine';
      flutterOsc.frequency.value = 2.4; // 2.4 Hz motor wobble

      const flutterGain = ctx.createGain();
      flutterGain.gain.value = 0.0015 * settings.tapeFlutter; // subtle pitch drift

      flutterOsc.connect(flutterGain);
      flutterGain.connect(flutterDelay.delayTime);

      currentWetNode.connect(flutterDelay);
      currentWetNode = flutterDelay;

      try {
        flutterOsc.start();
        disposers.push(() => {
          try { flutterOsc.stop(); } catch { /* ignore */ }
          try { flutterOsc.disconnect(); } catch { /* ignore */ }
        });
      } catch { /* ignore */ }
    }

    // --- 7. Lo-Fi Suite: Vinyl Crackle & Surface Noise Generator ---
    if (settings.vinylCrackle > 0.05) {
      const vinylNode = ctx.createBufferSource();
      vinylNode.buffer = this.getVinylNoiseBuffer(ctx);
      vinylNode.loop = true;

      const vinylFilter = ctx.createBiquadFilter();
      vinylFilter.type = 'bandpass';
      vinylFilter.frequency.value = 2500;
      vinylFilter.Q.value = 0.8;

      const vinylGain = ctx.createGain();
      vinylGain.gain.value = settings.vinylCrackle * 0.4;

      vinylNode.connect(vinylFilter);
      vinylFilter.connect(vinylGain);

      const vinylMix = ctx.createGain();
      currentWetNode.connect(vinylMix);
      vinylGain.connect(vinylMix);
      currentWetNode = vinylMix;

      try {
        vinylNode.start();
        disposers.push(() => {
          try { vinylNode.stop(); } catch { /* ignore */ }
          try { vinylNode.disconnect(); } catch { /* ignore */ }
        });
      } catch { /* ignore */ }
    }

    // --- 8. Spatial Suite: Reverb & Acoustic Environment ---
    if (settings.environment !== 'none' && settings.reverbMix > 0.02) {
      const convolver = ctx.createConvolver();
      convolver.buffer = this.getImpulseResponse(
        ctx,
        settings.environment,
        settings.reverbDecay,
        settings.reverbDamping,
        settings.reverbPreDelay
      );

      const revDry = ctx.createGain();
      const revWet = ctx.createGain();
      const revSum = ctx.createGain();

      revDry.gain.value = 1.0 - settings.reverbMix * 0.5;
      revWet.gain.value = settings.reverbMix;

      currentWetNode.connect(revDry);
      currentWetNode.connect(convolver);
      convolver.connect(revWet);

      revDry.connect(revSum);
      revWet.connect(revSum);

      currentWetNode = revSum;
    }

    // --- 9. Spatial Suite: 3D Haas Stereo Widener ---
    if (settings.stereoWidth > 1.05 && ctx.destination.channelCount >= 2) {
      const splitter = ctx.createChannelSplitter(2);
      const merger = ctx.createChannelMerger(2);
      const haasDelay = ctx.createDelay(0.05);

      // 12ms to 24ms delay on right ear creates wide acoustic separation
      const delayMs = 0.012 + (settings.stereoWidth - 1.0) * 0.014;
      haasDelay.delayTime.value = delayMs;

      currentWetNode.connect(splitter);
      splitter.connect(merger, 0, 0); // Left direct
      splitter.connect(haasDelay, 1);  // Right delayed
      haasDelay.connect(merger, 0, 1);

      currentWetNode = merger;
    }

    // Connect processed wet path to master mixer
    currentWetNode.connect(wetGain);
    wetGain.connect(masterOut);

    // Master Output Gain (dB)
    const outLinear = Math.pow(10, settings.outputGainDb / 20);
    masterOut.gain.value = outLinear;
    masterOut.connect(destination);

    return {
      inputNode,
      cleanup: () => {
        disposers.forEach((fn) => {
          try { fn(); } catch { /* ignore */ }
        });
      }
    };
  }

  /**
   * Applies characterful communication & acoustic barrier filters.
   */
  private static applyBandpassFilter(
    ctx: BaseAudioContext,
    input: AudioNode,
    bandpass: VoiceChangerBandpass
  ): AudioNode {
    switch (bandpass) {
      case 'telephone': {
        // Standard POTS telephone band: 300Hz - 3400Hz
        const hp = ctx.createBiquadFilter();
        hp.type = 'highpass';
        hp.frequency.value = 350;
        hp.Q.value = 1.1;

        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 3400;
        lp.Q.value = 1.1;

        const midBoost = ctx.createBiquadFilter();
        midBoost.type = 'peaking';
        midBoost.frequency.value = 1800;
        midBoost.gain.value = 4.0;

        input.connect(hp);
        hp.connect(lp);
        lp.connect(midBoost);
        return midBoost;
      }

      case 'walkie-talkie': {
        // Narrow radio squelch bandpass: 500Hz - 2600Hz with resonant peak
        const hp = ctx.createBiquadFilter();
        hp.type = 'highpass';
        hp.frequency.value = 650;
        hp.Q.value = 2.0;

        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 2800;
        lp.Q.value = 2.2;

        const peak = ctx.createBiquadFilter();
        peak.type = 'peaking';
        peak.frequency.value = 2100;
        peak.gain.value = 6.0;

        input.connect(hp);
        hp.connect(lp);
        lp.connect(peak);
        return peak;
      }

      case 'megaphone': {
        // Bullhorn / Megaphone horn resonance
        const hp = ctx.createBiquadFilter();
        hp.type = 'highpass';
        hp.frequency.value = 500;
        hp.Q.value = 1.4;

        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 4500;

        const hornResonance = ctx.createBiquadFilter();
        hornResonance.type = 'peaking';
        hornResonance.frequency.value = 1450;
        hornResonance.Q.value = 3.8;
        hornResonance.gain.value = 9.0;

        input.connect(hp);
        hp.connect(lp);
        lp.connect(hornResonance);
        return hornResonance;
      }

      case 'am-radio': {
        // Vintage AM broadcast: heavy high cutoff, carrier resonance
        const hp = ctx.createBiquadFilter();
        hp.type = 'highpass';
        hp.frequency.value = 220;

        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 3600;
        lp.Q.value = 1.3;

        input.connect(hp);
        hp.connect(lp);
        return lp;
      }

      case 'underwater': {
        // Deep acoustic dampening: 420 Hz lowpass + bass boom
        const lp1 = ctx.createBiquadFilter();
        lp1.type = 'lowpass';
        lp1.frequency.value = 420;
        lp1.Q.value = 1.5;

        const lp2 = ctx.createBiquadFilter();
        lp2.type = 'lowpass';
        lp2.frequency.value = 420;

        const sub = ctx.createBiquadFilter();
        sub.type = 'peaking';
        sub.frequency.value = 110;
        sub.gain.value = 5.0;

        input.connect(lp1);
        lp1.connect(lp2);
        lp2.connect(sub);
        return sub;
      }

      case 'behind-wall': {
        // Sound absorption through walls: boomy bass, muffled highs
        const lp1 = ctx.createBiquadFilter();
        lp1.type = 'lowpass';
        lp1.frequency.value = 550;
        lp1.Q.value = 1.2;

        const lp2 = ctx.createBiquadFilter();
        lp2.type = 'lowpass';
        lp2.frequency.value = 550;

        const bassBoom = ctx.createBiquadFilter();
        bassBoom.type = 'peaking';
        bassBoom.frequency.value = 95;
        bassBoom.gain.value = 7.0;

        input.connect(lp1);
        lp1.connect(lp2);
        lp2.connect(bassBoom);
        return bassBoom;
      }

      default:
        return input;
    }
  }

  /**
   * Fast, non-blocking offline rendering of voice changer transformations.
   * Leverages Apple AMX / hardware DSP on iPad for high battery efficiency.
   */
  public static async renderVoiceChanger(
    sourceBuffer: AudioBuffer,
    settings: VoiceChangerSettings,
    selection?: { start: number; end: number } | null
  ): Promise<AudioBuffer> {
    const isSelectionScope = settings.scope === 'selection' && selection && selection.end > selection.start;
    
    // Determine the buffer segment to process
    let targetSlice = sourceBuffer;
    if (isSelectionScope) {
      // Slice out the selected region
      const dummyCtx = new OfflineAudioContext(1, 1, sourceBuffer.sampleRate);
      targetSlice = sliceBuffer(dummyCtx, sourceBuffer, selection.start, selection.end);
    }

    // Pitch shift multiplier (resampling rate)
    const pitchRate = Math.pow(2, settings.pitchSemitones / 12);
    // Calculated output length taking pitch resampling into account
    const outputLength = Math.max(1, Math.floor(targetSlice.length / pitchRate));
    const sampleRate = targetSlice.sampleRate;
    const channels = Math.max(2, targetSlice.numberOfChannels);

    const offlineCtx = new OfflineAudioContext(channels, outputLength, sampleRate);

    // Source player
    const sourceNode = offlineCtx.createBufferSource();
    sourceNode.buffer = targetSlice;
    sourceNode.playbackRate.value = pitchRate;

    // Attach complete DSP chain
    const dsp = this.buildDspChain(offlineCtx, settings, offlineCtx.destination);
    sourceNode.connect(dsp.inputNode);

    sourceNode.start(0);

    const processedSlice = await offlineCtx.startRendering();
    dsp.cleanup();

    // If whole track was rendered, return directly
    if (!isSelectionScope) {
      return processedSlice;
    }

    // Splice transformed region back into original buffer
    const finalCtx = new OfflineAudioContext(1, 1, sourceBuffer.sampleRate);
    return replaceBufferRegion(finalCtx, sourceBuffer, processedSlice, selection.start, selection.end);
  }

  // =========================================================================
  // REAL-TIME AUDITION PREVIEW ENGINE (Battery & iPad power optimized)
  // =========================================================================

  private static getOrCreatePreviewContext(): AudioContext {
    if (!this.previewCtx || this.previewCtx.state === 'closed') {
      const AudioCtxClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.previewCtx = new AudioCtxClass();
    }
    return this.previewCtx;
  }

  public static getPreviewAnalyser(): AnalyserNode | null {
    return this.previewAnalyser;
  }

  public static isPreviewPlaying(): boolean {
    return this.previewPlaying;
  }

  public static async startPreview(
    buffer: AudioBuffer,
    settings: VoiceChangerSettings,
    selection?: { start: number; end: number } | null,
    isBypassed: boolean = false,
    onEnded?: () => void
  ): Promise<void> {
    this.stopPreview();

    const ctx = this.getOrCreatePreviewContext();
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }

    // Slice selection if scope is selection
    let playBuffer = buffer;
    let startSec = 0;
    if (settings.scope === 'selection' && selection && selection.end > selection.start) {
      playBuffer = sliceBuffer(ctx, buffer, selection.start, selection.end);
    }

    const pitchRate = isBypassed ? 1.0 : Math.pow(2, settings.pitchSemitones / 12);

    const source = ctx.createBufferSource();
    source.buffer = playBuffer;
    source.playbackRate.value = pitchRate;
    this.previewSource = source;

    // Analyser node for low-overhead audio visualizer
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 64; // small FFT size for iPad power saving
    this.previewAnalyser = analyser;

    const gain = ctx.createGain();
    gain.gain.value = 0.9;

    if (isBypassed) {
      // Bypass: clean route directly to speakers
      source.connect(analyser);
      analyser.connect(gain);
      gain.connect(ctx.destination);
    } else {
      // Connect DSP chain
      const dsp = this.buildDspChain(ctx, settings, analyser);
      source.connect(dsp.inputNode);
      analyser.connect(gain);
      gain.connect(ctx.destination);
    }

    source.onended = () => {
      this.previewPlaying = false;
      this.suspendPreviewContext();
      if (onEnded) onEnded();
    };

    source.start(0, startSec);
    this.previewPlaying = true;
  }

  public static stopPreview(): void {
    if (this.previewSource) {
      try {
        this.previewSource.stop();
        this.previewSource.disconnect();
      } catch { /* ignore */ }
      this.previewSource = null;
    }
    this.previewPlaying = false;
    this.suspendPreviewContext();
  }

  /**
   * Suspends AudioContext when playback stops to put iPad audio hardware to sleep.
   */
  private static suspendPreviewContext(): void {
    if (this.previewCtx && this.previewCtx.state === 'running') {
      try {
        this.previewCtx.suspend();
      } catch { /* ignore */ }
    }
  }

  /**
   * Full teardown when modal closes.
   */
  public static disposePreview(): void {
    this.stopPreview();
    if (this.previewCtx) {
      try {
        this.previewCtx.close();
      } catch { /* ignore */ }
      this.previewCtx = null;
    }
    this.previewAnalyser = null;
  }
}
