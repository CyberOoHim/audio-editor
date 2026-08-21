/**
 * High-Speed Offline Audio Encoder using W3C WebCodecs API (AudioEncoder + AudioData).
 * Accesses native hardware-accelerated AAC and Opus encoders directly at offline speeds.
 */

import { muxAacToM4a, type AacChunk } from './M4aMuxer';
import { muxOpusToOgg, type OpusFrame } from './OggOpusMuxer';

export function isWebCodecsAudioSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof (window as any).AudioEncoder === 'function' &&
    typeof (window as any).AudioData === 'function'
  );
}

const SAMPLE_RATE_TABLE = [
  96000, 88200, 64000, 48000, 44100, 32000, 24000, 22050, 16000, 12000, 11025, 8000, 7350
];

function getSampleRateIndex(rate: number): number {
  const idx = SAMPLE_RATE_TABLE.indexOf(rate);
  return idx !== -1 ? idx : 4;
}

/**
 * Creates 7-byte ADTS header for raw AAC-LC frames to produce standalone .aac files
 */
function createAdtsHeader(dataLength: number, sampleRate: number, channels: number): Uint8Array {
  const header = new Uint8Array(7);
  const frameLength = dataLength + 7;
  const freqIdx = getSampleRateIndex(sampleRate);
  const profile = 1; // AAC-LC (MPEG-4 Audio Object Type - 1 = 1)
  const chanCfg = channels;

  header[0] = 0xff; // Syncword 8 bits
  header[1] = 0xf1; // Syncword 4 bits (0xF) + MPEG-4 (0) + Layer (00) + No CRC (1)
  header[2] = ((profile & 0x03) << 6) | ((freqIdx & 0x0f) << 2) | ((chanCfg >> 2) & 0x01);
  header[3] = ((chanCfg & 0x03) << 6) | ((frameLength >> 11) & 0x03);
  header[4] = (frameLength >> 3) & 0xff;
  header[5] = ((frameLength & 0x07) << 5) | 0x1f;
  header[6] = 0xfc;
  return header;
}

/**
 * Resamples an AudioBuffer offline if requested sample rate or channel count differs.
 */
async function prepareSourceBuffer(
  buffer: AudioBuffer,
  targetChannels: 1 | 2,
  targetSampleRate: number
): Promise<AudioBuffer> {
  if (buffer.sampleRate === targetSampleRate && buffer.numberOfChannels === targetChannels) {
    return buffer;
  }

  const targetLength = Math.max(1, Math.ceil(buffer.duration * targetSampleRate));
  const offlineCtx = new OfflineAudioContext(targetChannels, targetLength, targetSampleRate);
  const sourceNode = offlineCtx.createBufferSource();
  sourceNode.buffer = buffer;
  sourceNode.connect(offlineCtx.destination);
  sourceNode.start(0);
  return await offlineCtx.startRendering();
}

export interface WebCodecsEncoderOptions {
  bitrate?: number; // in kbps (e.g. 192)
  channels?: 1 | 2;
  sampleRate?: number;
  container?: 'adts' | 'm4a' | 'm4r' | 'ogg' | 'webm';
  onProgress?: (progress: number) => void;
}

/**
 * Offline AAC encoding with WebCodecs AudioEncoder
 */
export async function encodeAacWithWebCodecs(
  buffer: AudioBuffer,
  options: WebCodecsEncoderOptions = {}
): Promise<Blob> {
  if (!isWebCodecsAudioSupported()) {
    throw new Error('WebCodecs AudioEncoder is not supported in this browser.');
  }

  const targetChannels = options.channels || (buffer.numberOfChannels >= 2 ? 2 : 1);
  const targetSampleRate = options.sampleRate || buffer.sampleRate;
  const targetBitrateBps = (options.bitrate || 192) * 1000;
  const container = options.container || 'adts';

  const sourceBuffer = await prepareSourceBuffer(buffer, targetChannels, targetSampleRate);
  const totalSamples = sourceBuffer.length;
  const sampleRate = sourceBuffer.sampleRate;
  const channels = sourceBuffer.numberOfChannels as 1 | 2;

  const config: AudioEncoderConfig = {
    codec: 'mp4a.40.2', // AAC-LC
    sampleRate,
    numberOfChannels: channels,
    bitrate: targetBitrateBps
  };

  const support = await (window as any).AudioEncoder.isConfigSupported(config);
  if (!support.supported) {
    throw new Error(`AAC codec [mp4a.40.2] with sampleRate ${sampleRate} is not supported by WebCodecs.`);
  }

  const chunks: AacChunk[] = [];
  let encoderError: Error | null = null;

  const encoder = new (window as any).AudioEncoder({
    output: (chunk: any) => {
      const data = new Uint8Array(chunk.byteLength);
      chunk.copyTo(data);
      chunks.push({
        data,
        durationFrames: chunk.duration ? Math.round((chunk.duration / 1_000_000) * sampleRate) : 1024
      });
    },
    error: (err: any) => {
      encoderError = err instanceof Error ? err : new Error(String(err));
    }
  });

  encoder.configure(config);

  const channelData: Float32Array[] = [];
  for (let c = 0; c < channels; c++) {
    channelData.push(sourceBuffer.getChannelData(c));
  }

  // Feed audio in chunks of 2048 frames
  const CHUNK_SIZE = 2048;
  const totalFrames = totalSamples;

  for (let offset = 0; offset < totalFrames; offset += CHUNK_SIZE) {
    if (encoderError) throw encoderError;

    const chunkFrames = Math.min(CHUNK_SIZE, totalFrames - offset);
    const planarBuffer = new Float32Array(chunkFrames * channels);

    for (let c = 0; c < channels; c++) {
      const src = channelData[c];
      const chanOffset = c * chunkFrames;
      for (let f = 0; f < chunkFrames; f++) {
        planarBuffer[chanOffset + f] = src[offset + f];
      }
    }

    const audioData = new (window as any).AudioData({
      format: 'f32-planar',
      sampleRate,
      numberOfChannels: channels,
      numberOfFrames: chunkFrames,
      timestamp: Math.round((offset / sampleRate) * 1_000_000), // microseconds
      data: planarBuffer
    });

    encoder.encode(audioData);
    audioData.close();

    if (options.onProgress && offset % (CHUNK_SIZE * 8) === 0) {
      options.onProgress(Math.min(0.95, offset / totalFrames));
      // Give microtask queue brief room to breathe
      await new Promise((r) => setTimeout(r, 0));
    }
  }

  await encoder.flush();
  encoder.close();

  if (encoderError) throw encoderError;
  if (options.onProgress) options.onProgress(1.0);

  // Mux into requested container
  if (container === 'm4a') {
    return muxAacToM4a(chunks, sampleRate, channels, totalSamples, 'M4A ');
  } else if (container === 'm4r') {
    return muxAacToM4a(chunks, sampleRate, channels, totalSamples, 'M4R ');
  } else {
    // ADTS stream format for .aac files
    const blobParts: BlobPart[] = [];
    for (const chunk of chunks) {
      const adtsHeader = createAdtsHeader(chunk.data.length, sampleRate, channels);
      blobParts.push(adtsHeader as unknown as BlobPart);
      blobParts.push(chunk.data as unknown as BlobPart);
    }
    return new Blob(blobParts, { type: 'audio/aac' });
  }
}

