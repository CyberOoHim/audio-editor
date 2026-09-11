/**
 * Device-aware audio memory budget for iPad / iPhone Safari (WebKit Jetsam)
 * and cooperative yielding so long DSP cannot trip the page watchdog.
 *
 * Safari content processes are killed well before the device RAM is exhausted.
 * Peak extra copies (clone + history + OfflineAudioContext) are the usual crash.
 */

export class AudioMemoryError extends Error {
  override name = 'AudioMemoryError';
  constructor(message: string) {
    super(message);
  }
}

export interface MemoryProfile {
  isAppleMobile: boolean;
  isIPad: boolean;
  isConstrained: boolean;
  /** Max PCM we should hold as the live buffer (1x). */
  maxLoadBytes: number;
  /** Max extra bytes for undo patches / a second full copy. */
  maxScratchBytes: number;
  /** OfflineAudioContext slice length in seconds (WebKit fails on huge contexts). */
  offlineChunkSec: number;
  yieldIntervalMs: number;
}

let cachedProfile: MemoryProfile | null = null;

export function isAppleMobile(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  if (/iPad|iPhone|iPod/.test(ua)) return true;
  // iPadOS 13+ reports as Macintosh with touch
  if (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) return true;
  return false;
}

export function isIPad(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  if (/iPad/.test(ua)) return true;
  if (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) return true;
  return false;
}

export function getMemoryProfile(): MemoryProfile {
  if (cachedProfile) return cachedProfile;

  const appleMobile = isAppleMobile();
  const ipad = isIPad();
  const iphone = appleMobile && !ipad;

  let maxLoadBytes: number;
  let maxScratchBytes: number;
  let offlineChunkSec: number;

  if (iphone) {
    // iPhone Safari jetsams around ~1.1 GB; keep a single PCM copy under ~280 MB
    maxLoadBytes = 280 * 1024 * 1024;
    maxScratchBytes = 48 * 1024 * 1024;
    offlineChunkSec = 12;
  } else if (ipad) {
    // iPad Safari typically jetsams ~1.2–1.8 GB. 1x live buffer of ~850 MB
    // (~31 min stereo 48 kHz) is the practical ceiling; copy-edits need headroom.
    maxLoadBytes = 850 * 1024 * 1024;
    maxScratchBytes = 96 * 1024 * 1024;
    offlineChunkSec = 16;
  } else {
    const deviceGb =
      typeof navigator !== 'undefined' && typeof (navigator as Navigator & { deviceMemory?: number }).deviceMemory === 'number'
        ? (navigator as Navigator & { deviceMemory?: number }).deviceMemory || 4
        : 8;
    const heapGb = Math.max(2, Math.min(8, deviceGb * 0.35));
    maxLoadBytes = Math.floor(heapGb * 1024 * 1024 * 1024);
    maxScratchBytes = Math.min(400 * 1024 * 1024, Math.floor(maxLoadBytes * 0.25));
    offlineChunkSec = 45;
  }

  cachedProfile = {
    isAppleMobile: appleMobile,
    isIPad: ipad,
    isConstrained: appleMobile,
    maxLoadBytes,
    maxScratchBytes,
    offlineChunkSec,
    yieldIntervalMs: appleMobile ? 10 : 16
  };
  return cachedProfile;
}

export function estimateBufferBytes(buffer: { length: number; numberOfChannels: number }): number {
  return buffer.length * buffer.numberOfChannels * 4;
}

export function estimatePcmBytes(length: number, channels: number): number {
  return Math.max(0, length) * Math.max(1, channels) * 4;
}

export function formatBytesShort(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function formatDurationShort(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0s';
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  if (m < 60) return `${m}m ${s.toString().padStart(2, '0')}s`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return `${h}h ${rm}m`;
}

export function getMaxDurationSec(channels: number, sampleRate: number, budgetBytes?: number): number {
  const profile = getMemoryProfile();
  const budget = budgetBytes ?? profile.maxLoadBytes;
  const bytesPerSec = Math.max(1, channels) * Math.max(1, sampleRate) * 4;
  return budget / bytesPerSec;
}

export function memoryError(detail: string): AudioMemoryError {
  const device = isIPad() ? 'iPad' : isAppleMobile() ? 'iPhone' : 'this browser';
  return new AudioMemoryError(
    `${detail} ${device} Safari will crash (Jetsam) if we allocate more. Trim, process a selection, or export a shorter clip first.`
  );
}

export function assertCanAllocate(bytes: number, label: string): void {
  const profile = getMemoryProfile();
  if (bytes > profile.maxLoadBytes) {
    const ch = 2;
    const sr = 48000;
    const maxSec = getMaxDurationSec(ch, sr, profile.maxLoadBytes);
    throw memoryError(
      `${label} needs ${formatBytesShort(bytes)} of PCM (limit ~${formatBytesShort(profile.maxLoadBytes)}, about ${formatDurationShort(maxSec)} of stereo 48 kHz).`
    );
  }
}

export function assertCanCopyEdit(sourceBytes: number, destBytes: number, label: string): void {
  const profile = getMemoryProfile();
  // Both buffers exist at once during a length-changing edit
  const peak = sourceBytes + destBytes;
  const ceiling = profile.maxLoadBytes + profile.maxScratchBytes;
  if (peak > ceiling) {
    throw memoryError(
      `${label} would briefly need ${formatBytesShort(peak)} (live audio + a full copy).`
    );
  }
}

export function createBufferSafe(
  ctx: BaseAudioContext,
  numberOfChannels: number,
  lengthInSamples: number,
  sampleRate: number
): AudioBuffer {
  const safeLength = Math.max(1, Math.floor(lengthInSamples));
  const channels = Math.max(1, numberOfChannels);
  assertCanAllocate(estimatePcmBytes(safeLength, channels), 'Audio buffer');
  try {
    const buffer = ctx.createBuffer(channels, safeLength, sampleRate);
    if (buffer.length !== safeLength) {
      throw memoryError('The browser clamped this audio buffer to a shorter length.');
    }
    return buffer;
  } catch (err) {
    if (err instanceof AudioMemoryError) throw err;
    throw memoryError(
      `Could not allocate a ${formatBytesShort(estimatePcmBytes(safeLength, channels))} audio buffer.`
    );
  }
}

export function yieldToMain(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => resolve());
    } else {
      setTimeout(resolve, 0);
    }
  });
}

