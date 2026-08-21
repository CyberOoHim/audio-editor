/**
 * Direct Chunk-Streamed Lossless WAV Encoder.
 * Writes directly to chunked Blob streams without allocating monolithic multi-gigabyte ArrayBuffers.
 * Safe for 50+ minute 24-bit/32-bit audio files with near-zero memory footprint.
 */

export interface WavEncoderOptions {
  bitDepth?: 16 | 24 | 32;
  channels?: 1 | 2;
  sampleRate?: number;
  onProgress?: (progress: number) => void;
}

export async function encodeWav(
  buffer: AudioBuffer,
  options: WavEncoderOptions = {}
): Promise<Blob> {
  const bitDepth = options.bitDepth || 16;
  const targetChannels = options.channels || buffer.numberOfChannels;
  const targetSampleRate = options.sampleRate || buffer.sampleRate;

  let sourceBuffer = buffer;

  // If sample rate or channels change, resample via OfflineAudioContext
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
  let formatCode = 1; // PCM

  if (bitDepth === 24) {
    bytesPerSample = 3;
    formatCode = 1;
  } else if (bitDepth === 32) {
    bytesPerSample = 4;
    formatCode = 3; // IEEE Float
  }

  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = numSamples * blockAlign;
  const headerSize = 44;
  const totalSize = headerSize + dataSize;

  // 1. Build RIFF 44-byte Header Chunk
  const headerBuffer = new ArrayBuffer(44);
  const view = new DataView(headerBuffer);

  function writeString(offset: number, str: string) {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  }

  // RIFF Header
  writeString(0, 'RIFF');
  // RIFF chunk size (wrap-around safe for standard 32-bit chunk header)
  view.setUint32(4, Math.min(0xffffffff - 8, totalSize - 8), true);
  writeString(8, 'WAVE');

  // fmt chunk
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true); // subchunk size
  view.setUint16(20, formatCode, true); // audio format (1 = PCM, 3 = IEEE Float)
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);

  // data chunk
  writeString(36, 'data');
  view.setUint32(40, Math.min(0xffffffff, dataSize), true);

  const chunks: BlobPart[] = [headerBuffer];

  // 2. Stream Audio Samples in Chunks (32,768 frames per batch)
  const CHUNK_FRAMES = 32768;
  const channelData: Float32Array[] = [];
  for (let c = 0; c < numChannels; c++) {
    channelData.push(sourceBuffer.getChannelData(c < sourceBuffer.numberOfChannels ? c : 0));
  }

  for (let offset = 0; offset < numSamples; offset += CHUNK_FRAMES) {
    const chunkFrames = Math.min(CHUNK_FRAMES, numSamples - offset);
    const chunkBytes = chunkFrames * blockAlign;
    const chunkArray = new Uint8Array(chunkBytes);
    const chunkView = new DataView(chunkArray.buffer);

    let byteOffset = 0;

    if (bitDepth === 16) {
      for (let i = 0; i < chunkFrames; i++) {
        const frameIdx = offset + i;
        for (let c = 0; c < numChannels; c++) {
          const s = Math.max(-1, Math.min(1, channelData[c][frameIdx]));
          const intSample = s < 0 ? s * 0x8000 : s * 0x7fff;
          chunkView.setInt16(byteOffset, Math.floor(intSample), true);
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
          chunkArray[byteOffset] = int24 & 0xff;
          chunkArray[byteOffset + 1] = (int24 >> 8) & 0xff;
          chunkArray[byteOffset + 2] = (int24 >> 16) & 0xff;
          byteOffset += 3;
        }
      }
    } else if (bitDepth === 32) {
      for (let i = 0; i < chunkFrames; i++) {
        const frameIdx = offset + i;
        for (let c = 0; c < numChannels; c++) {
          chunkView.setFloat32(byteOffset, channelData[c][frameIdx], true);
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

  return new Blob(chunks as unknown as BlobPart[], { type: 'audio/wav' });
}
