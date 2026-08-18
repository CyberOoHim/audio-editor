export interface RawPcmEncoderOptions {
  bitDepth?: 8 | 16 | 24 | 32;
  endian?: 'little' | 'big';
  channels?: 1 | 2;
  sampleRate?: number;
  onProgress?: (progress: number) => void;
}

/**
 * Encodes an AudioBuffer into headerless raw PCM samples (.raw / .pcm).
 */
export async function encodeRawPcm(
  buffer: AudioBuffer,
  options: RawPcmEncoderOptions = {}
): Promise<Blob> {
  const bitDepth = options.bitDepth || 16;
  const isLittle = (options.endian ?? 'little') === 'little';
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
  const numSamples = sourceBuffer.length;

  let bytesPerSample = 2;
  if (bitDepth === 8) bytesPerSample = 1;
  else if (bitDepth === 24) bytesPerSample = 3;
  else if (bitDepth === 32) bytesPerSample = 4;

  const totalSize = numSamples * numChannels * bytesPerSample;
  const arrayBuffer = new ArrayBuffer(totalSize);
  const view = new DataView(arrayBuffer);

  let offset = 0;
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
        view.setInt16(offset, Math.floor(intSample), isLittle);
        offset += 2;
      }
    }
  } else if (bitDepth === 24) {
    for (let i = 0; i < numSamples; i++) {
      for (let c = 0; c < numChannels; c++) {
        const s = Math.max(-1, Math.min(1, channelData[c][i]));
        const intSample = s < 0 ? s * 0x800000 : s * 0x7FFFFF;
        const int24 = Math.floor(intSample);
        if (isLittle) {
          view.setUint8(offset, int24 & 0xff);
          view.setUint8(offset + 1, (int24 >> 8) & 0xff);
          view.setUint8(offset + 2, (int24 >> 16) & 0xff);
        } else {
          view.setUint8(offset, (int24 >> 16) & 0xff);
          view.setUint8(offset + 1, (int24 >> 8) & 0xff);
          view.setUint8(offset + 2, int24 & 0xff);
        }
        offset += 3;
      }
    }
  } else if (bitDepth === 32) {
    for (let i = 0; i < numSamples; i++) {
      for (let c = 0; c < numChannels; c++) {
        view.setFloat32(offset, channelData[c][i], isLittle);
        offset += 4;
      }
    }
  }

  if (options.onProgress) {
    options.onProgress(1.0);
  }

  return new Blob([arrayBuffer], { type: 'application/octet-stream' });
}
