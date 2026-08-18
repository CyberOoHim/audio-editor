export interface AuEncoderOptions {
  bitDepth?: 8 | 16 | 24 | 32;
  channels?: 1 | 2;
  sampleRate?: number;
  onProgress?: (progress: number) => void;
}

/**
 * Encodes an AudioBuffer into Sun / NeXT AU (.au / .snd) format.
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
  const totalSize = headerSize + dataSize;

  const arrayBuffer = new ArrayBuffer(totalSize);
  const view = new DataView(arrayBuffer);

  // 1. Magic number ".snd" (0x2e736e64)
  view.setUint32(0, 0x2e736e64, false); // big-endian
  // 2. Data offset (24 bytes)
  view.setUint32(4, headerSize, false);
  // 3. Data size
  view.setUint32(8, dataSize, false);
  // 4. Encoding code
  view.setUint32(12, encodingCode, false);
  // 5. Sample rate
  view.setUint32(16, sampleRate, false);
  // 6. Channels
  view.setUint32(20, numChannels, false);

  // 7. Write interleaved samples
  let offset = headerSize;
  const channelData: Float32Array[] = [];
  for (let c = 0; c < numChannels; c++) {
    channelData.push(sourceBuffer.getChannelData(c < sourceBuffer.numberOfChannels ? c : 0));
  }

  if (bitDepth === 8) {
    for (let i = 0; i < numSamples; i++) {
      for (let c = 0; c < numChannels; c++) {
        const s = Math.max(-1, Math.min(1, channelData[c][i]));
        const intSample = s < 0 ? s * 0x80 : s * 0x7F;
        view.setInt8(offset, Math.floor(intSample));
        offset += 1;
      }
    }
  } else if (bitDepth === 16) {
    for (let i = 0; i < numSamples; i++) {
      for (let c = 0; c < numChannels; c++) {
        const s = Math.max(-1, Math.min(1, channelData[c][i]));
        const intSample = s < 0 ? s * 0x8000 : s * 0x7FFF;
        view.setInt16(offset, Math.floor(intSample), false); // big-endian
        offset += 2;
      }
    }
  } else if (bitDepth === 24) {
    for (let i = 0; i < numSamples; i++) {
      for (let c = 0; c < numChannels; c++) {
        const s = Math.max(-1, Math.min(1, channelData[c][i]));
        const intSample = s < 0 ? s * 0x800000 : s * 0x7FFFFF;
        const int24 = Math.floor(intSample);
        view.setUint8(offset, (int24 >> 16) & 0xff);
        view.setUint8(offset + 1, (int24 >> 8) & 0xff);
        view.setUint8(offset + 2, int24 & 0xff);
        offset += 3;
      }
    }
  } else if (bitDepth === 32) {
    for (let i = 0; i < numSamples; i++) {
      for (let c = 0; c < numChannels; c++) {
        view.setFloat32(offset, channelData[c][i], false); // big-endian float
        offset += 4;
      }
    }
  }

  if (options.onProgress) {
    options.onProgress(1.0);
  }

  return new Blob([arrayBuffer], { type: 'audio/basic' });
}
