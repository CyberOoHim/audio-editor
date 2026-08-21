/**
 * Direct Chunk-Streamed Lossless Apple Core Audio (.caf) Encoder.
 * Writes directly to chunked Blob streams without allocating monolithic multi-gigabyte ArrayBuffers.
 */

export interface CafEncoderOptions {
  bitDepth?: 16 | 24 | 32;
  channels?: 1 | 2;
  sampleRate?: number;
  onProgress?: (progress: number) => void;
}

/**
 * Encodes an AudioBuffer into Apple Core Audio Format (.caf) using chunk streaming.
 */
export async function encodeCaf(
  buffer: AudioBuffer,
  options: CafEncoderOptions = {}
): Promise<Blob> {
  const bitDepth = options.bitDepth || 16;
  const targetChannels = options.channels || buffer.numberOfChannels;
  const targetSampleRate = options.sampleRate || buffer.sampleRate;

  let sourceBuffer = buffer;

  // Resample if necessary
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

  let bytesPerSample = 2;
  let isFloat = false;

  if (bitDepth === 24) {
    bytesPerSample = 3;
  } else if (bitDepth === 32) {
    bytesPerSample = 4;
    isFloat = true;
  }

  const bytesPerPacket = numChannels * bytesPerSample;
  const dataSize = numSamples * bytesPerPacket;

  // File Header (8) + desc chunk (12 header + 32 payload = 44) + data chunk (12 header + 4 editCount = 16) = 68 bytes
  const headerBuffer = new ArrayBuffer(68);
  const view = new DataView(headerBuffer);

  function writeString(offset: number, str: string) {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  }

  // 1. File Header
  writeString(0, 'caff');
  view.setUint16(4, 1, false); // mFileVersion = 1
  view.setUint16(6, 0, false); // mFileFlags = 0

  // 2. Audio Description Chunk 'desc'
  writeString(8, 'desc');
  view.setUint32(12, 0, false); // high 32 bits of 64-bit size
  view.setUint32(16, 32, false); // low 32 bits of 64-bit size = 32
  view.setFloat64(20, sampleRate, false); // mSampleRate (Float64 big-endian)
  writeString(28, 'lpcm'); // mFormatID
  view.setUint32(32, isFloat ? 1 : 0, false); // mFormatFlags (1 = float, 0 = signed int big-endian)
  view.setUint32(36, bytesPerPacket, false); // mBytesPerPacket
  view.setUint32(40, 1, false); // mFramesPerPacket = 1
  view.setUint32(44, numChannels, false); // mChannelsPerFrame
  view.setUint32(48, bitDepth, false); // mBitsPerChannel

  // 3. Audio Data Chunk 'data'
  writeString(52, 'data');
  const highBits = Math.floor((dataSize + 4) / 0x100000000);
  const lowBits = (dataSize + 4) >>> 0;
  view.setUint32(56, highBits, false); // high 32 bits of size
  view.setUint32(60, lowBits, false); // low 32 bits of size
  view.setUint32(64, 0, false); // mEditCount = 0

  const chunks: BlobPart[] = [headerBuffer];

  // 4. Sample Data in Chunks
  const CHUNK_FRAMES = 32768;
  const channelData: Float32Array[] = [];
  for (let c = 0; c < numChannels; c++) {
    channelData.push(sourceBuffer.getChannelData(c < sourceBuffer.numberOfChannels ? c : 0));
  }

  for (let offset = 0; offset < numSamples; offset += CHUNK_FRAMES) {
    const chunkFrames = Math.min(CHUNK_FRAMES, numSamples - offset);
    const chunkBytes = chunkFrames * bytesPerPacket;
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
          chunkView.setFloat32(byteOffset, channelData[c][frameIdx], false); // big-endian float
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

  return new Blob(chunks as unknown as BlobPart[], { type: 'audio/x-caf' });
}
