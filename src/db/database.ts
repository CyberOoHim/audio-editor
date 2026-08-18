import Dexie, { type Table } from 'dexie';
import type { FolderItem, AudioFileItem } from '../types/storage';

export class AudioCraftDatabase extends Dexie {
  folders!: Table<FolderItem, string>;
  audio_files!: Table<AudioFileItem, string>;

  constructor() {
    super('AudioCraftDB');
    
    this.version(1).stores({
      folders: 'id, parentId, name, createdAt, updatedAt',
      audio_files: 'id, folderId, name, format, duration, size, createdAt, updatedAt, *tags, favorite'
    });
  }
}

export const db = new AudioCraftDatabase();

// Default Seeding
export async function initDatabase(): Promise<void> {
  const folderCount = await db.folders.count();
  if (folderCount === 0) {
    const defaultFolders: FolderItem[] = [
      {
        id: 'recordings',
        name: 'Recordings',
        parentId: null,
        color: '#f59e0b',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
      {
        id: 'edits',
        name: 'Studio Edits',
        parentId: null,
        color: '#00f0ff',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
      {
        id: 'samples',
        name: 'Audio Samples',
        parentId: null,
        color: '#10b981',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    ];
    await db.folders.bulkAdd(defaultFolders);
  }
}

// Folder Operations
export async function createFolder(name: string, parentId: string | null = null, color?: string): Promise<FolderItem> {
  const folder: FolderItem = {
    id: 'folder_' + Math.random().toString(36).substring(2, 9) + '_' + Date.now(),
    name: name.trim(),
    parentId,
    color: color || '#38bdf8',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  await db.folders.add(folder);
  return folder;
}

export async function updateFolder(id: string, updates: Partial<FolderItem>): Promise<void> {
  await db.folders.update(id, { ...updates, updatedAt: Date.now() });
}

export async function deleteFolder(id: string): Promise<void> {
  // Move children files to root or delete
  await db.audio_files.where('folderId').equals(id).modify({ folderId: null });
  // Move subfolders to parent
  const folder = await db.folders.get(id);
  const parentId = folder ? folder.parentId : null;
  await db.folders.where('parentId').equals(id).modify({ parentId });
  await db.folders.delete(id);
}

// Audio File Operations
export async function saveAudioFile(item: Omit<AudioFileItem, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }): Promise<AudioFileItem> {
  const id = item.id || 'file_' + Math.random().toString(36).substring(2, 9) + '_' + Date.now();
  const file: AudioFileItem = {
    ...item,
    id,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    tags: item.tags || [],
    favorite: item.favorite || false,
  };
  await db.audio_files.put(file);
  return file;
}

export async function updateAudioFile(id: string, updates: Partial<AudioFileItem>): Promise<void> {
  await db.audio_files.update(id, { ...updates, updatedAt: Date.now() });
}

export async function deleteAudioFile(id: string): Promise<void> {
  await db.audio_files.delete(id);
}

export async function deleteAudioFiles(ids: string[]): Promise<void> {
  await db.audio_files.bulkDelete(ids);
}

export async function getFilesByFolder(folderId: string | null): Promise<AudioFileItem[]> {
  if (folderId === null) {
    return await db.audio_files.filter(f => f.folderId === null).reverse().sortBy('createdAt');
  }
  return await db.audio_files.where('folderId').equals(folderId).reverse().sortBy('createdAt');
}

export async function getAllAudioFiles(): Promise<AudioFileItem[]> {
  return await db.audio_files.reverse().sortBy('createdAt');
}
