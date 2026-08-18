import JSZip from 'jszip';
import type { StorageUsage, AudioFileItem, FolderItem } from '../types/storage';
import { db, saveAudioFile } from './database';

export function formatBytes(bytes: number, decimals: number = 2): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

export async function getStorageEstimate(): Promise<StorageUsage> {
  if (navigator.storage && navigator.storage.estimate) {
    try {
      const estimate = await navigator.storage.estimate();
      const usage = estimate.usage || 0;
      const quota = estimate.quota || (1024 * 1024 * 1024 * 2); // default 2GB fallback
      const percent = quota > 0 ? (usage / quota) * 100 : 0;
      return {
        usage,
        quota,
        percent: Math.min(100, Math.max(0, percent)),
        formattedUsage: formatBytes(usage),
        formattedQuota: formatBytes(quota),
      };
    } catch {
      // Fallback
    }
  }

  // Fallback estimation by counting blobs in DB
  const allFiles = await db.audio_files.toArray();
  const usage = allFiles.reduce((acc, f) => acc + (f.size || 0), 0);
  const quota = 1024 * 1024 * 1024; // 1GB
  return {
    usage,
    quota,
    percent: (usage / quota) * 100,
    formattedUsage: formatBytes(usage),
    formattedQuota: formatBytes(quota),
  };
}

export function generateWaveformPeaks(buffer: AudioBuffer, numPeaks: number = 64): number[] {
  const peaks: number[] = new Array(numPeaks).fill(0);
  const channels = buffer.numberOfChannels;
  const length = buffer.length;
  const blockSize = Math.floor(length / numPeaks);

  if (blockSize === 0) return peaks;

  for (let c = 0; c < channels; c++) {
    const channelData = buffer.getChannelData(c);
    for (let i = 0; i < numPeaks; i++) {
      const start = i * blockSize;
      const end = Math.min(start + blockSize, length);
      let max = 0;
      for (let j = start; j < end; j += 4) { // stride for performance
        const val = Math.abs(channelData[j]);
        if (val > max) max = val;
      }
      peaks[i] = Math.max(peaks[i], Math.min(1, max));
    }
  }

  return peaks;
}

