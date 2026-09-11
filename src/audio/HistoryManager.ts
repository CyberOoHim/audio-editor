import type { AudioHistoryEntry, AudioHistoryRegionPatch, AudioSelection } from '../types/audio';
import { swapRegion } from './BufferUtils';
import { estimateBufferBytes, getMemoryProfile } from './memoryBudget';

export class HistoryManager {
  private history: AudioHistoryEntry[] = [];
  private currentIndex: number = -1;
  private maxDepth: number;
  private maxMemoryBytes: number;

  constructor(maxDepth: number = 25, maxMemoryBytes?: number) {
    const profile = getMemoryProfile();
    this.maxDepth = profile.isConstrained ? Math.min(maxDepth, 8) : maxDepth;
    this.maxMemoryBytes = maxMemoryBytes ?? (profile.maxScratchBytes + Math.min(profile.maxLoadBytes, 80 * 1024 * 1024));
  }

  private calculateTotalMemory(): number {
    let total = 0;
    const seenBuffers = new Set<AudioBuffer>();
    for (const entry of this.history) {
      if (entry.buffer && !seenBuffers.has(entry.buffer)) {
        seenBuffers.add(entry.buffer);
        total += estimateBufferBytes(entry.buffer);
      }
      if (entry.regionPatch) {
        for (const ch of entry.regionPatch.channels) {
          total += ch.byteLength;
        }
      }
    }
    return total;
  }

