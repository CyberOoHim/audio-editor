import type { AudioHistoryEntry } from '../types/audio';

export class HistoryManager {
  private history: AudioHistoryEntry[] = [];
  private currentIndex: number = -1;
  private maxDepth: number;
  private maxMemoryBytes: number;

  constructor(maxDepth: number = 25, maxMemoryBytes: number = 150 * 1024 * 1024) {
    this.maxDepth = maxDepth;
    this.maxMemoryBytes = maxMemoryBytes;
  }

  private calculateTotalMemory(): number {
    let total = 0;
    for (const entry of this.history) {
      if (entry.buffer) {
        total += entry.buffer.length * entry.buffer.numberOfChannels * 4;
      }
    }
    return total;
  }

  private enforceMemoryLimit(): void {
    if (this.history.length === 0) return;

    const currentEntry = this.currentIndex >= 0 && this.currentIndex < this.history.length
      ? this.history[this.currentIndex]
      : this.history[this.history.length - 1];

    const currentBytes = currentEntry?.buffer
      ? currentEntry.buffer.length * currentEntry.buffer.numberOfChannels * 4
      : 0;

    // For large buffers (> 50MB, e.g. 5+ mins stereo), scale down depth dynamically to prevent browser Jetsam crashes
    let effectiveMaxDepth = this.maxDepth;
    if (currentBytes > 200 * 1024 * 1024) {
      // > 200MB (20-50 min audio): Keep current + 1 undo step
      effectiveMaxDepth = 2;
    } else if (currentBytes > 50 * 1024 * 1024) {
      // > 50MB (5-20 min audio): Keep up to 4 steps
      effectiveMaxDepth = 4;
    }

    // Prune oldest entries if exceeding depth limit or total memory budget
    while (
      this.history.length > 1 &&
      (this.history.length > effectiveMaxDepth || this.calculateTotalMemory() > this.maxMemoryBytes)
    ) {
      if (this.currentIndex > 0) {
        this.history.shift();
        this.currentIndex--;
      } else {
        this.history.shift();
        break;
      }
    }
  }

  public push(description: string, buffer: AudioBuffer): void {
    // If we undo and then make a new edit, discard any future redo branch immediately
    if (this.currentIndex < this.history.length - 1) {
      this.history = this.history.slice(0, this.currentIndex + 1);
    }

    const entry: AudioHistoryEntry = {
      id: 'hist_' + Math.random().toString(36).substring(2, 9),
      description,
      timestamp: Date.now(),
      buffer, // Store buffer directly to avoid redundant 1GB clones
    };

    this.history.push(entry);
    this.currentIndex++;

    this.enforceMemoryLimit();
  }

  public canUndo(): boolean {
    return this.currentIndex > 0;
  }

  public canRedo(): boolean {
    return this.currentIndex < this.history.length - 1;
  }

  public undo(): { entry: AudioHistoryEntry; buffer: AudioBuffer } | null {
    if (!this.canUndo()) return null;
    this.currentIndex--;
    const entry = this.history[this.currentIndex];
    return {
      entry,
      buffer: entry.buffer,
    };
  }

  public redo(): { entry: AudioHistoryEntry; buffer: AudioBuffer } | null {
    if (!this.canRedo()) return null;
    this.currentIndex++;
    const entry = this.history[this.currentIndex];
    return {
      entry,
      buffer: entry.buffer,
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

  public reset(initialBuffer?: AudioBuffer, initialDescription: string = 'Initial Audio'): void {
    this.history = [];
    this.currentIndex = -1;
    if (initialBuffer) {
      this.push(initialDescription, initialBuffer);
    }
  }
}
