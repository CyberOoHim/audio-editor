import type { AudioHistoryEntry, AudioHistoryRegionPatch } from '../types/audio';
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

  public push(description: string, buffer: AudioBuffer): void {
    if (this.currentIndex < this.history.length - 1) {
      this.history = this.history.slice(0, this.currentIndex + 1);
    }

    const entry: AudioHistoryEntry = {
      id: 'hist_' + Math.random().toString(36).substring(2, 9),
      description,
      timestamp: Date.now(),
      buffer
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
    patch: AudioHistoryRegionPatch
  ): boolean {
    const patchBytes = patch.channels.reduce((sum, ch) => sum + ch.byteLength, 0);
    const profile = getMemoryProfile();
    const patchBudget = profile.isConstrained ? Math.min(32 * 1024 * 1024, profile.maxScratchBytes) : profile.maxScratchBytes;

    if (this.currentIndex < this.history.length - 1) {
      this.history = this.history.slice(0, this.currentIndex + 1);
    }

    if (patchBytes > patchBudget) {
      // Full-track in-place on a long file: keep the mutated buffer, drop undo copies
      this.history = [{
        id: 'hist_' + Math.random().toString(36).substring(2, 9),
        description,
        timestamp: Date.now(),
        buffer
      }];
      this.currentIndex = 0;
      return false;
    }

    this.history.push({
      id: 'hist_' + Math.random().toString(36).substring(2, 9),
      description,
      timestamp: Date.now(),
      buffer,
      regionPatch: patch
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

  public undo(liveBuffer?: AudioBuffer | null): { entry: AudioHistoryEntry; buffer: AudioBuffer; undoneDescription: string } | null {
    if (!this.canUndo()) return null;
    const undoneEntry = this.history[this.currentIndex];
    if (undoneEntry.regionPatch && liveBuffer) {
      swapRegion(liveBuffer, undoneEntry.regionPatch);
      this.currentIndex--;
      return {
        entry: this.history[this.currentIndex],
        buffer: liveBuffer,
        undoneDescription: undoneEntry.description
      };
    }
    this.currentIndex--;
    const entry = this.history[this.currentIndex];
    return {
      entry,
      buffer: entry.buffer,
      undoneDescription: undoneEntry.description
    };
  }

  public redo(liveBuffer?: AudioBuffer | null): { entry: AudioHistoryEntry; buffer: AudioBuffer; redoneDescription: string } | null {
    if (!this.canRedo()) return null;
    this.currentIndex++;
    const entry = this.history[this.currentIndex];
    if (entry.regionPatch && liveBuffer) {
      swapRegion(liveBuffer, entry.regionPatch);
      return {
        entry,
        buffer: liveBuffer,
        redoneDescription: entry.description
      };
    }
    return {
      entry,
      buffer: entry.buffer,
      redoneDescription: entry.description
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

  public reset(initialBuffer?: AudioBuffer, initialDescription: string = 'Initial Audio'): void {
    this.history = [];
    this.currentIndex = -1;
    if (initialBuffer) {
      this.push(initialDescription, initialBuffer);
    }
  }
}