/**
 * Offline Opus encoding with WebCodecs AudioEncoder
 */
export async function encodeOpusWithWebCodecs(
  buffer: AudioBuffer,
  options: WebCodecsEncoderOptions = {}
): Promise<Blob> {
  if (!isWebCodecsAudioSupported()) {
    throw new Error('WebCodecs AudioEncoder is not supported in this browser.');
  }

  const targetChannels = options.channels || (buffer.numberOfChannels >= 2 ? 2 : 1);
  // Opus internally typically standardizes to 48000Hz
  const targetSampleRate = 48000;
  const targetBitrateBps = (options.bitrate || 160) * 1000;

  const sourceBuffer = await prepareSourceBuffer(buffer, targetChannels, targetSampleRate);
  const totalSamples = sourceBuffer.length;
  const sampleRate = sourceBuffer.sampleRate;
  const channels = sourceBuffer.numberOfChannels as 1 | 2;

  const config: AudioEncoderConfig = {
    codec: 'opus',
    sampleRate,
    numberOfChannels: channels,
    bitrate: targetBitrateBps
  };

  const support = await (window as any).AudioEncoder.isConfigSupported(config);
  if (!support.supported) {
    throw new Error('Opus codec is not supported by WebCodecs in this browser.');
  }

  const opusFrames: OpusFrame[] = [];
  let encoderError: Error | null = null;

  const encoder = new (window as any).AudioEncoder({
    output: (chunk: any) => {
      const data = new Uint8Array(chunk.byteLength);
      chunk.copyTo(data);
      // Opus frames are typically 20ms = 960 samples at 48kHz
      const sampleCount = chunk.duration ? Math.round((chunk.duration / 1_000_000) * sampleRate) : 960;
      opusFrames.push({ data, sampleCount });
    },
    error: (err: any) => {
      encoderError = err instanceof Error ? err : new Error(String(err));
    }
  });

  encoder.configure(config);

  const channelData: Float32Array[] = [];
  for (let c = 0; c < channels; c++) {
    channelData.push(sourceBuffer.getChannelData(c));
  }

  const CHUNK_SIZE = 960; // 20ms at 48kHz
  const totalFrames = totalSamples;

  for (let offset = 0; offset < totalFrames; offset += CHUNK_SIZE) {
    if (encoderError) throw encoderError;

    const chunkFrames = Math.min(CHUNK_SIZE, totalFrames - offset);
    const planarBuffer = new Float32Array(chunkFrames * channels);

    for (let c = 0; c < channels; c++) {
      const src = channelData[c];
      const chanOffset = c * chunkFrames;
      for (let f = 0; f < chunkFrames; f++) {
        planarBuffer[chanOffset + f] = src[offset + f];
      }
    }

    const audioData = new (window as any).AudioData({
      format: 'f32-planar',
      sampleRate,
      numberOfChannels: channels,
      numberOfFrames: chunkFrames,
      timestamp: Math.round((offset / sampleRate) * 1_000_000),
      data: planarBuffer
    });

    encoder.encode(audioData);
    audioData.close();

    if (options.onProgress && offset % (CHUNK_SIZE * 20) === 0) {
      options.onProgress(Math.min(0.95, offset / totalFrames));
      await new Promise((r) => setTimeout(r, 0));
    }
  }

  await encoder.flush();
  encoder.close();

  if (encoderError) throw encoderError;
  if (options.onProgress) options.onProgress(1.0);

  return muxOpusToOgg(opusFrames, channels, sampleRate);
}