export async function exportAllToZip(): Promise<Blob> {
  const zip = new JSZip();
  const folders = await db.folders.toArray();
  const files = await db.audio_files.toArray();

  // Create folder map
  const folderMap = new Map<string, FolderItem>();
  folders.forEach(f => folderMap.set(f.id, f));

  // Helper to build folder path
  function getFolderPath(folderId: string | null): string {
    if (!folderId) return '';
    const parts: string[] = [];
    let current: string | null = folderId;
    while (current && folderMap.has(current)) {
      const folderItem: FolderItem | undefined = folderMap.get(current);
      if (!folderItem) break;
      parts.unshift(folderItem.name.replace(/[/\\?%*:|"<>]/g, '_'));
      current = folderItem.parentId;
    }
    return parts.join('/') + '/';
  }

  // Add files to zip
  for (const file of files) {
    const folderPath = getFolderPath(file.folderId);
    let fileName = file.name;
    if (!fileName.includes('.')) {
      fileName = `${fileName}.${file.format}`;
    }
    zip.file(folderPath + fileName, file.blob);
  }

  // Add metadata json
  const metadata = {
    version: 1,
    exportedAt: new Date().toISOString(),
    folders: folders.map(f => ({ id: f.id, name: f.name, parentId: f.parentId, color: f.color })),
    files: files.map(f => ({
      id: f.id,
      name: f.name,
      folderId: f.folderId,
      format: f.format,
      duration: f.duration,
      tags: f.tags,
      sampleRate: f.sampleRate,
      numberOfChannels: f.numberOfChannels
    }))
  };
  zip.file('_audiocraft_metadata.json', JSON.stringify(metadata, null, 2));

  return await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
}

export async function importFromZip(zipFile: File | Blob): Promise<{ importedCount: number }> {
  const zip = await JSZip.loadAsync(zipFile);
  let importedCount = 0;

  // Check if metadata exists
  const metaFile = zip.file('_audiocraft_metadata.json');
  if (metaFile) {
    const metaText = await metaFile.async('text');
    const metadata = JSON.parse(metaText);
    
    // Import folders if not exists
    if (Array.isArray(metadata.folders)) {
      for (const f of metadata.folders) {
        const exists = await db.folders.get(f.id);
        if (!exists) {
          await db.folders.add({
            id: f.id,
            name: f.name,
            parentId: f.parentId,
            color: f.color || '#38bdf8',
            createdAt: Date.now(),
            updatedAt: Date.now(),
          });
        }
      }
    }
  }

  // Iterate over files in zip
  const entries: Array<{ name: string; zipObject: JSZip.JSZipObject }> = [];
  zip.forEach((relativePath, zipObject) => {
    if (!zipObject.dir && !relativePath.startsWith('_') && !relativePath.startsWith('__MACOSX')) {
      entries.push({ name: relativePath, zipObject });
    }
  });

  const tempAudioCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();

  try {
    for (const entry of entries) {
      try {
        const blob = await entry.zipObject.async('blob');
        const arrayBuffer = await blob.arrayBuffer();
        const decodedBuffer = await tempAudioCtx.decodeAudioData(arrayBuffer.slice(0));
        
        const fileNameWithExt = entry.name.split('/').pop() || 'Imported Audio';
        const nameParts = fileNameWithExt.split('.');
        const format = nameParts.length > 1 ? nameParts.pop()!.toLowerCase() : 'wav';
        const name = nameParts.join('.');
        
        const peaks = generateWaveformPeaks(decodedBuffer, 64);
        
        await saveAudioFile({
          name,
          folderId: null,
          duration: decodedBuffer.duration,
          sampleRate: decodedBuffer.sampleRate,
          numberOfChannels: decodedBuffer.numberOfChannels,
          format,
          size: blob.size,
          blob,
          waveformPeaks: peaks,
          tags: ['imported'],
          favorite: false
        });
        importedCount++;
      } catch (err) {
        console.warn('Could not decode file from zip:', entry.name, err);
      }
    }
  } finally {
    if (tempAudioCtx.state !== 'closed') {
      await tempAudioCtx.close().catch(() => {});
    }
  }

  return { importedCount };
}

// Generate demo synthesizer melody for first-time onboarding
export async function createDemoAudioFile(): Promise<AudioFileItem> {
  const sampleRate = 44100;
  const duration = 4.0; // 4 seconds
  const offlineCtx = new OfflineAudioContext(2, Math.max(1, Math.floor(sampleRate * duration)), sampleRate);
  const buffer = offlineCtx.createBuffer(2, Math.floor(sampleRate * duration), sampleRate);
  
  const left = buffer.getChannelData(0);
  const right = buffer.getChannelData(1);
  
  const notes = [261.63, 329.63, 392.00, 440.00, 523.25, 659.25, 783.99, 1046.50];
  
  for (let i = 0; i < buffer.length; i++) {
    const t = i / sampleRate;
    let sampleL = 0;
    let sampleR = 0;
    
    // Ambient chord pad
    const pad = Math.sin(2 * Math.PI * 130.81 * t) * 0.15 + 
                Math.sin(2 * Math.PI * 196.00 * t) * 0.12 + 
                Math.sin(2 * Math.PI * 261.63 * t) * 0.10;
                
    sampleL += pad;
    sampleR += pad;

    // Arpeggio notes
    const noteIndex = Math.floor((t * 4) % notes.length);
    const noteFreq = notes[noteIndex];
    const noteTime = (t * 4) % 1;
    const noteEnv = Math.exp(-noteTime * 6);
    
    const pluck = (Math.sin(2 * Math.PI * noteFreq * t) + 
                   Math.sin(2 * Math.PI * noteFreq * 2 * t) * 0.4) * noteEnv * 0.25;
                   
    const pan = Math.sin(2 * Math.PI * 0.5 * t);
    sampleL += pluck * (0.5 - pan * 0.3);
    sampleR += pluck * (0.5 + pan * 0.3);
    
    const masterEnv = Math.min(1, t * 2) * Math.min(1, (duration - t) * 2);
    
    left[i] = sampleL * masterEnv;
    right[i] = sampleR * masterEnv;
  }

  // Convert buffer to WAV blob
  const wavBlob = audioBufferToWavBlob(buffer);
  const peaks = generateWaveformPeaks(buffer, 64);

  return await saveAudioFile({
    name: 'Synth Melody Demo (Stereo)',
    folderId: 'samples',
    duration,
    sampleRate,
    numberOfChannels: 2,
    format: 'wav',
    size: wavBlob.size,
    blob: wavBlob,
    waveformPeaks: peaks,
    tags: ['demo', 'synth', 'ambient'],
    favorite: true
  });
}

function audioBufferToWavBlob(buffer: AudioBuffer): Blob {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const format = 1;
  const bitDepth = 16;
  const bytesPerSample = bitDepth / 8;
  const blockAlign = numChannels * bytesPerSample;
  
  const samples = buffer.length;
  const dataSize = samples * blockAlign;
  const bufferSize = 44 + dataSize;
  const arrayBuffer = new ArrayBuffer(bufferSize);
  const view = new DataView(arrayBuffer);

  function writeString(offset: number, str: string) {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  }

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, 'WAVE');
  
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, format, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);

  writeString(36, 'data');
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < samples; i++) {
    for (let channel = 0; channel < numChannels; channel++) {
      const sample = Math.max(-1, Math.min(1, buffer.getChannelData(channel)[i]));
      const intSample = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
      view.setInt16(offset, intSample, true);
      offset += 2;
    }
  }

  return new Blob([arrayBuffer], { type: 'audio/wav' });
}
