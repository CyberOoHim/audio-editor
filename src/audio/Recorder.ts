export interface RecorderMetrics {
  duration: number;
  peakL: number;
  peakR: number;
  rmsL: number;
  rmsR: number;
}

export type MetricsCallback = (metrics: RecorderMetrics) => void;

export class StudioRecorder {
  private mediaStream: MediaStream | null = null;
  private audioCtx: AudioContext | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private gainNode: GainNode | null = null;
  private splitterNode: ChannelSplitterNode | null = null;
  private analyserL: AnalyserNode | null = null;
  private analyserR: AnalyserNode | null = null;
  private processorNode: ScriptProcessorNode | null = null;
  
  private leftChannelData: Float32Array[] = [];
  private rightChannelData: Float32Array[] = [];
  private recordedSamples: number = 0;
  private sampleRate: number = 48000;
  private gainDb: number = 0;
  
  private isRecording: boolean = false;
  private isPaused: boolean = false;
  private startTime: number = 0;
  private pausedTimeOffset: number = 0;
  private metricsListeners: Set<MetricsCallback> = new Set();
  private animFrameId: number | null = null;

  constructor(initialGainDb: number = 0) {
    this.gainDb = initialGainDb;
  }

  public setGain(gainDb: number): void {
    this.gainDb = gainDb;
    if (this.gainNode && this.audioCtx) {
      const linear = Math.pow(10, gainDb / 20);
      const now = this.audioCtx.currentTime;
      this.gainNode.gain.cancelScheduledValues(now);
      this.gainNode.gain.setValueAtTime(this.gainNode.gain.value, now);
      this.gainNode.gain.linearRampToValueAtTime(linear, now + 0.05);
    }
  }

  public getGain(): number {
    return this.gainDb;
  }

