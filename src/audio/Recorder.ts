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
  private processorNode: ScriptProcessorNode | null = null;
  private analyserNode: AnalyserNode | null = null;
  
  private leftChannelData: Float32Array[] = [];
  private rightChannelData: Float32Array[] = [];
  private recordedSamples: number = 0;
  private sampleRate: number = 48000;
  
  private isRecording: boolean = false;
  private isPaused: boolean = false;
  private startTime: number = 0;
  private pausedTimeOffset: number = 0;
  private metricsListeners: Set<MetricsCallback> = new Set();
  private animFrameId: number | null = null;

  public async start(): Promise<void> {
    this.stop();
    this.leftChannelData = [];
    this.rightChannelData = [];
    this.recordedSamples = 0;

    const AudioCtxClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.audioCtx = new AudioCtxClass({ latencyHint: 'interactive' });
    if (this.audioCtx.state === 'suspended') {
      await this.audioCtx.resume();
    }
    this.sampleRate = this.audioCtx.sampleRate;

    // High quality studio constraints
    this.mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        channelCount: 2,
        sampleRate: this.sampleRate
      }
    });

    this.sourceNode = this.audioCtx.createMediaStreamSource(this.mediaStream);
    
    // Analyser node for live visualizer
    this.analyserNode = this.audioCtx.createAnalyser();
    this.analyserNode.fftSize = 512;
    this.analyserNode.smoothingTimeConstant = 0.7;
    this.sourceNode.connect(this.analyserNode);

    // Buffer processor (4096 buffer size)
    this.processorNode = this.audioCtx.createScriptProcessor(4096, 2, 2);
    this.processorNode.onaudioprocess = (e) => {
      if (!this.isRecording || this.isPaused) return;

      const inputL = e.inputBuffer.getChannelData(0);
      const inputR = e.inputBuffer.numberOfChannels > 1 ? e.inputBuffer.getChannelData(1) : inputL;

      // Copy buffer chunks
      const chunkL = new Float32Array(inputL.length);
      chunkL.set(inputL);
      this.leftChannelData.push(chunkL);

      const chunkR = new Float32Array(inputR.length);
      chunkR.set(inputR);
      this.rightChannelData.push(chunkR);

      this.recordedSamples += inputL.length;
    };

    this.sourceNode.connect(this.processorNode);
    this.processorNode.connect(this.audioCtx.destination);

    this.isRecording = true;
    this.isPaused = false;
    this.startTime = performance.now();
    this.pausedTimeOffset = 0;

    this.startMetricsLoop();
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

    // Merge Float32Array chunks into single AudioBuffer
    const audioBuffer = this.audioCtx.createBuffer(2, this.recordedSamples, this.sampleRate);
    const outL = audioBuffer.getChannelData(0);
    const outR = audioBuffer.getChannelData(1);

    let offset = 0;
    for (let i = 0; i < this.leftChannelData.length; i++) {
      outL.set(this.leftChannelData[i], offset);
      outR.set(this.rightChannelData[i], offset);
      offset += this.leftChannelData[i].length;
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
    return this.analyserNode;
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
    const dataArray = new Uint8Array(256);

    const update = () => {
      if (this.isRecording) {
        let peak = 0;
        let rms = 0;

        if (this.analyserNode) {
          this.analyserNode.getByteTimeDomainData(dataArray);
          let sumSquares = 0;
          for (let i = 0; i < dataArray.length; i++) {
            const norm = (dataArray[i] - 128) / 128;
            const absNorm = Math.abs(norm);
            if (absNorm > peak) peak = absNorm;
            sumSquares += norm * norm;
          }
          rms = Math.sqrt(sumSquares / dataArray.length);
        }

        const metrics: RecorderMetrics = {
          duration: this.getDuration(),
          peakL: peak,
          peakR: peak * 0.95, // simulated stereo meter
          rmsL: rms,
          rmsR: rms * 0.95
        };

        this.metricsListeners.forEach(fn => fn(metrics));
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
