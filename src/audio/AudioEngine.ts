import type { PlayState, AudioSelection } from '../types/audio';
import { HistoryManager } from './HistoryManager';

export type TimeUpdateCallback = (currentTime: number) => void;
export type StateChangeCallback = (state: PlayState) => void;
export type BufferChangeCallback = (buffer: AudioBuffer | null) => void;

export class AudioEngine {
  private static instance: AudioEngine;
  
  private ctx: AudioContext | null = null;
  private currentBuffer: AudioBuffer | null = null;
  private sourceNode: AudioBufferSourceNode | null = null;
  private gainNode: GainNode | null = null;
  private analyserNode: AnalyserNode | null = null;
  
  private playState: PlayState = 'idle';
  private startTime: number = 0;
  private startOffset: number = 0;
  private playbackRate: number = 1.0;
  private isLooping: boolean = false;
  private loopSelection: AudioSelection | null = null;
  
  public history: HistoryManager = new HistoryManager(25);
  
  private timeListeners: Set<TimeUpdateCallback> = new Set();
  private stateListeners: Set<StateChangeCallback> = new Set();
  private bufferListeners: Set<BufferChangeCallback> = new Set();
  
  private animFrameId: number | null = null;
  private lastUserActivityTime: number = Date.now();
  private idleSuspendTimeout: ReturnType<typeof setTimeout> | null = null;
  private isDocumentVisible: boolean = true;

