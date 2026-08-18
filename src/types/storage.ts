export interface FolderItem {
  id: string;
  name: string;
  parentId: string | null;
  color?: string;
  createdAt: number;
  updatedAt: number;
}

export interface AudioFileItem {
  id: string;
  name: string;
  folderId: string | null;
  duration: number; // in seconds
  sampleRate: number; // e.g. 44100, 48000
  numberOfChannels: number; // 1 or 2
  format: string; // 'wav' | 'mp3' | 'aac' | 'flac' | 'ogg' | 'm4a' | 'webm'
  size: number; // in bytes
  blob: Blob;
  waveformPeaks: number[]; // 64 or 128 normalized float peaks [0..1]
  tags: string[];
  createdAt: number;
  updatedAt: number;
  favorite?: boolean;
}

export interface StorageUsage {
  usage: number;
  quota: number;
  percent: number;
  formattedUsage: string;
  formattedQuota: string;
}
