/**
 * Dedicated Web Worker for Software Audio Encoders (MP3 via LAME and Lossless FLAC).
 * Eliminates main-thread UI freezing and uses multi-threaded worker execution for high speed.
 */

import * as lameModule from '@breezystack/lamejs';

// CRC-8 table for FLAC frame header checksum (polynomial 0x07)
const CRC8_TABLE = new Uint8Array(256);
for (let i = 0; i < 256; i++) {
  let curr = i;
  for (let j = 0; j < 8; j++) {
    if ((curr & 0x80) !== 0) {
      curr = ((curr << 1) ^ 0x07) & 0xff;
    } else {
      curr = (curr << 1) & 0xff;
    }
  }
  CRC8_TABLE[i] = curr;
}

function updateCrc8(crc: number, data: Uint8Array): number {
  for (let i = 0; i < data.length; i++) {
    crc = CRC8_TABLE[crc ^ data[i]];
  }
  return crc;
}

// CRC-16 table for FLAC audio frame footer (polynomial 0x8005)
const CRC16_TABLE = new Uint16Array(256);
for (let i = 0; i < 256; i++) {
  let curr = i << 8;
  for (let j = 0; j < 8; j++) {
    if ((curr & 0x8000) !== 0) {
      curr = ((curr << 1) ^ 0x8005) & 0xffff;
    } else {
      curr = (curr << 1) & 0xffff;
    }
  }
  CRC16_TABLE[i] = curr;
}

function updateCrc16(crc: number, data: Uint8Array): number {
  for (let i = 0; i < data.length; i++) {
    crc = ((crc << 8) ^ CRC16_TABLE[((crc >>> 8) ^ data[i]) & 0xff]) & 0xffff;
  }
  return crc;
}

/**
 * BitWriter for packing arbitrary bitfields into bytes
 */
class BitWriter {
  private bytes: number[] = [];
  private bitBuffer = 0;
  private bitsInBuffer = 0;

  writeBits(val: number, numBits: number) {
    for (let i = numBits - 1; i >= 0; i--) {
      const bit = (val >>> i) & 1;
      this.bitBuffer = (this.bitBuffer << 1) | bit;
      this.bitsInBuffer++;
      if (this.bitsInBuffer === 8) {
        this.bytes.push(this.bitBuffer);
        this.bitBuffer = 0;
        this.bitsInBuffer = 0;
      }
    }
  }

  flushByte() {
    if (this.bitsInBuffer > 0) {
      this.bitBuffer = this.bitBuffer << (8 - this.bitsInBuffer);
      this.bytes.push(this.bitBuffer);
      this.bitBuffer = 0;
      this.bitsInBuffer = 0;
    }
  }

  toUint8Array(): Uint8Array {
    this.flushByte();
    return new Uint8Array(this.bytes);
  }
}

/**
 * Encodes audio channel Float32 buffers to MP3 in the Web Worker
 */
function encodeMp3Worker(
  channel0: Float32Array,
  channel1: Float32Array | null,
  numChannels: 1 | 2,
  sampleRate: number,
  bitrate: number,
  onProgress: (p: number) => void
): ArrayBuffer {
  const Mp3Encoder = (lameModule as any).Mp3Encoder || (lameModule as any).default?.Mp3Encoder;
  if (!Mp3Encoder) {
    throw new Error('LAME MP3 encoder constructor not found in worker.');
  }

  const encoder = new Mp3Encoder(numChannels, sampleRate, bitrate);
  const totalSamples = channel0.length;

  const leftInt16 = new Int16Array(totalSamples);
  const rightInt16 = numChannels > 1 && channel1 ? new Int16Array(totalSamples) : null;

  // Convert Float32 to Int16
  for (let i = 0; i < totalSamples; i++) {
    const l = Math.max(-1, Math.min(1, channel0[i]));
    leftInt16[i] = l < 0 ? l * 0x8000 : l * 0x7fff;

    if (rightInt16 && channel1) {
      const r = Math.max(-1, Math.min(1, channel1[i]));
      rightInt16[i] = r < 0 ? r * 0x8000 : r * 0x7fff;
    }
  }

  const mp3Data: Uint8Array[] = [];
  const chunkSize = 1152; // standard MP3 granule size

  for (let i = 0; i < totalSamples; i += chunkSize) {
    const leftChunk = leftInt16.subarray(i, i + chunkSize);
    let mp3buf: Int8Array | Uint8Array;

    if (numChannels === 1 || !rightInt16) {
      mp3buf = encoder.encodeBuffer(leftChunk);
    } else {
      const rightChunk = rightInt16.subarray(i, i + chunkSize);
      mp3buf = encoder.encodeBuffer(leftChunk, rightChunk);
    }

    if (mp3buf.length > 0) {
      mp3Data.push(new Uint8Array(mp3buf));
    }

    if (i % (chunkSize * 20) === 0) {
      onProgress(Math.min(0.95, i / totalSamples));
    }
  }

  const endBuf = encoder.flush();
  if (endBuf.length > 0) {
    mp3Data.push(new Uint8Array(endBuf));
  }

  onProgress(1.0);

  // Merge mp3Data into a single ArrayBuffer for transfer
  const totalLen = mp3Data.reduce((sum, b) => sum + b.length, 0);
  const result = new Uint8Array(totalLen);
  let offset = 0;
  for (const b of mp3Data) {
    result.set(b, offset);
    offset += b.length;
  }

  return result.buffer;
}

