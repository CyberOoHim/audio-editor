import type { AudioHistoryEntry } from '../types/audio';
import { cloneBuffer } from './BufferUtils';

export class HistoryManager {
  private history: AudioHistoryEntry[] = [];
  private currentIndex: number = -1;
  private maxDepth: number;

  constructor(maxDepth: number = 25) {
    this.maxDepth = maxDepth;
  }

  public push(description: string, buffer: AudioBuffer, ctx: BaseAudioContext): void {
    // Clone buffer so subsequent mutations don't corrupt history snapshots
    const snapshot = cloneBuffer(ctx, buffer);

    // If we undo and then make a new edit, discard any future redo branch
    if (this.currentIndex < this.history.length - 1) {
      this.history = this.history.slice(0, this.currentIndex + 1);
    }

    const entry: AudioHistoryEntry = {
      id: 'hist_' + Math.random().toString(36).substring(2, 9),
      description,
      timestamp: Date.now(),
      buffer: snapshot,
    };

    this.history.push(entry);

    // Enforce max depth limit
    if (this.history.length > this.maxDepth) {
      this.history.shift();
    } else {
      this.currentIndex++;
    }
  }

  public canUndo(): boolean {
    return this.currentIndex > 0;
  }

  public canRedo(): boolean {
    return this.currentIndex < this.history.length - 1;
  }

  public undo(ctx: BaseAudioContext): { entry: AudioHistoryEntry; buffer: AudioBuffer } | null {
    if (!this.canUndo()) return null;
    this.currentIndex--;
    const entry = this.history[this.currentIndex];
    return {
      entry,
      buffer: cloneBuffer(ctx, entry.buffer),
    };
  }

  public redo(ctx: BaseAudioContext): { entry: AudioHistoryEntry; buffer: AudioBuffer } | null {
    if (!this.canRedo()) return null;
    this.currentIndex++;
    const entry = this.history[this.currentIndex];
    return {
      entry,
      buffer: cloneBuffer(ctx, entry.buffer),
    };
  }

  public getCurrentEntry(): AudioHistoryEntry | null {
    if (this.currentIndex >= 0 && this.currentIndex < this.history.length) {
      return this.history[this.currentIndex];
    }
    return null;
  }

  public getHistoryList(): { id: string; description: string; timestamp: number; isCurrent: boolean }[] {
    return this.history.map((entry, index) => ({
      id: entry.id,
      description: entry.description,
      timestamp: entry.timestamp,
      isCurrent: index === this.currentIndex,
    }));
  }

  public reset(initialBuffer?: AudioBuffer, ctx?: BaseAudioContext, initialDescription: string = 'Initial Audio'): void {
    this.history = [];
    this.currentIndex = -1;
    if (initialBuffer && ctx) {
      this.push(initialDescription, initialBuffer, ctx);
    }
  }
}