  public async start(initialGainDb?: number): Promise<void> {
    this.stop();
    if (initialGainDb !== undefined) {
      this.gainDb = initialGainDb;
    }
    this.leftChannelData = [];
    this.rightChannelData = [];
    this.recordedSamples = 0;

    let stream: MediaStream | null = null;
    try {
      const AudioCtxClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.audioCtx = new AudioCtxClass({ latencyHint: 'interactive' });
      if (this.audioCtx.state === 'suspended') {
        await this.audioCtx.resume();
      }
      this.sampleRate = this.audioCtx.sampleRate;

      // High quality studio constraints
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          channelCount: 2,
          sampleRate: this.sampleRate
        }
      });
      this.mediaStream = stream;

      this.sourceNode = this.audioCtx.createMediaStreamSource(this.mediaStream);

      // Gain boost node configured for stereo with explicit upmixing (mono -> stereo duplication)
      this.gainNode = this.audioCtx.createGain();
      this.gainNode.channelCount = 2;
      this.gainNode.channelCountMode = 'explicit';
      this.gainNode.channelInterpretation = 'speakers';

      const linearGain = Math.pow(10, this.gainDb / 20);
      this.gainNode.gain.setValueAtTime(linearGain, this.audioCtx.currentTime);
      this.sourceNode.connect(this.gainNode);

      // Channel splitter for independent Left and Right live analysers
      this.splitterNode = this.audioCtx.createChannelSplitter(2);
      this.gainNode.connect(this.splitterNode);

      this.analyserL = this.audioCtx.createAnalyser();
      this.analyserL.fftSize = 512;
      this.analyserL.smoothingTimeConstant = 0.7;
      this.splitterNode.connect(this.analyserL, 0);

      this.analyserR = this.audioCtx.createAnalyser();
      this.analyserR.fftSize = 512;
      this.analyserR.smoothingTimeConstant = 0.7;
      this.splitterNode.connect(this.analyserR, 1);

      // Buffer processor (4096 buffer size, 2 inputs, 2 outputs)
      this.processorNode = this.audioCtx.createScriptProcessor(4096, 2, 2);
      this.processorNode.onaudioprocess = (e) => {
        if (!this.isRecording || this.isPaused) return;

        const numChannels = e.inputBuffer.numberOfChannels;
        const inputL = e.inputBuffer.getChannelData(0);
        const inputR = numChannels > 1 ? e.inputBuffer.getChannelData(1) : inputL;

        // Verify if channel 1 has non-zero audio (or if browser fed silence on right channel for mono mic)
        let hasRightAudio = false;
        if (numChannels > 1) {
          const stride = inputR.length > 64 ? 8 : 1;
          for (let i = 0; i < inputR.length; i += stride) {
            if (Math.abs(inputR[i]) > 1e-5) {
              hasRightAudio = true;
              break;
            }
          }
        }

        // Copy buffer chunks - ensure both channels are populated with full sound
        const chunkL = new Float32Array(inputL.length);
        chunkL.set(inputL);
        this.leftChannelData.push(chunkL);

        const chunkR = new Float32Array(inputL.length);
        chunkR.set(hasRightAudio ? inputR : inputL);
        this.rightChannelData.push(chunkR);

        this.recordedSamples += inputL.length;
      };

      this.gainNode.connect(this.processorNode);
      this.processorNode.connect(this.audioCtx.destination);

      this.isRecording = true;
      this.isPaused = false;
      this.startTime = performance.now();
      this.pausedTimeOffset = 0;

      this.startMetricsLoop();
    } catch (err) {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
        this.mediaStream = null;
      }
      if (this.splitterNode) {
        this.splitterNode.disconnect();
        this.splitterNode = null;
      }
      if (this.analyserL) {
        this.analyserL.disconnect();
        this.analyserL = null;
      }
      if (this.analyserR) {
        this.analyserR.disconnect();
        this.analyserR = null;
      }
      if (this.gainNode) {
        this.gainNode.disconnect();
        this.gainNode = null;
      }
      if (this.audioCtx && this.audioCtx.state !== 'closed') {
        this.audioCtx.close().catch(() => {});
        this.audioCtx = null;
      }
      throw err;
    }
  }

  public pause(): void {
    if (this.isRecording && !this.isPaused) {
      this.isPaused = true;
      this.pausedTimeOffset += performance.now() - this.startTime;
    }
  }

  public resume(): void {
    if (this.isRecording && this.isPaused) {
      this.isPaused = false;
      this.startTime = performance.now();
    }
  }

  public stop(): AudioBuffer | null {
    this.isRecording = false;
    this.isPaused = false;
    this.stopMetricsLoop();

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop());
      this.mediaStream = null;
    }

    if (this.processorNode) {
      this.processorNode.disconnect();
      this.processorNode.onaudioprocess = null;
      this.processorNode = null;
    }

    if (this.splitterNode) {
      this.splitterNode.disconnect();
      this.splitterNode = null;
    }

    if (this.analyserL) {
      this.analyserL.disconnect();
      this.analyserL = null;
    }

    if (this.analyserR) {
      this.analyserR.disconnect();
      this.analyserR = null;
    }

    if (this.gainNode) {
      this.gainNode.disconnect();
      this.gainNode = null;
    }

    if (this.sourceNode) {
      this.sourceNode.disconnect();
      this.sourceNode = null;
    }

    if (this.recordedSamples === 0 || !this.audioCtx) {
      if (this.audioCtx && this.audioCtx.state !== 'closed') {
        this.audioCtx.close();
      }
      this.audioCtx = null;
      return null;
    }

    // Safety check: ensure Right channel has audio (fall back to Left if silent)
    let rightHasSignal = false;
    for (let i = 0; i < this.rightChannelData.length; i++) {
      const chunk = this.rightChannelData[i];
      const stride = chunk.length > 64 ? 16 : 1;
      for (let j = 0; j < chunk.length; j += stride) {
        if (Math.abs(chunk[j]) > 1e-5) {
          rightHasSignal = true;
          break;
        }
      }
      if (rightHasSignal) break;
    }

    // Merge Float32Array chunks into single AudioBuffer with both channels populated
    const audioBuffer = this.audioCtx.createBuffer(2, this.recordedSamples, this.sampleRate);
    const outL = audioBuffer.getChannelData(0);
    const outR = audioBuffer.getChannelData(1);

    let offset = 0;
    for (let i = 0; i < this.leftChannelData.length; i++) {
      const chunkL = this.leftChannelData[i];
      const chunkR = rightHasSignal ? this.rightChannelData[i] : chunkL;
      outL.set(chunkL, offset);
      outR.set(chunkR, offset);
      offset += chunkL.length;
    }

    this.audioCtx.close();
    this.audioCtx = null;

    return audioBuffer;
  }

  public cancel(): void {
    this.isRecording = false;
    this.isPaused = false;
    this.stopMetricsLoop();

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop());
      this.mediaStream = null;
    }

    if (this.processorNode) {
      this.processorNode.disconnect();
      this.processorNode.onaudioprocess = null;
      this.processorNode = null;
    }

    if (this.splitterNode) {
      this.splitterNode.disconnect();
      this.splitterNode = null;
    }

    if (this.analyserL) {
      this.analyserL.disconnect();
      this.analyserL = null;
    }

    if (this.analyserR) {
      this.analyserR.disconnect();
      this.analyserR = null;
    }

    if (this.gainNode) {
      this.gainNode.disconnect();
      this.gainNode = null;
    }

    if (this.sourceNode) {
      this.sourceNode.disconnect();
      this.sourceNode = null;
    }

    if (this.audioCtx && this.audioCtx.state !== 'closed') {
      this.audioCtx.close();
    }
    this.audioCtx = null;
    this.leftChannelData = [];
    this.rightChannelData = [];
    this.recordedSamples = 0;
  }

  public getAnalyser(): AnalyserNode | null {
    return this.analyserL;
  }

  public getDuration(): number {
    return this.sampleRate > 0 ? this.recordedSamples / this.sampleRate : 0;
  }

  public getIsRecording(): boolean {
    return this.isRecording;
  }

  public getIsPaused(): boolean {
    return this.isPaused;
  }

  public onMetrics(cb: MetricsCallback): () => void {
    this.metricsListeners.add(cb);
    return () => this.metricsListeners.delete(cb);
  }

  private startMetricsLoop(): void {
    this.stopMetricsLoop();
    const dataArrayL = new Uint8Array(256);
    const dataArrayR = new Uint8Array(256);
    let lastUpdate = 0;
    const minInterval = 1000 / 30; // 30 FPS cap for VU meter calculations

    const update = (timestamp: number) => {
      if (this.isRecording) {
        if (timestamp - lastUpdate >= minInterval) {
          lastUpdate = timestamp;
          let peakL = 0;
          let rmsL = 0;
          let peakR = 0;
          let rmsR = 0;

          if (this.analyserL) {
            this.analyserL.getByteTimeDomainData(dataArrayL);
            let sumSquaresL = 0;
            for (let i = 0; i < dataArrayL.length; i++) {
              const norm = (dataArrayL[i] - 128) / 128;
              const absNorm = Math.abs(norm);
              if (absNorm > peakL) peakL = absNorm;
              sumSquaresL += norm * norm;
            }
            rmsL = Math.sqrt(sumSquaresL / dataArrayL.length);
          }

          if (this.analyserR) {
            this.analyserR.getByteTimeDomainData(dataArrayR);
            let sumSquaresR = 0;
            for (let i = 0; i < dataArrayR.length; i++) {
              const norm = (dataArrayR[i] - 128) / 128;
              const absNorm = Math.abs(norm);
              if (absNorm > peakR) peakR = absNorm;
              sumSquaresR += norm * norm;
            }
            rmsR = Math.sqrt(sumSquaresR / dataArrayR.length);
          } else {
            peakR = peakL;
            rmsR = rmsL;
          }

          const metrics: RecorderMetrics = {
            duration: this.getDuration(),
            peakL,
            peakR,
            rmsL,
            rmsR
          };

          this.metricsListeners.forEach(fn => fn(metrics));
        }
        this.animFrameId = requestAnimationFrame(update);
      }
    };

    this.animFrameId = requestAnimationFrame(update);
  }

  private stopMetricsLoop(): void {
    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
  }
}
