import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, Trash2, Download, ExternalLink, Music, Clock } from 'lucide-react';
import type { AudioFileItem } from '../../types/storage';
import { formatBytes } from '../../db/storageUtils';
import { audioEngine } from '../../audio/AudioEngine';

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
  const [playbackProgress, setPlaybackProgress] = useState<number>(0);

  // References for Web Audio preview
  const currentSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const currentGainRef = useRef<GainNode | null>(null);
  const playRequestRef = useRef<string | null>(null);
  const bufferCacheRef = useRef<Map<string, AudioBuffer>>(new Map());
  const animFrameRef = useRef<number | null>(null);
  const playbackDurationRef = useRef<number>(0);

  // Stop any active preview playback and progress animation
  const stopPreview = () => {
    playRequestRef.current = null;

    if (animFrameRef.current !== null) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }

    if (currentSourceRef.current) {
      try {
        currentSourceRef.current.onended = null;
        currentSourceRef.current.stop();
        currentSourceRef.current.disconnect();
      } catch {
        // Already stopped or disconnected
      }
      currentSourceRef.current = null;
    }

    if (currentGainRef.current) {
      try {
        currentGainRef.current.disconnect();
      } catch {
        // Ignore
      }
      currentGainRef.current = null;
    }

    setPlayingId(null);
    setPlaybackProgress(0);
  };

  // Listen to main editor audio state changes -> stop preview if main editor starts playing
  useEffect(() => {
    const unsub = audioEngine.onStateChange((state) => {
      if (state === 'playing') {
        stopPreview();
      }
    });

    return () => {
      unsub();
      stopPreview();
    };
  }, []);

  const formatDuration = (sec: number): string => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const handleTogglePreview = async (e: React.MouseEvent, file: AudioFileItem) => {
    e.stopPropagation();

    // If already playing this file, stop it
    if (playingId === file.id) {
      stopPreview();
      return;
    }

    // Stop any existing preview
    stopPreview();

    // Set target request ID
    playRequestRef.current = file.id;
    setPlayingId(file.id);
    setPlaybackProgress(0);

    try {
      const ctx = audioEngine.getContext();
      if (ctx.state === 'suspended') {
        await ctx.resume();
      }

      // If main editor is playing, pause it so they don't clash
      if (audioEngine.getPlayState() === 'playing') {
        audioEngine.pause();
      }

      // Check buffer cache or decode
      let buffer = bufferCacheRef.current.get(file.id);
      if (!buffer) {
        const arrayBuffer = await file.blob.arrayBuffer();
        if (playRequestRef.current !== file.id) return; // User switched or cancelled
        buffer = await ctx.decodeAudioData(arrayBuffer.slice(0));
        if (playRequestRef.current !== file.id) return;
        bufferCacheRef.current.set(file.id, buffer);
      }

      if (playRequestRef.current !== file.id) return;

      const source = ctx.createBufferSource();
      source.buffer = buffer;

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.9, ctx.currentTime);

      source.connect(gain);
      gain.connect(ctx.destination);

      currentSourceRef.current = source;
      currentGainRef.current = gain;

      const duration = buffer.duration;
      playbackDurationRef.current = duration;
      const startCtxTime = ctx.currentTime;

      // Handle playback completion
      source.onended = () => {
        if (playRequestRef.current === file.id) {
          stopPreview();
        }
      };

      // Progress animation loop
      const tick = () => {
        if (playRequestRef.current === file.id && duration > 0) {
          const elapsed = ctx.currentTime - startCtxTime;
          const prog = Math.min(1, Math.max(0, elapsed / duration));
          setPlaybackProgress(prog);

          if (prog < 1) {
            animFrameRef.current = requestAnimationFrame(tick);
          }
        }
      };

      source.start(0);
      animFrameRef.current = requestAnimationFrame(tick);
    } catch (err) {
      console.error('Preview error:', err);
      if (playRequestRef.current === file.id) {
        stopPreview();
      }
    }
  };

  const handleLoad = (file: AudioFileItem) => {
    stopPreview();
    onLoadFileToEditor(file);
  };

  const handleDelete = (e: React.MouseEvent, fileId: string) => {
    e.stopPropagation();
    if (playingId === fileId) {
      stopPreview();
    }
    bufferCacheRef.current.delete(fileId);
    onDeleteFile(fileId);
  };

  const handleDownload = (e: React.MouseEvent, file: AudioFileItem) => {
    e.stopPropagation();
    const url = URL.createObjectURL(file.blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.name.includes('.') ? file.name : `${file.name}.${file.format}`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 500);
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
            onClick={() => handleLoad(file)}
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
                  onClick={(e) => handleDelete(e, file.id)}
                  title="Delete File"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </div>

            {/* Mini Waveform Peaks */}
            {file.waveformPeaks && file.waveformPeaks.length > 0 && (
              <div className="mini-peaks-container">
                {file.waveformPeaks.slice(0, 48).map((peak, idx, arr) => {
                  const barProgress = idx / arr.length;
                  const isPlayed = isPreviewing && barProgress <= playbackProgress;

                  return (
                    <div
                      key={idx}
                      className="mini-peak-bar"
                      style={{
                        height: `${Math.max(10, peak * 100)}%`,
                        backgroundColor: isPlayed
                          ? 'var(--accent-cyan)'
                          : isPreviewing
                            ? 'rgba(0, 240, 255, 0.25)'
                            : 'var(--accent-cyan)',
                        opacity: isCurrentEditor || isPreviewing ? (isPlayed ? 1 : 0.5) : 0.65,
                        transition: isPreviewing ? 'none' : 'opacity 0.2s ease'
                      }}
                    />
                  );
                })}
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