/**
 * Encodes audio channel Float32 buffers to Lossless FLAC stream in the Web Worker
 */
function encodeFlacWorker(
  channel0: Float32Array,
  channel1: Float32Array | null,
  numChannels: 1 | 2,
  sampleRate: number,
  bitDepth: 16 | 24,
  onProgress: (p: number) => void
): ArrayBuffer {
  const totalSamples = channel0.length;
  const blockSize = 4096;
  const chunks: Uint8Array[] = [];

  // 1. FLAC Stream Marker (4 bytes 'fLaC')
  chunks.push(new Uint8Array([0x66, 0x4c, 0x61, 0x43]));

  // 2. STREAMINFO Metadata Block (4 bytes header + 34 bytes data = 38 bytes)
  const meta = new BitWriter();
  // Header: isLast (1 bit: 1), blockType (7 bits: 0 = STREAMINFO)
  meta.writeBits(1, 1);
  meta.writeBits(0, 7);
  // Length of STREAMINFO: 34 bytes (24 bits)
  meta.writeBits(34, 24);

  // STREAMINFO payload:
  meta.writeBits(blockSize, 16); // min block size
  meta.writeBits(blockSize, 16); // max block size
  meta.writeBits(0, 24); // min frame size (0 = unknown)
  meta.writeBits(0, 24); // max frame size (0 = unknown)
  meta.writeBits(sampleRate, 20); // sample rate (20 bits)
  meta.writeBits(numChannels - 1, 3); // channels - 1 (3 bits)
  meta.writeBits(bitDepth - 1, 5); // bits per sample - 1 (5 bits)
  // Total samples (36 bits)
  const highSamples = Math.floor(totalSamples / 0x100000000);
  const lowSamples = totalSamples >>> 0;
  meta.writeBits(highSamples, 4);
  meta.writeBits(lowSamples, 32);
  // MD5 signature (16 bytes = 0 for streaming)
  for (let i = 0; i < 16; i++) {
    meta.writeBits(0, 8);
  }

  chunks.push(meta.toUint8Array());

  // 3. Audio Frames
  // Convert samples to integer arrays
  const ch0Int = new Int32Array(totalSamples);
  const ch1Int = numChannels > 1 && channel1 ? new Int32Array(totalSamples) : null;

  const maxVal = bitDepth === 24 ? 0x7fffff : 0x7fff;
  const minVal = bitDepth === 24 ? -0x800000 : -0x8000;

  for (let i = 0; i < totalSamples; i++) {
    const s0 = Math.max(-1, Math.min(1, channel0[i]));
    ch0Int[i] = Math.floor(s0 < 0 ? s0 * -minVal : s0 * maxVal);

    if (ch1Int && channel1) {
      const s1 = Math.max(-1, Math.min(1, channel1[i]));
      ch1Int[i] = Math.floor(s1 < 0 ? s1 * -minVal : s1 * maxVal);
    }
  }

  let frameNumber = 0;
  for (let offset = 0; offset < totalSamples; offset += blockSize) {
    const curBlockSize = Math.min(blockSize, totalSamples - offset);
    const frameWriter = new BitWriter();

    // Frame Header:
    // Sync code: 14 bits (0x3FFE = 11111111111110)
    frameWriter.writeBits(0x3ffe, 14);
    // Reserved bit: 0 (1 bit)
    frameWriter.writeBits(0, 1);
    // Blocking strategy: 0 = fixed block size (1 bit)
    frameWriter.writeBits(0, 1);
    // Block size bits (4 bits): 0b1100 for 4096, or 0b0111 (read from end) if last frame < 4096
    const isCustomBlock = curBlockSize !== 4096;
    if (!isCustomBlock) {
      frameWriter.writeBits(0b1100, 4); // 4096
    } else {
      frameWriter.writeBits(0b0111, 4); // 16-bit custom block size in header
    }

    // Sample rate bits (4 bits): 0b1001 for 44.1kHz, 0b1000 for 88.2kHz, etc. or 0b1100/1101 (from end)
    let srCode = 0;
    if (sampleRate === 88200) srCode = 0b0001;
    else if (sampleRate === 176400) srCode = 0b0010;
    else if (sampleRate === 192000) srCode = 0b0011;
    else if (sampleRate === 8000) srCode = 0b0100;
    else if (sampleRate === 16000) srCode = 0b0101;
    else if (sampleRate === 22050) srCode = 0b0110;
    else if (sampleRate === 24000) srCode = 0b0111;
    else if (sampleRate === 32000) srCode = 0b1000;
    else if (sampleRate === 44100) srCode = 0b1001;
    else if (sampleRate === 48000) srCode = 0b1010;
    else if (sampleRate === 96000) srCode = 0b1011;
    else srCode = 0b1100; // 8-bit / 16-bit trailing sample rate
    frameWriter.writeBits(srCode, 4);

    // Channel assignment (4 bits): 0 = mono, 1 = left/right (independent)
    frameWriter.writeBits(numChannels === 1 ? 0b0000 : 0b0001, 4);

    // Sample size bits (3 bits): 0b100 for 16-bit, 0b110 for 24-bit
    frameWriter.writeBits(bitDepth === 24 ? 0b110 : 0b100, 3);
    // Reserved bit: 0 (1 bit)
    frameWriter.writeBits(0, 1);

    // UTF-8 encoded frame number
    if (frameNumber < 0x80) {
      frameWriter.writeBits(frameNumber, 8);
    } else if (frameNumber < 0x800) {
      frameWriter.writeBits(0xc0 | (frameNumber >> 6), 8);
      frameWriter.writeBits(0x80 | (frameNumber & 0x3f), 8);
    } else {
      frameWriter.writeBits(0xe0 | (frameNumber >> 12), 8);
      frameWriter.writeBits(0x80 | ((frameNumber >> 6) & 0x3f), 8);
      frameWriter.writeBits(0x80 | (frameNumber & 0x3f), 8);
    }

    if (isCustomBlock) {
      frameWriter.writeBits(curBlockSize - 1, 16);
    }
    if (srCode === 0b1100) {
      frameWriter.writeBits(sampleRate, 16);
    }

    // Compute CRC-8 for frame header so far
    const headerBytes = frameWriter.toUint8Array();
    const crc8 = updateCrc8(0, headerBytes);

    // Continue frame writer for Subframes
    const bodyWriter = new BitWriter();

    // Subframe 0 (Channel 0)
    // Subframe header: zero bit (1), subframe type: 0b000001 (Verbatim), wasted bits flag: 0
    bodyWriter.writeBits(0, 1);
    bodyWriter.writeBits(0b000001, 6); // Verbatim subframe
    bodyWriter.writeBits(0, 1); // 0 wasted bits
    for (let f = 0; f < curBlockSize; f++) {
      bodyWriter.writeBits(ch0Int[offset + f] & ((1 << bitDepth) - 1), bitDepth);
    }

    // Subframe 1 (Channel 1 if stereo)
    if (numChannels === 2 && ch1Int) {
      bodyWriter.writeBits(0, 1);
      bodyWriter.writeBits(0b000001, 6); // Verbatim subframe
      bodyWriter.writeBits(0, 1);
      for (let f = 0; f < curBlockSize; f++) {
        bodyWriter.writeBits(ch1Int[offset + f] & ((1 << bitDepth) - 1), bitDepth);
      }
    }

    // Zero-padding to byte boundary
    bodyWriter.flushByte();
    const bodyBytes = bodyWriter.toUint8Array();

    // Total frame bytes before CRC-16
    const frameDataBeforeCrc = new Uint8Array(headerBytes.length + 1 + bodyBytes.length);
    frameDataBeforeCrc.set(headerBytes, 0);
    frameDataBeforeCrc[headerBytes.length] = crc8;
    frameDataBeforeCrc.set(bodyBytes, headerBytes.length + 1);

    // Compute CRC-16 for entire frame
    const crc16 = updateCrc16(0, frameDataBeforeCrc);
    const fullFrame = new Uint8Array(frameDataBeforeCrc.length + 2);
    fullFrame.set(frameDataBeforeCrc, 0);
    fullFrame[frameDataBeforeCrc.length] = (crc16 >> 8) & 0xff;
    fullFrame[frameDataBeforeCrc.length + 1] = crc16 & 0xff;

    chunks.push(fullFrame);
    frameNumber++;

    if (offset % (blockSize * 8) === 0) {
      onProgress(Math.min(0.95, offset / totalSamples));
    }
  }

  onProgress(1.0);

  const totalLen = chunks.reduce((sum, b) => sum + b.length, 0);
  const result = new Uint8Array(totalLen);
  let cur = 0;
  for (const c of chunks) {
    result.set(c, cur);
    cur += c.length;
  }

  return result.buffer;
}

// Worker message handler
self.onmessage = (e: MessageEvent) => {
  const { type, id, channel0, channel1, numChannels, sampleRate, bitrate, bitDepth } = e.data;

  try {
    if (type === 'encode-mp3') {
      const buffer = encodeMp3Worker(
        channel0,
        channel1,
        numChannels,
        sampleRate,
        bitrate,
        (progress) => {
          self.postMessage({ type: 'progress', id, progress });
        }
      );
      (self.postMessage as any)({ type: 'complete', id, buffer }, [buffer]);
    } else if (type === 'encode-flac') {
      const buffer = encodeFlacWorker(
        channel0,
        channel1,
        numChannels,
        sampleRate,
        bitDepth || 24,
        (progress) => {
          self.postMessage({ type: 'progress', id, progress });
        }
      );
      (self.postMessage as any)({ type: 'complete', id, buffer }, [buffer]);
    } else {
      throw new Error(`Unknown worker action: ${type}`);
    }
  } catch (err: any) {
    self.postMessage({
      type: 'error',
      id,
      error: err?.message || String(err)
    });
  }
};