  private constructor() {
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        this.isDocumentVisible = !document.hidden;
        if (this.isDocumentVisible) {
          this.reportUserActivity();
          if (this.playState === 'playing') {
            this.startProgressTicker();
          }
        }
      });
    }
  }

  public reportUserActivity(): void {
    this.lastUserActivityTime = Date.now();
    this.resetIdleHardwareTimer();
  }

  private resetIdleHardwareTimer(): void {
    if (this.idleSuspendTimeout !== null) {
      clearTimeout(this.idleSuspendTimeout);
      this.idleSuspendTimeout = null;
    }

    // If currently playing, do not suspend the audio hardware
    if (this.playState === 'playing') return;

    // When paused/idle, put audio hardware DAC to sleep after 20 seconds of inactivity
    this.idleSuspendTimeout = setTimeout(() => {
      if (this.playState !== 'playing' && this.ctx && this.ctx.state === 'running') {
        try {
          this.ctx.suspend();
        } catch {
          // Context may already be suspended
        }
      }
    }, 20000);
  }

  public static getInstance(): AudioEngine {
    if (!AudioEngine.instance) {
      AudioEngine.instance = new AudioEngine();
    }
    return AudioEngine.instance;
  }

  public getContext(): AudioContext {
    if (!this.ctx || this.ctx.state === 'closed') {
      const AudioCtxClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtxClass();
      
      this.gainNode = this.ctx.createGain();
      this.gainNode.gain.value = 1.0;

      this.analyserNode = this.ctx.createAnalyser();
      this.analyserNode.fftSize = 256;
      this.analyserNode.smoothingTimeConstant = 0.8;

      this.gainNode.connect(this.analyserNode);
      this.analyserNode.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    this.resetIdleHardwareTimer();
    return this.ctx;
  }

  public async loadBuffer(buffer: AudioBuffer, historyDescription?: string): Promise<void> {
    this.stop();
    this.currentBuffer = buffer;
    this.startOffset = 0;
    
    const ctx = this.getContext();
    this.history.reset(buffer, ctx, historyDescription || 'Loaded Audio');

    this.notifyBufferListeners();
    this.notifyTimeListeners(0);
  }

  public clearBuffer(): void {
    this.stop();
    this.currentBuffer = null;
    this.history = new HistoryManager(25);
    this.notifyBufferListeners();
    this.notifyTimeListeners(0);
  }

  public setBufferDirectly(buffer: AudioBuffer, description: string): void {
    this.stop();
    this.currentBuffer = buffer;
    const ctx = this.getContext();
    this.history.push(description, buffer, ctx);
    this.notifyBufferListeners();
  }

  public undo(): boolean {
    const ctx = this.getContext();
    const result = this.history.undo(ctx);
    if (result) {
      this.stop();
      this.currentBuffer = result.buffer;
      this.notifyBufferListeners();
      return true;
    }
    return false;
  }

  public redo(): boolean {
    const ctx = this.getContext();
    const result = this.history.redo(ctx);
    if (result) {
      this.stop();
      this.currentBuffer = result.buffer;
      this.notifyBufferListeners();
      return true;
    }
    return false;
  }

  public getBuffer(): AudioBuffer | null {
    return this.currentBuffer;
  }

  public getDuration(): number {
    return this.currentBuffer ? this.currentBuffer.duration : 0;
  }

  public getCurrentTime(): number {
    if (!this.currentBuffer) return 0;
    if (this.playState === 'playing' && this.ctx) {
      const elapsed = (this.ctx.currentTime - this.startTime) * this.playbackRate;
      let pos = this.startOffset + elapsed;

      // Handle selection looping
      if (this.isLooping && this.loopSelection) {
        const loopLen = this.loopSelection.end - this.loopSelection.start;
        if (loopLen > 0 && pos >= this.loopSelection.end) {
          pos = this.loopSelection.start + ((pos - this.loopSelection.start) % loopLen);
        }
      } else if (this.isLooping && pos >= this.currentBuffer.duration) {
        pos = pos % this.currentBuffer.duration;
      }

      return Math.min(this.currentBuffer.duration, Math.max(0, pos));
    }
    return this.startOffset;
  }

  public play(fromTime?: number, selection?: AudioSelection): void {
    if (!this.currentBuffer) return;
    const ctx = this.getContext();

    if (this.playState === 'playing') {
      this.stopSource();
    }

    let offset = fromTime !== undefined ? fromTime : this.startOffset;
    if (selection) {
      if (offset < selection.start || offset >= selection.end) {
        offset = selection.start;
      }
      this.loopSelection = selection;
    } else {
      this.loopSelection = null;
    }

    if (offset >= this.currentBuffer.duration) {
      offset = 0;
    }

    this.startOffset = offset;
    this.startTime = ctx.currentTime;

    this.sourceNode = ctx.createBufferSource();
    this.sourceNode.buffer = this.currentBuffer;
    this.sourceNode.playbackRate.value = this.playbackRate;

    if (this.gainNode) {
      this.sourceNode.connect(this.gainNode);
    }

    if (selection) {
      const duration = selection.end - offset;
      if (this.isLooping) {
        this.sourceNode.loop = true;
        this.sourceNode.loopStart = selection.start;
        this.sourceNode.loopEnd = selection.end;
        this.sourceNode.start(0, offset);
      } else {
        this.sourceNode.start(0, offset, Math.max(0, duration));
      }
    } else {
      if (this.isLooping) {
        this.sourceNode.loop = true;
        this.sourceNode.loopStart = 0;
        this.sourceNode.loopEnd = this.currentBuffer.duration;
        this.sourceNode.start(0, offset);
      } else {
        this.sourceNode.start(0, offset);
      }
    }

    const currentSource = this.sourceNode;
    this.sourceNode.onended = () => {
      if (this.sourceNode === currentSource && this.playState === 'playing' && !this.isLooping) {
        this.stop();
      }
    };

    this.setPlayState('playing');
    this.startProgressTicker();
  }

  public pause(): void {
    if (this.playState !== 'playing') return;
    this.startOffset = this.getCurrentTime();
    this.stopSource();
    this.setPlayState('paused');
    this.stopProgressTicker();
    this.notifyTimeListeners(this.startOffset);
  }

  public stop(): void {
    this.stopSource();
    this.startOffset = 0;
    this.setPlayState('idle');
    this.stopProgressTicker();
    this.notifyTimeListeners(0);
  }

  public seek(timeInSec: number): void {
    if (!this.currentBuffer) return;
    const clamped = Math.max(0, Math.min(this.currentBuffer.duration, timeInSec));
    const wasPlaying = this.playState === 'playing';

    if (wasPlaying) {
      this.play(clamped, this.loopSelection || undefined);
    } else {
      this.startOffset = clamped;
      this.notifyTimeListeners(clamped);
    }
  }

  public setVolume(val: number): void {
    if (this.gainNode) {
      this.gainNode.gain.setValueAtTime(Math.max(0, Math.min(2, val)), this.getContext().currentTime);
    }
  }

  public setPlaybackRate(rate: number): void {
    if (this.playState === 'playing' && this.ctx) {
      // Snapshot the current position using the old rate before updating
      this.startOffset = this.getCurrentTime();
      this.startTime = this.ctx.currentTime;
    }
    this.playbackRate = Math.max(0.25, Math.min(4.0, rate));
    if (this.sourceNode && this.playState === 'playing') {
      this.sourceNode.playbackRate.setValueAtTime(this.playbackRate, this.getContext().currentTime);
    }
  }

  public setLoop(loop: boolean, selection?: AudioSelection): void {
    this.isLooping = loop;
    this.loopSelection = selection || null;
    if (this.sourceNode && this.playState === 'playing') {
      this.sourceNode.loop = loop;
      if (selection) {
        this.sourceNode.loopStart = selection.start;
        this.sourceNode.loopEnd = selection.end;
      }
    }
  }

  public getIsLooping(): boolean {
    return this.isLooping;
  }

  public getPlayState(): PlayState {
    return this.playState;
  }

  public getAnalyser(): AnalyserNode | null {
    return this.analyserNode;
  }

  private stopSource(): void {
    if (this.sourceNode) {
      try {
        this.sourceNode.onended = null;
        this.sourceNode.stop();
        this.sourceNode.disconnect();
      } catch {
        // Source might already be stopped
      }
      this.sourceNode = null;
    }
  }

  private setPlayState(state: PlayState): void {
    this.playState = state;
    this.stateListeners.forEach(fn => fn(state));
  }

  private startProgressTicker(): void {
    this.stopProgressTicker();
    let lastTickTime = 0;

    const tick = (timestamp: number) => {
      if (this.playState === 'playing') {
        // If tab is in background / locked screen, completely pause UI ticker canvas updates
        if (!this.isDocumentVisible) {
          this.animFrameId = requestAnimationFrame(tick);
          return;
        }

        // Adaptive Eco Mode: if user hasn't interacted for >15s during playback, drop to 12 FPS
        const isIdle = (Date.now() - this.lastUserActivityTime) > 15000;
        const minTickInterval = isIdle ? (1000 / 12) : (1000 / 35);

        if (timestamp - lastTickTime >= minTickInterval) {
          lastTickTime = timestamp;
          const time = this.getCurrentTime();
          this.notifyTimeListeners(time);
        }
        this.animFrameId = requestAnimationFrame(tick);
      }
    };
    this.animFrameId = requestAnimationFrame(tick);
  }

  private stopProgressTicker(): void {
    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
  }

  // Subscription listeners
  public onTimeUpdate(cb: TimeUpdateCallback): () => void {
    this.timeListeners.add(cb);
    return () => this.timeListeners.delete(cb);
  }

  public onStateChange(cb: StateChangeCallback): () => void {
    this.stateListeners.add(cb);
    return () => this.stateListeners.delete(cb);
  }

  public onBufferChange(cb: BufferChangeCallback): () => void {
    this.bufferListeners.add(cb);
    return () => this.bufferListeners.delete(cb);
  }

  private notifyTimeListeners(time: number): void {
    this.timeListeners.forEach(fn => fn(time));
  }

  private notifyBufferListeners(): void {
    this.bufferListeners.forEach(fn => fn(this.currentBuffer));
  }
}

export const audioEngine = AudioEngine.getInstance();
