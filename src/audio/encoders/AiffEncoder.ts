/**
 * Direct Chunk-Streamed Lossless AIFF Encoder.
 * Writes directly to chunked Blob streams without allocating monolithic multi-gigabyte ArrayBuffers.
 */

export interface AiffEncoderOptions {
  bitDepth?: 16 | 24 | 32;
  channels?: 1 | 2;
  sampleRate?: number;
  onProgress?: (progress: number) => void;
}

/**
 * Write 80-bit IEEE 754 extended precision float for AIFF COMM chunk (Apple SANE standard)
 */
function writeExtended80(view: DataView, offset: number, value: number): void {
  if (value === 0) {
    for (let i = 0; i < 10; i++) view.setUint8(offset + i, 0);
    return;
  }

  let sign = 0;
  if (value < 0) {
    sign = 0x8000;
    value = -value;
  }

  let exponent = Math.floor(Math.log2(value));
  let normalized = value / Math.pow(2, exponent);
  if (normalized >= 2) {
    normalized /= 2;
    exponent++;
  } else if (normalized < 1) {
    normalized *= 2;
    exponent--;
  }

  const expField = sign | (exponent + 16383);
  view.setUint16(offset, expField, false); // big-endian

  const mantissa = normalized * Math.pow(2, 63);
  const high32 = Math.floor(mantissa / 0x100000000) >>> 0;
  const low32 = (mantissa % 0x100000000) >>> 0;
  view.setUint32(offset + 2, high32, false);
  view.setUint32(offset + 6, low32, false);
}

/**
 * Encodes an AudioBuffer into an uncompressed AIFF (.aif / .aiff) file Blob using chunked streaming.
 */
export async function encodeAiff(
  buffer: AudioBuffer,
  options: AiffEncoderOptions = {}
): Promise<Blob> {
  const bitDepth = options.bitDepth || 16;
  const targetChannels = options.channels || buffer.numberOfChannels;
  const targetSampleRate = options.sampleRate || buffer.sampleRate;

  let sourceBuffer = buffer;

  // Resample if required
  if (targetSampleRate !== buffer.sampleRate || targetChannels !== buffer.numberOfChannels) {
    const offlineCtx = new OfflineAudioContext(
      targetChannels,
      Math.max(1, Math.ceil(buffer.duration * targetSampleRate)),
      targetSampleRate
    );
    const sourceNode = offlineCtx.createBufferSource();
    sourceNode.buffer = buffer;
    sourceNode.connect(offlineCtx.destination);
    sourceNode.start(0);
    sourceBuffer = await offlineCtx.startRendering();
  }

  const numChannels = targetChannels;
  const sampleRate = targetSampleRate;
  const numSamples = sourceBuffer.length;

  let bytesPerSample = 2; // 16-bit
  if (bitDepth === 24) {
    bytesPerSample = 3;
  } else if (bitDepth === 32) {
    bytesPerSample = 4;
  }

  const dataSize = numSamples * numChannels * bytesPerSample;
  // FORM (4) + size (4) + AIFF (4) + COMM (4) + size (4) + commPayload (18) + SSND (4) + size (4) + offset (4) + blockSize (4) = 54 bytes
  const headerSize = 54;
  const totalSize = headerSize + dataSize;

  const headerBuffer = new ArrayBuffer(54);
  const view = new DataView(headerBuffer);

  function writeString(offset: number, str: string) {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  }

  // 1. FORM Chunk Header
  writeString(0, 'FORM');
  view.setUint32(4, Math.min(0xffffffff - 8, totalSize - 8), false); // big-endian
  writeString(8, 'AIFF');

  // 2. Common Chunk (COMM)
  writeString(12, 'COMM');
  view.setUint32(16, 18, false); // COMM chunk payload size = 18
  view.setUint16(20, numChannels, false); // numChannels (uint16 big-endian)
  view.setUint32(22, numSamples, false); // numSampleFrames (uint32 big-endian)
  view.setUint16(26, bitDepth, false); // sampleSize (uint16 big-endian)
  writeExtended80(view, 28, sampleRate); // sampleRate (10 bytes 80-bit float big-endian)

  // 3. Sound Data Chunk (SSND)
  writeString(38, 'SSND');
  view.setUint32(42, Math.min(0xffffffff, 8 + dataSize), false); // chunk size (uint32 big-endian)
  view.setUint32(46, 0, false); // offset = 0
  view.setUint32(50, 0, false); // blockSize = 0

  const chunks: BlobPart[] = [headerBuffer];

  // 4. Stream Sample Data in Chunks
  const CHUNK_FRAMES = 32768;
  const channelData: Float32Array[] = [];
  for (let c = 0; c < numChannels; c++) {
    channelData.push(sourceBuffer.getChannelData(c < sourceBuffer.numberOfChannels ? c : 0));
  }

  for (let offset = 0; offset < numSamples; offset += CHUNK_FRAMES) {
    const chunkFrames = Math.min(CHUNK_FRAMES, numSamples - offset);
    const chunkBytes = chunkFrames * numChannels * bytesPerSample;
    const chunkArray = new Uint8Array(chunkBytes);
    const chunkView = new DataView(chunkArray.buffer);

    let byteOffset = 0;

    if (bitDepth === 16) {
      for (let i = 0; i < chunkFrames; i++) {
        const frameIdx = offset + i;
        for (let c = 0; c < numChannels; c++) {
          const s = Math.max(-1, Math.min(1, channelData[c][frameIdx]));
          const intSample = s < 0 ? s * 0x8000 : s * 0x7fff;
          chunkView.setInt16(byteOffset, Math.floor(intSample), false); // big-endian
          byteOffset += 2;
        }
      }
    } else if (bitDepth === 24) {
      for (let i = 0; i < chunkFrames; i++) {
        const frameIdx = offset + i;
        for (let c = 0; c < numChannels; c++) {
          const s = Math.max(-1, Math.min(1, channelData[c][frameIdx]));
          const intSample = s < 0 ? s * 0x800000 : s * 0x7fffff;
          const int24 = Math.floor(intSample);
          chunkArray[byteOffset] = (int24 >> 16) & 0xff;
          chunkArray[byteOffset + 1] = (int24 >> 8) & 0xff;
          chunkArray[byteOffset + 2] = int24 & 0xff;
          byteOffset += 3;
        }
      }
    } else if (bitDepth === 32) {
      for (let i = 0; i < chunkFrames; i++) {
        const frameIdx = offset + i;
        for (let c = 0; c < numChannels; c++) {
          chunkView.setFloat32(byteOffset, channelData[c][frameIdx], false); // big-endian IEEE float
          byteOffset += 4;
        }
      }
    }

    chunks.push(chunkArray);

    if (options.onProgress && offset % (CHUNK_FRAMES * 8) === 0) {
      options.onProgress(Math.min(0.98, offset / numSamples));
      await new Promise((r) => setTimeout(r, 0));
    }
  }

  if (options.onProgress) {
    options.onProgress(1.0);
  }

  return new Blob(chunks as unknown as BlobPart[], { type: 'audio/aiff' });
}