  private enforceMemoryLimit(): void {
    if (this.history.length === 0) return;

    const currentEntry = this.currentIndex >= 0 && this.currentIndex < this.history.length
      ? this.history[this.currentIndex]
      : this.history[this.history.length - 1];

    const currentBytes = currentEntry?.buffer ? estimateBufferBytes(currentEntry.buffer) : 0;

    // Scale undo depth with live-buffer size so iPad Jetsam cannot keep N hour-long copies
    let effectiveMaxDepth = this.maxDepth;
    if (currentBytes > 200 * 1024 * 1024) {
      effectiveMaxDepth = 2;
    } else if (currentBytes > 50 * 1024 * 1024) {
      effectiveMaxDepth = 4;
    }

    const profile = getMemoryProfile();
    if (profile.isConstrained && currentBytes > 80 * 1024 * 1024) {
      effectiveMaxDepth = Math.min(effectiveMaxDepth, 2);
    }

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

  public push(
    description: string,
    buffer: AudioBuffer,
    selectionBefore?: AudioSelection | null,
    selectionAfter?: AudioSelection | null
  ): void {
    if (this.currentIndex < this.history.length - 1) {
      this.history = this.history.slice(0, this.currentIndex + 1);
    }

    const entry: AudioHistoryEntry = {
      id: 'hist_' + Math.random().toString(36).substring(2, 9),
      description,
      timestamp: Date.now(),
      buffer,
      selectionBefore: selectionBefore ? { ...selectionBefore } : null,
      selectionAfter: selectionAfter ? { ...selectionAfter } : null
    };

    this.history.push(entry);
    this.currentIndex++;

    this.enforceMemoryLimit();
  }

  /**
   * Record an in-place region undo. `buffer` is the live (already mutated) buffer.
   * Returns false when the patch was dropped to stay under the device RAM budget (no undo).
   */
  public pushInPlace(
    description: string,
    buffer: AudioBuffer,
    patch: AudioHistoryRegionPatch,
    selectionBefore?: AudioSelection | null,
    selectionAfter?: AudioSelection | null
  ): boolean {
    const patchBytes = patch.channels.reduce((sum, ch) => sum + ch.byteLength, 0);
    const profile = getMemoryProfile();
    const patchBudget = profile.maxScratchBytes;

    if (this.currentIndex < this.history.length - 1) {
      this.history = this.history.slice(0, this.currentIndex + 1);
    }

    // If adding this patch would exceed memory limits, prune oldest history entries first
    while (
      this.history.length > 1 &&
      (this.calculateTotalMemory() + patchBytes > this.maxMemoryBytes)
    ) {
      if (this.currentIndex > 0) {
        this.history.shift();
        this.currentIndex--;
      } else {
        break;
      }
    }

    if (patchBytes > patchBudget || (this.calculateTotalMemory() + patchBytes > this.maxMemoryBytes && this.history.length <= 1)) {
      // Memory critically exhausted: keep current buffer baseline, reset undo
      this.history = [{
        id: 'hist_' + Math.random().toString(36).substring(2, 9),
        description,
        timestamp: Date.now(),
        buffer,
        selectionBefore: selectionBefore ? { ...selectionBefore } : null,
        selectionAfter: selectionAfter ? { ...selectionAfter } : null
      }];
      this.currentIndex = 0;
      return false;
    }

    this.history.push({
      id: 'hist_' + Math.random().toString(36).substring(2, 9),
      description,
      timestamp: Date.now(),
      buffer,
      regionPatch: patch,
      selectionBefore: selectionBefore ? { ...selectionBefore } : null,
      selectionAfter: selectionAfter ? { ...selectionAfter } : null
    });
    this.currentIndex++;
    this.enforceMemoryLimit();
    return true;
  }

  public canUndo(): boolean {
    return this.currentIndex > 0;
  }

  public canRedo(): boolean {
    return this.currentIndex < this.history.length - 1;
  }

  public getUndoEntry(): AudioHistoryEntry | null {
    if (this.currentIndex > 0 && this.currentIndex < this.history.length) {
      return this.history[this.currentIndex];
    }
    return null;
  }

  public getRedoEntry(): AudioHistoryEntry | null {
    if (this.currentIndex >= 0 && this.currentIndex < this.history.length - 1) {
      return this.history[this.currentIndex + 1];
    }
    return null;
  }

  public undo(liveBuffer?: AudioBuffer | null): {
    entry: AudioHistoryEntry;
    buffer: AudioBuffer;
    undoneDescription: string;
    restoredSelection: AudioSelection | null;
  } | null {
    if (!this.canUndo()) return null;
    const undoneEntry = this.history[this.currentIndex];
    const restoredSelection = undoneEntry.selectionBefore ?? null;
    if (undoneEntry.regionPatch && liveBuffer) {
      swapRegion(liveBuffer, undoneEntry.regionPatch);
      this.currentIndex--;
      return {
        entry: this.history[this.currentIndex],
        buffer: liveBuffer,
        undoneDescription: undoneEntry.description,
        restoredSelection
      };
    }
    this.currentIndex--;
    const entry = this.history[this.currentIndex];
    return {
      entry,
      buffer: entry.buffer,
      undoneDescription: undoneEntry.description,
      restoredSelection
    };
  }

  public redo(liveBuffer?: AudioBuffer | null): {
    entry: AudioHistoryEntry;
    buffer: AudioBuffer;
    redoneDescription: string;
    restoredSelection: AudioSelection | null;
  } | null {
    if (!this.canRedo()) return null;
    this.currentIndex++;
    const entry = this.history[this.currentIndex];
    const restoredSelection = entry.selectionAfter ?? null;
    if (entry.regionPatch && liveBuffer) {
      swapRegion(liveBuffer, entry.regionPatch);
      return {
        entry,
        buffer: liveBuffer,
        redoneDescription: entry.description,
        restoredSelection
      };
    }
    return {
      entry,
      buffer: entry.buffer,
      redoneDescription: entry.description,
      restoredSelection
    };
  }

  public jumpToIndex(targetIndex: number, liveBuffer?: AudioBuffer | null): {
    entry: AudioHistoryEntry;
    buffer: AudioBuffer;
    description: string;
    restoredSelection: AudioSelection | null;
  } | null {
    if (targetIndex < 0 || targetIndex >= this.history.length || targetIndex === this.currentIndex) {
      return null;
    }

    let lastResult: {
      entry: AudioHistoryEntry;
      buffer: AudioBuffer;
      undoneDescription?: string;
      redoneDescription?: string;
      restoredSelection: AudioSelection | null;
    } | null = null;

    if (targetIndex < this.currentIndex) {
      while (this.currentIndex > targetIndex) {
        const res = this.undo(liveBuffer);
        if (!res) break;
        lastResult = res;
      }
    } else {
      while (this.currentIndex < targetIndex) {
        const res = this.redo(liveBuffer);
        if (!res) break;
        lastResult = res;
      }
    }

    if (!lastResult) return null;
    const currentEntry = this.history[this.currentIndex];
    return {
      entry: currentEntry,
      buffer: lastResult.buffer,
      description: currentEntry.description,
      restoredSelection: lastResult.restoredSelection
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
      isCurrent: index === this.currentIndex
    }));
  }

  public getMemoryUsageInfo(): { usedBytes: number; maxBytes: number; entryCount: number } {
    return {
      usedBytes: this.calculateTotalMemory(),
      maxBytes: this.maxMemoryBytes,
      entryCount: this.history.length
    };
  }

  public reset(initialBuffer?: AudioBuffer, initialDescription: string = 'Initial Audio'): void {
    this.history = [];
    this.currentIndex = -1;
    if (initialBuffer) {
      this.push(initialDescription, initialBuffer);
    }
  }
}

