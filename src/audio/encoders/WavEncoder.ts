export interface WavEncoderOptions {
  bitDepth?: 16 | 24 | 32;
  channels?: 1 | 2;
  sampleRate?: number;
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

  const arrayBuffer = new ArrayBuffer(totalSize);
  const view = new DataView(arrayBuffer);

  function writeString(offset: number, str: string) {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  }

  // RIFF Header
  writeString(0, 'RIFF');
  view.setUint32(4, totalSize - 8, true);
  writeString(8, 'WAVE');

  // fmt chunk
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true); // subchunk size
  view.setUint16(20, formatCode, true); // audio format
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);

  // data chunk
  writeString(36, 'data');
  view.setUint32(40, dataSize, true);

  // Write Interleaved Samples
  let offset = 44;
  const channelData: Float32Array[] = [];
  for (let c = 0; c < numChannels; c++) {
    channelData.push(sourceBuffer.getChannelData(c < sourceBuffer.numberOfChannels ? c : 0));
  }

  if (bitDepth === 16) {
    for (let i = 0; i < numSamples; i++) {
      for (let c = 0; c < numChannels; c++) {
        const s = Math.max(-1, Math.min(1, channelData[c][i]));
        const intSample = s < 0 ? s * 0x8000 : s * 0x7FFF;
        view.setInt16(offset, intSample, true);
        offset += 2;
      }
    }
  } else if (bitDepth === 24) {
    for (let i = 0; i < numSamples; i++) {
      for (let c = 0; c < numChannels; c++) {
        const s = Math.max(-1, Math.min(1, channelData[c][i]));
        const intSample = s < 0 ? s * 0x800000 : s * 0x7FFFFF;
        const int24 = Math.floor(intSample);
        view.setUint8(offset, int24 & 0xFF);
        view.setUint8(offset + 1, (int24 >> 8) & 0xFF);
        view.setUint8(offset + 2, (int24 >> 16) & 0xFF);
        offset += 3;
      }
    }
  } else if (bitDepth === 32) {
    for (let i = 0; i < numSamples; i++) {
      for (let c = 0; c < numChannels; c++) {
        view.setFloat32(offset, channelData[c][i], true);
        offset += 4;
      }
    }
  }

  return new Blob([arrayBuffer], { type: 'audio/wav' });
}
