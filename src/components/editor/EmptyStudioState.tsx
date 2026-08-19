import React, { useRef, useState } from 'react';
import {
  UploadCloud,
  Mic,
  Radio,
  FolderOpen,
  Sparkles,
  Music,
  ArrowRight,
  Plus
} from 'lucide-react';
import type { AudioFileItem } from '../../types/storage';
import { SUPPORTED_UPLOAD_ACCEPT, SUPPORTED_FORMATS_SUMMARY } from '../../audio/audioFormats';

export interface EmptyStudioStateProps {
  onImportFiles: (files: FileList | File[]) => void;
  onLoadFileToEditor: (file: AudioFileItem) => void;
  onOpenRecord?: () => void;
  onOpenGenerator?: () => void;
  onOpenLibrary?: () => void;
  libraryFiles?: AudioFileItem[];
}

export const EmptyStudioState: React.FC<EmptyStudioStateProps> = ({
  onImportFiles,
  onLoadFileToEditor,
  onOpenRecord,
  onOpenGenerator,
  onOpenLibrary,
  libraryFiles = []
}) => {
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
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

  const formatDuration = (sec: number): string => {
    if (!sec || isNaN(sec)) return '0:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const popularFormats = ['WAV', 'MP3', 'FLAC', 'AAC', 'M4A', 'OGG', 'WEBM', 'ZIP'];

  return (
    <div className="empty-studio-container">
      {/* Hidden File Input for full system picker */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileInputChange}
        multiple
        accept={SUPPORTED_UPLOAD_ACCEPT}
        title={`Supported audio formats: ${SUPPORTED_FORMATS_SUMMARY}`}
        style={{ display: 'none' }}
      />

      <div
        className={`empty-dropzone-card ${isDragOver ? 'drag-over' : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            fileInputRef.current?.click();
          }
        }}
        title="Click to browse or drop audio files"
      >
        <div className="empty-icon-halo">
          <UploadCloud size={32} className="empty-upload-icon" />
        </div>

        <div className="empty-card-headings">
          <h2 className="empty-card-title">
            {isDragOver ? 'Drop Audio File to Load' : 'Load Audio to Start Editing'}
          </h2>
          <p className="empty-card-desc">
            Drag and drop your audio files here, or click to browse from your device
          </p>
        </div>

        {/* Primary Action Button */}
        <button
          type="button"
          className="btn btn-primary btn-md empty-browse-btn"
          onClick={(e) => {
            e.stopPropagation();
            fileInputRef.current?.click();
          }}
        >
          <FolderOpen size={16} />
          <span>Choose Audio File</span>
        </button>

        {/* Format Badge Pills */}
        <div className="empty-formats-row" onClick={(e) => e.stopPropagation()}>
          <span className="empty-formats-label">Supports:</span>
          {popularFormats.map((fmt) => (
            <span key={fmt} className="empty-format-pill">
              {fmt}
            </span>
          ))}
        </div>

        {/* Processing & Capacity Limits Hint */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            fontSize: 'calc(10.5px * var(--ui-font-scale, 1))',
            color: 'var(--text-muted)',
            marginTop: 3
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <span style={{ color: 'var(--accent-cyan)', fontWeight: 600 }}>⚡</span>
          <span>In-browser processing • No file size limits (≤ 60 min/file recommended for RAM)</span>
        </div>
      </div>

      {/* Quick Action Hub: Record, Generator, Library */}
      <div className="empty-actions-toolbar">
        {onOpenRecord && (
          <button
            type="button"
            className="btn btn-secondary btn-sm empty-action-btn"
            onClick={onOpenRecord}
            title="Record audio directly from your microphone"
          >
            <div className="record-dot-indicator" />
            <Mic size={14} color="var(--accent-rose)" />
            <span>Record Mic</span>
          </button>
        )}

        {onOpenGenerator && (
          <button
            type="button"
            className="btn btn-secondary btn-sm empty-action-btn"
            onClick={onOpenGenerator}
            title="Generate test tones, sine waves, or noise signals"
          >
            <Radio size={14} color="var(--accent-cyan)" />
            <span>Synth Generator</span>
          </button>
        )}

        {onOpenLibrary && (
          <button
            type="button"
            className="btn btn-secondary btn-sm empty-action-btn"
            onClick={onOpenLibrary}
            title="Open the Studio File Library"
          >
            <FolderOpen size={14} color="var(--accent-amber)" />
            <span>Open Library</span>
          </button>
        )}
      </div>

      {/* Quick Load From Library / Demo Track Section */}
      {libraryFiles && libraryFiles.length > 0 && (
        <div className="empty-library-quick-section">
          <div className="empty-library-header">
            <span className="empty-library-title">
              <Sparkles size={13} color="var(--accent-cyan)" />
              <span>Quick Load from Studio Library:</span>
            </span>
          </div>

          <div className="empty-library-chips">
            {libraryFiles.slice(0, 4).map((file) => {
              const isDemo = file.name.toLowerCase().includes('demo') || (file.tags && file.tags.includes('synth-demo'));
              return (
                <button
                  key={file.id}
                  type="button"
                  className={`empty-track-chip ${isDemo ? 'demo-chip' : ''}`}
                  onClick={() => onLoadFileToEditor(file)}
                  title={`Click to load "${file.name}" into editor`}
                >
                  <div className="chip-icon-box">
                    <Music size={13} color={isDemo ? 'var(--accent-cyan)' : 'var(--text-secondary)'} />
                  </div>
                  <span className="chip-name">{file.name}</span>
                  <span className="chip-meta">{formatDuration(file.duration)}</span>
                  <span className="chip-tag">{file.format.toUpperCase()}</span>
                  <ArrowRight size={12} className="chip-arrow" />
                </button>
              );
            })}

            {libraryFiles.length > 4 && onOpenLibrary && (
              <button
                type="button"
                className="empty-track-chip-more"
                onClick={onOpenLibrary}
                title="View all tracks in library"
              >
                <Plus size={12} />
                <span>{libraryFiles.length - 4} more in library</span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
