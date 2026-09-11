import { getMaxDurationSec, getMemoryProfile } from './memoryBudget';

export interface RecorderMetrics {
  duration: number;
  peakL: number;
  peakR: number;
  rmsL: number;
  rmsR: number;
}

export type MetricsCallback = (metrics: RecorderMetrics) => void;
export type MemoryLimitCallback = () => void;

export class StudioRecorder {
  private mediaStream: MediaStream | null = null;
  private audioCtx: AudioContext | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private gainNode: GainNode | null = null;
  private splitterNode: ChannelSplitterNode | null = null;
  private analyserL: AnalyserNode | null = null;
  private analyserR: AnalyserNode | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private processorNode: ScriptProcessorNode | null = null;
  private silentGain: GainNode | null = null;

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
  private memoryLimitListeners: Set<MemoryLimitCallback> = new Set();
  private animFrameId: number | null = null;
  private hitMemoryLimit: boolean = false;
  private visibilityHandler: (() => void) | null = null;
  private flushWaiters: Array<() => void> = [];

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
    await this.stop();
    if (initialGainDb !== undefined) {
      this.gainDb = initialGainDb;
    }
    this.leftChannelData = [];
    this.rightChannelData = [];
    this.recordedSamples = 0;
    this.hitMemoryLimit = false;

