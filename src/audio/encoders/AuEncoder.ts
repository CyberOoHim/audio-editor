/**
 * Direct Chunk-Streamed Lossless Sun / NeXT AU (.au / .snd) Encoder.
 * Writes directly to chunked Blob streams without allocating monolithic multi-gigabyte ArrayBuffers.
 */

export interface AuEncoderOptions {
  bitDepth?: 8 | 16 | 24 | 32;
  channels?: 1 | 2;
  sampleRate?: number;
  onProgress?: (progress: number) => void;
}

/**
 * Encodes an AudioBuffer into Sun / NeXT AU (.au / .snd) format using chunk streaming.
 */
export async function encodeAu(
  buffer: AudioBuffer,
  options: AuEncoderOptions = {}
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
  let encodingCode = 3; // 16-bit linear PCM

  if (bitDepth === 8) {
    bytesPerSample = 1;
    encodingCode = 2; // 8-bit linear PCM
  } else if (bitDepth === 24) {
    bytesPerSample = 3;
    encodingCode = 4; // 24-bit linear PCM
  } else if (bitDepth === 32) {
    bytesPerSample = 4;
    encodingCode = 6; // 32-bit IEEE float
  }

  const dataSize = numSamples * numChannels * bytesPerSample;
  const headerSize = 24;

  const headerBuffer = new ArrayBuffer(24);
  const view = new DataView(headerBuffer);

  // 1. Magic number ".snd" (0x2e736e64)
  view.setUint32(0, 0x2e736e64, false); // big-endian
  // 2. Data offset (24 bytes)
  view.setUint32(4, headerSize, false);
  // 3. Data size (0xffffffff if unbounded or exact)
  view.setUint32(8, Math.min(0xffffffff, dataSize), false);
  // 4. Encoding code
  view.setUint32(12, encodingCode, false);
  // 5. Sample rate
  view.setUint32(16, sampleRate, false);
  // 6. Channels
  view.setUint32(20, numChannels, false);

  const chunks: BlobPart[] = [headerBuffer];

  // 7. Write interleaved samples in chunks
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

    if (bitDepth === 8) {
      for (let i = 0; i < chunkFrames; i++) {
        const frameIdx = offset + i;
        for (let c = 0; c < numChannels; c++) {
          const s = Math.max(-1, Math.min(1, channelData[c][frameIdx]));
          const intSample = s < 0 ? s * 0x80 : s * 0x7f;
          chunkView.setInt8(byteOffset, Math.floor(intSample));
          byteOffset += 1;
        }
      }
    } else if (bitDepth === 16) {
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

  return new Blob(chunks as unknown as BlobPart[], { type: 'audio/basic' });
}
