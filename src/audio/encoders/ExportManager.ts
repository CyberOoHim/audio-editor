import type { ExportSettings, AudioSelection } from '../../types/audio';
import { sliceBuffer } from '../BufferUtils';
import { encodeWav } from './WavEncoder';
import { encodeMp3 } from './Mp3Encoder';
import { encodeFlac, encodeOgg } from './FlacEncoder';

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

    case 'flac':
      blob = await encodeFlac(targetBuffer, {
        channels: settings.channels,
        sampleRate: settings.sampleRate
      });
      break;

    case 'ogg':
      blob = await encodeOgg(targetBuffer);
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