    let stream: MediaStream | null = null;
    try {
      const AudioCtxClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.audioCtx = new AudioCtxClass({ latencyHint: 'interactive' });
      if (this.audioCtx.state === 'suspended') {
        await this.audioCtx.resume();
      }
      this.sampleRate = this.audioCtx.sampleRate;

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

      this.gainNode = this.audioCtx.createGain();
      this.gainNode.channelCount = 2;
      this.gainNode.channelCountMode = 'explicit';
      this.gainNode.channelInterpretation = 'speakers';

      const linearGain = Math.pow(10, this.gainDb / 20);
      this.gainNode.gain.setValueAtTime(linearGain, this.audioCtx.currentTime);
      this.sourceNode.connect(this.gainNode);

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

      this.silentGain = this.audioCtx.createGain();
      this.silentGain.gain.value = 0;

      const usedWorklet = await this.connectCaptureWorklet();
      if (!usedWorklet) {
        this.connectCaptureScriptProcessor();
      }

      this.silentGain.connect(this.audioCtx.destination);

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
      this.disconnectGraph();
      if (this.audioCtx && this.audioCtx.state !== 'closed') {
        this.audioCtx.close().catch(() => {});
        this.audioCtx = null;
      }
      throw err;
    }
  }

  private async connectCaptureWorklet(): Promise<boolean> {
    if (!this.audioCtx || !this.gainNode || !this.silentGain) return false;
    if (typeof this.audioCtx.audioWorklet?.addModule !== 'function') return false;

    try {
      await this.audioCtx.audioWorklet.addModule(
        new URL('capture-worklet.js', document.baseURI).href
      );
      this.workletNode = new AudioWorkletNode(this.audioCtx, 'studio-capture', {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [2],
        channelCount: 2,
        channelCountMode: 'explicit',
        channelInterpretation: 'speakers'
      });
      this.workletNode.port.onmessage = (event: MessageEvent) => {
        const data = event.data as { type?: string; ch0?: Float32Array; ch1?: Float32Array };
        if (data?.type === 'chunk' && data.ch0) {
          this.appendChunk(data.ch0, data.ch1 || data.ch0);
        } else if (data?.type === 'flushed') {
          const waiters = this.flushWaiters;
          this.flushWaiters = [];
          waiters.forEach((fn) => fn());
        }
      };
      this.gainNode.connect(this.workletNode);
      this.workletNode.connect(this.silentGain);
      return true;
    } catch {
      this.workletNode = null;
      return false;
    }
  }

  private connectCaptureScriptProcessor(): void {
    if (!this.audioCtx || !this.gainNode || !this.silentGain) return;

    this.processorNode = this.audioCtx.createScriptProcessor(4096, 2, 2);
    this.processorNode.onaudioprocess = (e) => {
      if (!this.isRecording || this.isPaused) return;
      const numChannels = e.inputBuffer.numberOfChannels;
      const inputL = e.inputBuffer.getChannelData(0);
      const inputR = numChannels > 1 ? e.inputBuffer.getChannelData(1) : inputL;
      this.appendChunk(inputL, inputR, true);
    };

    this.gainNode.connect(this.processorNode);
    this.processorNode.connect(this.silentGain);
  }

  private appendChunk(inputL: Float32Array, inputR: Float32Array, copyRequired = false): void {
    if (!this.isRecording || this.isPaused || this.hitMemoryLimit) return;

    const chunkL = copyRequired ? new Float32Array(inputL) : inputL;
    const chunkR = copyRequired ? new Float32Array(inputR.length) : inputR;
    if (copyRequired) {
      chunkR.set(inputR);
    }

    this.leftChannelData.push(chunkL);
    this.rightChannelData.push(chunkR);
    this.recordedSamples += inputL.length;

    const pcmBytes = this.recordedSamples * 2 * 4;
    const profile = getMemoryProfile();
    const maxSec = getMaxDurationSec(2, this.sampleRate);
    const durationSec = this.recordedSamples / this.sampleRate;
    if (pcmBytes >= profile.maxLoadBytes * 0.82 || durationSec >= maxSec * 0.95) {
      this.hitMemoryLimit = true;
      this.isRecording = false;
      this.memoryLimitListeners.forEach((fn) => fn());
    }
  }

  public pause(): void {
    if (this.isRecording && !this.isPaused) {
      this.isPaused = true;
      this.pausedTimeOffset += performance.now() - this.startTime;
      this.workletNode?.port.postMessage({ type: 'pause' });
      this.stopMetricsLoop();
    }
  }

  public resume(): void {
    if (this.isRecording && this.isPaused) {
      this.isPaused = false;
      this.startTime = performance.now();
      this.workletNode?.port.postMessage({ type: 'resume' });
      this.startMetricsLoop();
    }
  }

  private async flushCapture(): Promise<void> {
    const node = this.workletNode;
    if (!node) return;

    await new Promise<void>((resolve) => {
      const timeout = window.setTimeout(() => {
        this.flushWaiters = this.flushWaiters.filter((fn) => fn !== onFlushed);
        resolve();
      }, 80);
      const onFlushed = () => {
        window.clearTimeout(timeout);
        resolve();
      };
      this.flushWaiters.push(onFlushed);
      try {
        node.port.postMessage({ type: 'flush' });
      } catch {
        window.clearTimeout(timeout);
        this.flushWaiters = this.flushWaiters.filter((fn) => fn !== onFlushed);
        resolve();
      }
    });
  }

  public async stop(): Promise<AudioBuffer | null> {
    if (this.workletNode && this.isRecording) {
      this.isPaused = false;
      this.workletNode.port.postMessage({ type: 'resume' });
      await this.flushCapture();
    }
    this.isRecording = false;
    this.isPaused = false;
    this.disconnectGraph();

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop());
      this.mediaStream = null;
    }

    if (this.recordedSamples === 0 || !this.audioCtx) {
      if (this.audioCtx && this.audioCtx.state !== 'closed') {
        this.audioCtx.close();
      }
      this.audioCtx = null;
      return null;
    }

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
      this.leftChannelData[i] = null as unknown as Float32Array;
      this.rightChannelData[i] = null as unknown as Float32Array;
    }
    this.leftChannelData = [];
    this.rightChannelData = [];

    this.audioCtx.close();
    this.audioCtx = null;

    return audioBuffer;
  }

  public cancel(): void {
    this.isRecording = false;
    this.isPaused = false;
    this.disconnectGraph();

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop());
      this.mediaStream = null;
    }

    if (this.audioCtx && this.audioCtx.state !== 'closed') {
      this.audioCtx.close();
    }
    this.audioCtx = null;
    this.leftChannelData = [];
    this.rightChannelData = [];
    this.recordedSamples = 0;
    this.hitMemoryLimit = false;
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

  public onMemoryLimit(cb: MemoryLimitCallback): () => void {
    this.memoryLimitListeners.add(cb);
    return () => this.memoryLimitListeners.delete(cb);
  }

  public didHitMemoryLimit(): boolean {
    return this.hitMemoryLimit;
  }

  private disconnectGraph(): void {
    this.stopMetricsLoop();

    if (this.workletNode) {
      try {
        this.workletNode.port.onmessage = null;
        this.workletNode.disconnect();
      } catch {
        // already disconnected
      }
      this.workletNode = null;
    }

    if (this.processorNode) {
      this.processorNode.onaudioprocess = null;
      this.processorNode.disconnect();
      this.processorNode = null;
    }

    if (this.silentGain) {
      this.silentGain.disconnect();
      this.silentGain = null;
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
  }

  private startMetricsLoop(): void {
    this.stopMetricsLoop();
    const dataArrayL = new Uint8Array(256);
    const dataArrayR = new Uint8Array(256);
    let lastUpdate = 0;
    const minInterval = 1000 / 15;

    const update = (timestamp: number) => {
      if (!this.isRecording || this.isPaused) return;

      if (document.hidden) {
        this.animFrameId = null;
        return;
      }

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
    };

    this.visibilityHandler = () => {
      if (!document.hidden && this.isRecording && !this.isPaused && this.animFrameId === null) {
        this.animFrameId = requestAnimationFrame(update);
      }
    };
    document.addEventListener('visibilitychange', this.visibilityHandler);

    this.animFrameId = requestAnimationFrame(update);
  }

  private stopMetricsLoop(): void {
    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
    if (this.visibilityHandler) {
      document.removeEventListener('visibilitychange', this.visibilityHandler);
      this.visibilityHandler = null;
    }
  }
}
