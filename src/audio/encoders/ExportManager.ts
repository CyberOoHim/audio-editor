import type { ExportSettings, AudioSelection } from '../../types/audio';
import { sliceBuffer } from '../BufferUtils';
import { encodeWav } from './WavEncoder';
import { encodeMp3 } from './Mp3Encoder';
import { encodeAac } from './AacEncoder';
import { encodeM4a } from './M4aEncoder';
import { encodeFlac } from './FlacEncoder';
import { encodeOgg } from './OggEncoder';
import { encodeOpus } from './OpusEncoder';
import { encodeWebm } from './WebmEncoder';
import { encodeAiff } from './AiffEncoder';
import { encodeCaf } from './CafEncoder';
import { encodeAu } from './AuEncoder';
import { encodeRawPcm } from './RawPcmEncoder';
import { encodeM4r } from './M4rEncoder';
import { encodeWma } from './WmaEncoder';
import { encodeAmr } from './AmrEncoder';
import { encodeMp2 } from './Mp2Encoder';

export async function exportAudio(
  buffer: AudioBuffer,
  settings: ExportSettings,
  selection: AudioSelection | null,
  ctx: BaseAudioContext,
  onProgress?: (progress: number) => void
): Promise<{ blob: Blob; fileName: string; format: string }> {
  let targetBuffer = buffer;

  // If selection only, extract slice
  if (settings.exportScope === 'selection' && selection) {
    targetBuffer = sliceBuffer(ctx, buffer, selection.start, selection.end);
  }

  let blob: Blob;
  let extension = settings.format;

  switch (settings.format) {
    case 'mp3':
      blob = await encodeMp3(targetBuffer, {
        bitrate: settings.mp3Bitrate,
        channels: settings.channels,
        sampleRate: settings.sampleRate,
        onProgress
      });
      break;

    case 'aac':
      blob = await encodeAac(targetBuffer, {
        bitrate: settings.aacBitrate || settings.mp3Bitrate,
        channels: settings.channels,
        sampleRate: settings.sampleRate,
        onProgress
      });
      break;

    case 'm4a':
      blob = await encodeM4a(targetBuffer, {
        bitrate: settings.aacBitrate || settings.mp3Bitrate,
        channels: settings.channels,
        sampleRate: settings.sampleRate,
        onProgress
      });
      break;

    case 'flac':
      blob = await encodeFlac(targetBuffer, {
        bitDepth: settings.flacBitDepth || 24,
        channels: settings.channels,
        sampleRate: settings.sampleRate,
        onProgress
      });
      break;

    case 'ogg':
      blob = await encodeOgg(targetBuffer, {
        bitrate: settings.mp3Bitrate,
        channels: settings.channels,
        sampleRate: settings.sampleRate,
        onProgress
      });
      break;

    case 'opus':
      blob = await encodeOpus(targetBuffer, {
        bitrate: settings.mp3Bitrate,
        channels: settings.channels,
        sampleRate: settings.sampleRate,
        onProgress
      });
      break;

    case 'webm':
      blob = await encodeWebm(targetBuffer, {
        bitrate: settings.mp3Bitrate,
        channels: settings.channels,
        sampleRate: settings.sampleRate,
        onProgress
      });
      break;

    case 'aiff':
      blob = await encodeAiff(targetBuffer, {
        bitDepth: settings.aiffBitDepth || settings.wavBitDepth,
        channels: settings.channels,
        sampleRate: settings.sampleRate,
        onProgress
      });
      extension = 'aiff';
      break;

    case 'caf':
      blob = await encodeCaf(targetBuffer, {
        bitDepth: settings.wavBitDepth,
        channels: settings.channels,
        sampleRate: settings.sampleRate,
        onProgress
      });
      extension = 'caf';
      break;

    case 'au':
      blob = await encodeAu(targetBuffer, {
        bitDepth: settings.auBitDepth || (settings.wavBitDepth as 16 | 24 | 32),
        channels: settings.channels,
        sampleRate: settings.sampleRate,
        onProgress
      });
      extension = 'au';
      break;

    case 'raw':
      blob = await encodeRawPcm(targetBuffer, {
        bitDepth: settings.rawBitDepth || (settings.wavBitDepth as 16 | 24 | 32),
        endian: settings.rawEndian || 'little',
        channels: settings.channels,
        sampleRate: settings.sampleRate,
        onProgress
      });
      extension = 'raw';
      break;

    case 'm4r':
      blob = await encodeM4r(targetBuffer, {
        bitrate: settings.aacBitrate || settings.mp3Bitrate,
        channels: settings.channels,
        sampleRate: settings.sampleRate,
        onProgress
      });
      extension = 'm4r';
      break;

    case 'wma':
      blob = await encodeWma(targetBuffer, {
        bitrate: settings.mp3Bitrate,
        channels: settings.channels,
        sampleRate: settings.sampleRate,
        onProgress
      });
      extension = 'wma';
      break;

    case 'amr':
      blob = await encodeAmr(targetBuffer, {
        bitrate: 64,
        channels: settings.channels,
        sampleRate: settings.sampleRate,
        onProgress
      });
      extension = 'amr';
      break;

    case 'mp2':
      blob = await encodeMp2(targetBuffer, {
        bitrate: settings.mp3Bitrate,
        channels: settings.channels,
        sampleRate: settings.sampleRate,
        onProgress
      });
      extension = 'mp2';
      break;

    case 'wav':
    default:
      blob = await encodeWav(targetBuffer, {
        bitDepth: settings.wavBitDepth,
        channels: settings.channels,
        sampleRate: settings.sampleRate
      });
      extension = 'wav';
      if (onProgress) onProgress(1.0);
      break;
  }

  let cleanName = settings.fileName.trim() || 'audio_export';
  if (cleanName.endsWith(`.${extension}`)) {
    cleanName = cleanName.substring(0, cleanName.length - extension.length - 1);
  }
  const fullFileName = `${cleanName}.${extension}`;

  return { blob, fileName: fullFileName, format: extension };
}

export function triggerDownload(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 100);
}
