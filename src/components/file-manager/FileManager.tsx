import React, { useState, useRef } from 'react';
import { Search, Folder, X } from 'lucide-react';
import type { FolderItem, AudioFileItem, StorageUsage } from '../../types/storage';
import { FolderTree } from './FolderTree';
import { FileList } from './FileList';
import { StorageMeter } from './StorageMeter';
import { SUPPORTED_UPLOAD_ACCEPT, SUPPORTED_FORMATS_SUMMARY } from '../../audio/audioFormats';

export interface FileManagerProps {
  folders: FolderItem[];
  files: AudioFileItem[];
  activeFileId: string | null;
  storageUsage: StorageUsage | null;
  onSelectFolder: (id: string | null) => void;
  activeFolderId: string | null;
  onCreateFolder: (name: string, color?: string) => Promise<void>;
  onRenameFolder: (id: string, newName: string) => Promise<void>;
  onDeleteFolder: (id: string) => Promise<void>;
  onLoadFileToEditor: (file: AudioFileItem) => void;
  onDeleteFile: (id: string) => void;
  onImportFiles: (files: FileList | File[]) => void;
  onExportZip: () => void;
  onCloseSidebar?: () => void;
}

export const FileManager: React.FC<FileManagerProps> = React.memo(({
  folders,
  files,
  activeFileId,
  storageUsage,
  onSelectFolder,
  activeFolderId,
  onCreateFolder,
  onRenameFolder,
  onDeleteFolder,
  onLoadFileToEditor,
  onDeleteFile,
  onImportFiles,
  onExportZip,
  onCloseSidebar
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Filter files by folder and search
  const filteredFiles = files.filter((f) => {
    const matchesFolder = activeFolderId === null || f.folderId === activeFolderId;
    const matchesSearch =
      !searchQuery.trim() ||
      f.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (f.tags && f.tags.some(t => t.toLowerCase().includes(searchQuery.toLowerCase())));
    return matchesFolder && matchesSearch;
  });

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      onImportFiles(e.dataTransfer.files);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onImportFiles(e.target.files);
      e.target.value = '';
    }
  };

  const activeFolderName = activeFolderId
    ? folders.find(f => f.id === activeFolderId)?.name || 'Folder'
    : 'All Audio Files';

  return (
    <div
      className="file-manager"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      style={{
        outline: isDragOver ? '2px dashed var(--accent-cyan)' : 'none',
        outlineOffset: -2
      }}
    >
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileInputChange}
        multiple
        accept={SUPPORTED_UPLOAD_ACCEPT}
        title={`Supported audio formats: ${SUPPORTED_FORMATS_SUMMARY}`}
        style={{ display: 'none' }}
      />

      {/* Header */}
      <div className="fm-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600 }}>
          <Folder size={16} color="var(--accent-cyan)" />
          <span>Library & Files</span>
        </div>
        {onCloseSidebar && (
          <button className="btn btn-ghost btn-icon-sm" onClick={onCloseSidebar}>
            <X size={16} />
          </button>
        )}
      </div>

      {/* Search Bar */}
      <div className="fm-search-bar">
        <Search size={14} color="var(--text-muted)" />
        <input
          type="text"
          className="fm-search-input"
          placeholder="Search tracks or tags..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        {searchQuery && (
          <button className="btn-ghost" onClick={() => setSearchQuery('')} style={{ padding: 2 }}>
            <X size={12} />
          </button>
        )}
      </div>

      {/* Scrollable Content */}
      <div className="fm-content">
        <FolderTree
          folders={folders}
          activeFolderId={activeFolderId}
          onSelectFolder={onSelectFolder}
          onCreateFolder={onCreateFolder}
          onRenameFolder={onRenameFolder}
          onDeleteFolder={onDeleteFolder}
        />

        <div style={{ marginTop: 8 }}>
          <div className="folder-section-title">
            <span>{activeFolderName} ({filteredFiles.length})</span>
          </div>

          <FileList
            files={filteredFiles}
            activeFileId={activeFileId}
            onLoadFileToEditor={onLoadFileToEditor}
            onDeleteFile={onDeleteFile}
          />
        </div>
      </div>

      {/* Storage Footer */}
      <StorageMeter
        usage={storageUsage}
        onExportZip={onExportZip}
        onImportClick={() => fileInputRef.current?.click()}
      />
    </div>
  );
});
FileManager.displayName = 'FileManager';
