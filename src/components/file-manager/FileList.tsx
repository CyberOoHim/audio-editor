import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, Trash2, Download, ExternalLink, Music, Clock } from 'lucide-react';
import type { AudioFileItem } from '../../types/storage';
import { formatBytes } from '../../db/storageUtils';

export interface FileListProps {
  files: AudioFileItem[];
  activeFileId: string | null;
  onLoadFileToEditor: (file: AudioFileItem) => void;
  onDeleteFile: (id: string) => void;
}

export const FileList: React.FC<FileListProps> = ({
  files,
  activeFileId,
  onLoadFileToEditor,
  onDeleteFile
}) => {
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [audioEl, setAudioEl] = useState<HTMLAudioElement | null>(null);
  const activeUrlRef = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      if (audioEl) {
        audioEl.pause();
      }
      if (activeUrlRef.current) {
        URL.revokeObjectURL(activeUrlRef.current);
        activeUrlRef.current = null;
      }
    };
  }, [audioEl]);

  const formatDuration = (sec: number): string => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const handleTogglePreview = (e: React.MouseEvent, file: AudioFileItem) => {
    e.stopPropagation();

    if (playingId === file.id && audioEl) {
      audioEl.pause();
      if (activeUrlRef.current) {
        URL.revokeObjectURL(activeUrlRef.current);
        activeUrlRef.current = null;
      }
      setPlayingId(null);
      setAudioEl(null);
      return;
    }

    if (audioEl) {
      audioEl.pause();
    }
    if (activeUrlRef.current) {
      URL.revokeObjectURL(activeUrlRef.current);
      activeUrlRef.current = null;
    }

    const url = URL.createObjectURL(file.blob);
    activeUrlRef.current = url;
    const audio = new Audio(url);
    audio.play().catch(() => {});
    audio.onended = () => {
      setPlayingId(null);
      setAudioEl(null);
      if (activeUrlRef.current === url) {
        URL.revokeObjectURL(url);
        activeUrlRef.current = null;
      }
    };

    setAudioEl(audio);
    setPlayingId(file.id);
  };

  const handleDownload = (e: React.MouseEvent, file: AudioFileItem) => {
    e.stopPropagation();
    const url = URL.createObjectURL(file.blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${file.name}.${file.format}`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);
  };

  if (files.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '32px 16px', color: 'var(--text-muted)' }}>
        <Music size={32} style={{ margin: '0 auto 12px', opacity: 0.4 }} />
        <p style={{ fontSize: 'var(--font-base)', marginBottom: 4 }}>No audio files in this folder</p>
        <p style={{ fontSize: 'var(--font-sm)' }}>Drag and drop audio files here or record a sample</p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {files.map((file) => {
        const isCurrentEditor = activeFileId === file.id;
        const isPreviewing = playingId === file.id;

        return (
          <div
            key={file.id}
            className={`audio-card ${isCurrentEditor ? 'active' : ''}`}
            onClick={() => onLoadFileToEditor(file)}
          >
            <div className="audio-card-top">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                <button
                  className="btn btn-secondary btn-icon-sm"
                  onClick={(e) => handleTogglePreview(e, file)}
                  title={isPreviewing ? 'Pause Preview' : 'Play Preview'}
                  style={{
                    backgroundColor: isPreviewing ? 'var(--accent-cyan)' : 'var(--bg-input)',
                    color: isPreviewing ? '#040810' : 'var(--text-primary)'
                  }}
                >
                  {isPreviewing ? <Pause size={13} /> : <Play size={13} />}
                </button>
                <div className="audio-title" title={file.name}>
                  {file.name}
                </div>
              </div>

              <div style={{ display: 'flex', gap: 4 }}>
                <button
                  className="btn btn-ghost btn-icon-sm"
                  onClick={(e) => handleDownload(e, file)}
                  title="Download File"
                >
                  <Download size={13} />
                </button>
                <button
                  className="btn btn-ghost btn-icon-sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteFile(file.id);
                  }}
                  title="Delete File"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </div>

            {/* Mini Waveform Peaks */}
            {file.waveformPeaks && file.waveformPeaks.length > 0 && (
              <div className="mini-peaks-container">
                {file.waveformPeaks.slice(0, 48).map((peak, idx) => (
                  <div
                    key={idx}
                    className="mini-peak-bar"
                    style={{
                      height: `${Math.max(10, peak * 100)}%`,
                      opacity: isCurrentEditor ? 1 : 0.6
                    }}
                  />
                ))}
              </div>
            )}

            {/* Metadata Footer */}
            <div className="audio-card-meta">
              <span className="format-badge">{file.format}</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                <Clock size={11} /> {formatDuration(file.duration)}
              </span>
              <span>{formatBytes(file.size)}</span>
              <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 2, color: 'var(--accent-cyan)' }}>
                <ExternalLink size={11} /> Edit
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
};
