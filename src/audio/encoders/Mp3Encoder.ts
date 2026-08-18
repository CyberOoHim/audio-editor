import * as lameModule from '@breezystack/lamejs';

export interface Mp3EncoderOptions {
  bitrate?: 128 | 192 | 256 | 320;
  channels?: 1 | 2;
  sampleRate?: number;
  onProgress?: (progress: number) => void;
}

export async function encodeMp3(
  buffer: AudioBuffer,
  options: Mp3EncoderOptions = {}
): Promise<Blob> {
  const bitrate = options.bitrate || 192;
  const targetChannels = options.channels || (buffer.numberOfChannels >= 2 ? 2 : 1);
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
  const samples = sourceBuffer.length;

  const Mp3Encoder = (lameModule as any).Mp3Encoder || (lameModule as any).default?.Mp3Encoder;
  const encoder = new Mp3Encoder(numChannels, sampleRate, bitrate);

  // Convert Float32 to Int16
  const leftFloat = sourceBuffer.getChannelData(0);
  const rightFloat = numChannels > 1 ? sourceBuffer.getChannelData(1) : leftFloat;

  const leftInt16 = new Int16Array(samples);
  const rightInt16 = new Int16Array(samples);

  for (let i = 0; i < samples; i++) {
    const l = Math.max(-1, Math.min(1, leftFloat[i]));
    leftInt16[i] = l < 0 ? l * 0x8000 : l * 0x7FFF;

    if (numChannels > 1) {
      const r = Math.max(-1, Math.min(1, rightFloat[i]));
      rightInt16[i] = r < 0 ? r * 0x8000 : r * 0x7FFF;
    }
  }

  const mp3Data: Uint8Array[] = [];
  const chunkSize = 1152; // LAME standard frame sample size

  for (let i = 0; i < samples; i += chunkSize) {
    const leftChunk = leftInt16.subarray(i, i + chunkSize);
    let mp3buf: Int8Array | Uint8Array;

    if (numChannels === 1) {
      mp3buf = encoder.encodeBuffer(leftChunk);
    } else {
      const rightChunk = rightInt16.subarray(i, i + chunkSize);
      mp3buf = encoder.encodeBuffer(leftChunk, rightChunk);
    }

    if (mp3buf.length > 0) {
      mp3Data.push(new Uint8Array(mp3buf));
    }

    if (options.onProgress && i % (chunkSize * 10) === 0) {
      options.onProgress(Math.min(0.95, i / samples));
      // Yield to main thread briefly for responsive UI
      await new Promise(r => setTimeout(r, 0));
    }
  }

  const endBuf = encoder.flush();
  if (endBuf.length > 0) {
    mp3Data.push(new Uint8Array(endBuf));
  }

  if (options.onProgress) {
    options.onProgress(1.0);
  }

  return new Blob(mp3Data as BlobPart[], { type: 'audio/mp3' });
}