/** Two frames so React can paint a processing overlay before heavy work. */
export async function yieldForPaint(): Promise<void> {
  await yieldToMain();
  await yieldToMain();
}

export function createYieldScheduler(intervalMs?: number): () => Promise<void> {
  const profile = getMemoryProfile();
  const interval = intervalMs ?? profile.yieldIntervalMs;
  let last = performance.now();
  return async () => {
    const now = performance.now();
    if (now - last >= interval) {
      last = now;
      await yieldToMain();
    }
  };
}

export async function copyFloat32Yielding(
  dst: Float32Array,
  src: Float32Array,
  dstOffset = 0,
  srcStart = 0,
  srcEnd?: number
): Promise<void> {
  const end = srcEnd === undefined ? src.length : srcEnd;
  const length = Math.max(0, end - srcStart);
  const CHUNK = 256 * 1024;
  const maybeYield = createYieldScheduler();
  let copied = 0;
  while (copied < length) {
    const n = Math.min(CHUNK, length - copied);
    dst.set(src.subarray(srcStart + copied, srcStart + copied + n), dstOffset + copied);
    copied += n;
    await maybeYield();
  }
}

/**
 * Decode without `arrayBuffer.slice(0)`, which triples peak RAM
 * (File bytes + sliced copy + float PCM) and jetsams iPad Safari.
 */
function estimateDecodedPcmBytes(blob: Blob): number {
  const type = (blob.type || '').toLowerCase();
  const name = ((blob as File).name || '').toLowerCase();
  const losslessPcm =
    type.includes('wav') ||
    type.includes('aiff') ||
    type.includes('caf') ||
    /\.(wav|aiff?|caf|au|raw|pcm)$/.test(name);
  if (losslessPcm) return blob.size * 2.2; // 16-bit integer → float32
  if (type.includes('flac') || name.endsWith('.flac')) return blob.size * 3;
  return blob.size * 12; // compressed (mp3/aac/m4a) → float32 PCM
}

export async function decodeAudioBlob(ctx: BaseAudioContext, blob: Blob): Promise<AudioBuffer> {
  const profile = getMemoryProfile();
  const estimatedPcm = estimateDecodedPcmBytes(blob);
  if (blob.size > profile.maxLoadBytes || estimatedPcm > profile.maxLoadBytes * 1.1) {
    throw memoryError(
      `This file is ${formatBytesShort(blob.size)} (${formatBytesShort(estimatedPcm)} estimated PCM) — too large to decode in memory.`
    );
  }

  const arrayBuffer = await blob.arrayBuffer();
  try {
    return await ctx.decodeAudioData(arrayBuffer);
  } catch (firstErr) {
    // Some engines require a copy (decodeAudioData detaches / rejects a reused buffer)
    try {
      const copy = arrayBuffer.byteLength > 0 ? arrayBuffer.slice(0) : await blob.arrayBuffer();
      return await ctx.decodeAudioData(copy);
    } catch {
      const reason = firstErr instanceof Error ? firstErr.message : 'decode failed';
      throw new Error(
        `Could not decode this audio file (${reason}). On iPad, very long or unusual encodings can fail — try WAV/M4A under ${formatDurationShort(getMaxDurationSec(2, 48000))}.`
      );
    }
  }
}

export function describeLoadLimit(channels = 2, sampleRate = 48000): string {
  const sec = getMaxDurationSec(channels, sampleRate);
  const device = isIPad() ? 'iPad' : isAppleMobile() ? 'iPhone' : 'this browser';
  return `Up to ~${formatDurationShort(sec)} stereo ${Math.round(sampleRate / 1000)} kHz on ${device}`;
}
