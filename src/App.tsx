import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Download,
  Menu,
  Smartphone
} from 'lucide-react';

import type { FolderItem, AudioFileItem, StorageUsage } from './types/storage';
import type { PlayState, AudioSelection, EQSettings, FilterSettings, CompressorSettings, ExportSettings } from './types/audio';

import {
  initDatabase,
  db,
  createFolder,
  updateFolder,
  deleteFolder,
  saveAudioFile,
  deleteAudioFile,
  getAllAudioFiles
} from './db/database';

import {
  getStorageEstimate,
  generateWaveformPeaks,
  exportAllToZip,
  importFromZip,
  createDemoAudioFile
} from './db/storageUtils';

import { audioEngine } from './audio/AudioEngine';
import * as BufferUtils from './audio/BufferUtils';
import { EffectsChain } from './audio/EffectsChain';
import { exportAudio, triggerDownload } from './audio/encoders/ExportManager';

import { FileManager } from './components/file-manager/FileManager';
import { WaveformCanvas } from './components/editor/WaveformCanvas';
import { TimeRuler } from './components/editor/TimeRuler';
import { MiniMap } from './components/editor/MiniMap';
import { TransportBar } from './components/editor/TransportBar';
import { ToolPalette } from './components/editor/ToolPalette';
import { SelectionInfo } from './components/editor/SelectionInfo';

import { RecordModal } from './components/recorder/RecordModal';
import { EffectsModal } from './components/modals/EffectsModal';
import { ExportModal } from './components/modals/ExportModal';
import { GainModal } from './components/modals/GainModal';
import { SilenceModal } from './components/modals/SilenceModal';
import { PwaInstallModal } from './components/modals/PwaInstallModal';
import { ToastProvider, useToast } from './components/common/Toast';

export function AudioStudioApp() {
  const { showToast } = useToast();

  // Storage and DB State
  const [folders, setFolders] = useState<FolderItem[]>([]);
  const [files, setFiles] = useState<AudioFileItem[]>([]);
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null);
  const [activeFileId, setActiveFileId] = useState<string | null>(null);
  const [storageUsage, setStorageUsage] = useState<StorageUsage | null>(null);

  // Editor and Playback State
  const [currentBuffer, setCurrentBuffer] = useState<AudioBuffer | null>(null);
  const [currentFileName, setCurrentFileName] = useState<string>('Audio Track');
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [playState, setPlayState] = useState<PlayState>('idle');
  const [selection, setSelection] = useState<AudioSelection | null>(null);
  const [isLooping, setIsLooping] = useState<boolean>(false);
  const [volume, setVolume] = useState<number>(1.0);
  const [canUndo, setCanUndo] = useState<boolean>(false);
  const [canRedo, setCanRedo] = useState<boolean>(false);

  // Canvas Viewport & Zoom State
  const [zoom, setZoom] = useState<number>(100); // pixels per second
  const [scrollLeft, setScrollLeft] = useState<number>(0);
  const [canvasDimensions, setCanvasDimensions] = useState<{ width: number; height: number }>({ width: 800, height: 260 });
  const [interactionMode, setInteractionMode] = useState<'select' | 'pan'>('select');
  const canvasContainerRef = useRef<HTMLDivElement>(null);

  // Responsive UI & Modals State
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(false);
  const [recordModalOpen, setRecordModalOpen] = useState<boolean>(false);
  const [effectsModalOpen, setEffectsModalOpen] = useState<boolean>(false);
  const [exportModalOpen, setExportModalOpen] = useState<boolean>(false);
  const [gainModalOpen, setGainModalOpen] = useState<boolean>(false);
  const [silenceModalOpen, setSilenceModalOpen] = useState<boolean>(false);
  const [pwaModalOpen, setPwaModalOpen] = useState<boolean>(false);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);

  // PWA Install Prompt Listener
  useEffect(() => {
    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
  }, []);

  // Update Canvas Dimensions on Resize using ResizeObserver
  useEffect(() => {
    if (!canvasContainerRef.current) return;
    const container = canvasContainerRef.current;

    const updateFromRect = (width: number, height: number) => {
      if (width > 0 && height > 0) {
        setCanvasDimensions({ width: Math.round(width), height: Math.round(height) });
      }
    };

    updateFromRect(container.clientWidth, container.clientHeight);

    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        updateFromRect(width, height);
      }
    });

    ro.observe(container);
    return () => ro.disconnect();
  }, []);

  // Initialize Database & Seed Demo Audio
  const refreshStorage = useCallback(async () => {
    const usage = await getStorageEstimate();
    setStorageUsage(usage);
  }, []);

  const loadFileToEditor = async (fileItem: AudioFileItem) => {
    try {
      const audioCtx = audioEngine.getContext();
      const arrayBuffer = await fileItem.blob.arrayBuffer();
      const decodedBuffer = await audioCtx.decodeAudioData(arrayBuffer.slice(0));

      setActiveFileId(fileItem.id);
      setCurrentFileName(fileItem.name);
      setSelection(null);
      setScrollLeft(0);

      await audioEngine.loadBuffer(decodedBuffer, `Opened "${fileItem.name}"`);
      
      // Auto fit zoom to canvas width
      if (canvasDimensions.width > 0) {
        const fitZoom = Math.max(10, canvasDimensions.width / Math.max(1, decodedBuffer.duration));
        setZoom(fitZoom);
      }

      showToast(`Loaded "${fileItem.name}"`, 'success');
      if (window.innerWidth < 860) {
        setSidebarOpen(false);
      }
    } catch (err) {
      console.error(err);
      showToast('Error decoding audio file.', 'error');
    }
  };

  const loadData = useCallback(async () => {
    await initDatabase();
    const loadedFolders = await db.folders.toArray();
    setFolders(loadedFolders);

    let loadedFiles = await getAllAudioFiles();
    if (loadedFiles.length === 0) {
      // Create initial synthesizer demo
      const demo = await createDemoAudioFile();
      loadedFiles = [demo];
    }
    setFiles(loadedFiles);
    await refreshStorage();

    // Automatically load first audio file
    if (loadedFiles.length > 0 && !currentBuffer) {
      loadFileToEditor(loadedFiles[0]);
    }
  }, [refreshStorage, currentBuffer]);

  useEffect(() => {
    loadData();
  }, []);

  // Audio Engine Subscriptions
  useEffect(() => {
    const unsubTime = audioEngine.onTimeUpdate((time) => {
      setCurrentTime(time);
    });

    const unsubState = audioEngine.onStateChange((state) => {
      setPlayState(state);
    });

    const unsubBuffer = audioEngine.onBufferChange((buffer) => {
      setCurrentBuffer(buffer);
      setCanUndo(audioEngine.history.canUndo());
      setCanRedo(audioEngine.history.canRedo());
      if (buffer && canvasDimensions.width > 0) {
        // Fit zoom on initial buffer change if not yet zoomed
        setZoom(Math.max(10, canvasDimensions.width / Math.max(1, buffer.duration)));
      }
    });

    return () => {
      unsubTime();
      unsubState();
      unsubBuffer();
    };
  }, [canvasDimensions.width]);

  // Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName)) {
        return;
      }

      if (e.code === 'Space') {
        e.preventDefault();
        if (playState === 'playing') {
          audioEngine.pause();
        } else {
          audioEngine.play(currentTime, selection || undefined);
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          handleRedo();
        } else {
          handleUndo();
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        handleRedo();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        handleSelectAll();
      } else if (e.key === 'Escape') {
        setSelection(null);
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selection && selection.end > selection.start) {
          e.preventDefault();
          handleCut();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [playState, currentTime, selection]);

  // Playback Controls
  const handlePlay = () => {
    audioEngine.play(currentTime, selection || undefined);
  };

  const handlePause = () => {
    audioEngine.pause();
  };

  const handleStop = () => {
    audioEngine.stop();
    if (selection) {
      audioEngine.seek(selection.start);
    }
  };

  const handleSeek = (time: number) => {
    audioEngine.seek(time);
    setCurrentTime(time);
  };

  const handleToggleLoop = () => {
    const newLoop = !isLooping;
    setIsLooping(newLoop);
    audioEngine.setLoop(newLoop, selection || undefined);
  };

  const handleVolumeChange = (val: number) => {
    setVolume(val);
    audioEngine.setVolume(val);
  };

  // Undo / Redo
  const handleUndo = () => {
    if (audioEngine.undo()) {
      showToast('Undo', 'info');
    }
  };

  const handleRedo = () => {
    if (audioEngine.redo()) {
      showToast('Redo', 'info');
    }
  };

  // Zoom Controls
  const handleZoomIn = () => {
    const newZoom = Math.min(5000, zoom * 1.4);
    setZoom(newZoom);
  };

  const handleZoomOut = () => {
    const newZoom = Math.max(10, zoom / 1.4);
    setZoom(newZoom);
  };

  const handleZoomFit = () => {
    if (currentBuffer && canvasDimensions.width > 0) {
      const fitZoom = Math.max(10, canvasDimensions.width / currentBuffer.duration);
      setZoom(fitZoom);
      setScrollLeft(0);
    }
  };

  // Selection
  const handleSelectAll = () => {
    if (currentBuffer) {
      setSelection({ start: 0, end: currentBuffer.duration });
    }
  };

  const handleClearSelection = () => {
    setSelection(null);
  };

  // DSP Operations
  const handleTrim = () => {
    if (!currentBuffer || !selection || selection.end <= selection.start) return;
    const ctx = audioEngine.getContext();
    const newBuffer = BufferUtils.sliceBuffer(ctx, currentBuffer, selection.start, selection.end);
    audioEngine.setBufferDirectly(newBuffer, `Trim to ${selection.start.toFixed(2)}s - ${selection.end.toFixed(2)}s`);
    setSelection(null);
    setScrollLeft(0);
    showToast('Trimmed to selection', 'success');
  };

  const handleCut = () => {
    if (!currentBuffer || !selection || selection.end <= selection.start) return;
    const ctx = audioEngine.getContext();
    const newBuffer = BufferUtils.deleteRegion(ctx, currentBuffer, selection.start, selection.end);
    audioEngine.setBufferDirectly(newBuffer, `Cut ${selection.start.toFixed(2)}s - ${selection.end.toFixed(2)}s`);
    setSelection(null);
    showToast('Cut selected region', 'success');
  };

  const handleSilence = () => {
    if (!currentBuffer || !selection || selection.end <= selection.start) return;
    const ctx = audioEngine.getContext();
    const newBuffer = BufferUtils.muteRegion(ctx, currentBuffer, selection.start, selection.end);
    audioEngine.setBufferDirectly(newBuffer, `Silenced ${selection.start.toFixed(2)}s - ${selection.end.toFixed(2)}s`);
    showToast('Silenced selection', 'success');
  };

  const handleInsertSilence = (durationSec: number) => {
    if (!currentBuffer) return;
    const ctx = audioEngine.getContext();
    const newBuffer = BufferUtils.insertSilence(ctx, currentBuffer, currentTime, durationSec);
    audioEngine.setBufferDirectly(newBuffer, `Inserted ${durationSec}s silence`);
    showToast(`Inserted ${durationSec}s silence`, 'success');
  };

  const handleFadeIn = () => {
    if (!currentBuffer || !selection || selection.end <= selection.start) return;
    const ctx = audioEngine.getContext();
    const duration = selection.end - selection.start;
    const newBuffer = BufferUtils.applyFade(ctx, currentBuffer, selection.start, duration, 'in', 'linear');
    audioEngine.setBufferDirectly(newBuffer, `Fade In (${duration.toFixed(2)}s)`);
    showToast('Fade In applied', 'success');
  };

  const handleFadeOut = () => {
    if (!currentBuffer || !selection || selection.end <= selection.start) return;
    const ctx = audioEngine.getContext();
    const duration = selection.end - selection.start;
    const newBuffer = BufferUtils.applyFade(ctx, currentBuffer, selection.start, duration, 'out', 'linear');
    audioEngine.setBufferDirectly(newBuffer, `Fade Out (${duration.toFixed(2)}s)`);
    showToast('Fade Out applied', 'success');
  };

  const handleApplyGain = (gainDb: number, target: 'selection' | 'all') => {
    if (!currentBuffer) return;
    const ctx = audioEngine.getContext();
    const startSec = target === 'selection' && selection ? selection.start : undefined;
    const endSec = target === 'selection' && selection ? selection.end : undefined;
    const newBuffer = BufferUtils.applyGain(ctx, currentBuffer, gainDb, startSec, endSec);
    audioEngine.setBufferDirectly(newBuffer, `Gain ${gainDb > 0 ? '+' : ''}${gainDb}dB`);
    showToast(`Applied ${gainDb > 0 ? '+' : ''}${gainDb}dB gain`, 'success');
  };

  const handleNormalize = (targetDb: number = 0) => {
    if (!currentBuffer) return;
    const ctx = audioEngine.getContext();
    const startSec = selection ? selection.start : undefined;
    const endSec = selection ? selection.end : undefined;
    const newBuffer = BufferUtils.normalizeBuffer(ctx, currentBuffer, targetDb, startSec, endSec);
    audioEngine.setBufferDirectly(newBuffer, `Normalize to ${targetDb}dBFS`);
    showToast(`Normalized to ${targetDb}dBFS`, 'success');
  };

  const handleReverse = () => {
    if (!currentBuffer) return;
    const ctx = audioEngine.getContext();
    const startSec = selection ? selection.start : undefined;
    const endSec = selection ? selection.end : undefined;
    const newBuffer = BufferUtils.reverseBuffer(ctx, currentBuffer, startSec, endSec);
    audioEngine.setBufferDirectly(newBuffer, 'Reverse audio');
    showToast('Reversed audio', 'success');
  };

  const handleInvert = () => {
    if (!currentBuffer) return;
    const ctx = audioEngine.getContext();
    const startSec = selection ? selection.start : undefined;
    const endSec = selection ? selection.end : undefined;
    const newBuffer = BufferUtils.invertPhase(ctx, currentBuffer, startSec, endSec);
    audioEngine.setBufferDirectly(newBuffer, 'Invert Phase');
    showToast('Phase inverted', 'success');
  };

  const handleSplit = async () => {
    if (!currentBuffer || currentTime <= 0 || currentTime >= currentBuffer.duration) {
      showToast('Position playhead within track to split', 'info');
      return;
    }
    const ctx = audioEngine.getContext();
    const part1 = BufferUtils.sliceBuffer(ctx, currentBuffer, 0, currentTime);
    const part2 = BufferUtils.sliceBuffer(ctx, currentBuffer, currentTime, currentBuffer.duration);

    const res = await exportAudio(part2, {
      format: 'wav',
      wavBitDepth: 16,
      mp3Bitrate: 192,
      sampleRate: part2.sampleRate,
      channels: part2.numberOfChannels as 1 | 2,
      exportScope: 'all',
      fileName: `${currentFileName} (Part 2)`
    }, null, ctx);

    await saveAudioFile({
      name: `${currentFileName} (Part 2)`,
      folderId: activeFolderId,
      duration: part2.duration,
      sampleRate: part2.sampleRate,
      numberOfChannels: part2.numberOfChannels,
      format: 'wav',
      size: res.blob.size,
      blob: res.blob,
      waveformPeaks: generateWaveformPeaks(part2, 64),
      tags: ['split']
    });

    audioEngine.setBufferDirectly(part1, `Split at ${currentTime.toFixed(2)}s`);
    setCurrentFileName(`${currentFileName} (Part 1)`);

    const updatedFiles = await getAllAudioFiles();
    setFiles(updatedFiles);
    await refreshStorage();
    showToast('Track split into two parts', 'success');
  };

  const handleApplyEffects = async (
    eq: EQSettings,
    filters: FilterSettings,
    comp: CompressorSettings,
    speed: number
  ) => {
    if (!currentBuffer) return;
    const newBuffer = await EffectsChain.renderEffects(currentBuffer, eq, filters, comp, speed);
    audioEngine.setBufferDirectly(newBuffer, 'Applied EQ & DSP Effects');
    showToast('Applied Studio DSP Effects', 'success');
  };

  const handleExport = async (settings: ExportSettings, destination: 'download' | 'library') => {
    if (!currentBuffer) return;
    const ctx = audioEngine.getContext();
    const result = await exportAudio(currentBuffer, settings, selection, ctx);

    if (destination === 'download') {
      triggerDownload(result.blob, result.fileName);
      showToast(`Exported ${result.fileName}`, 'success');
    } else {
      const targetBuffer = settings.exportScope === 'selection' && selection
        ? BufferUtils.sliceBuffer(ctx, currentBuffer, selection.start, selection.end)
        : currentBuffer;

      const peaks = generateWaveformPeaks(targetBuffer, 64);
      const saved = await saveAudioFile({
        name: settings.fileName,
        folderId: activeFolderId,
        duration: targetBuffer.duration,
        sampleRate: settings.sampleRate,
        numberOfChannels: settings.channels,
        format: settings.format,
        size: result.blob.size,
        blob: result.blob,
        waveformPeaks: peaks,
        tags: ['exported', settings.format]
      });

      const updatedFiles = await getAllAudioFiles();
      setFiles(updatedFiles);
      await refreshStorage();
      showToast(`Saved "${saved.name}" to Library`, 'success');
    }
  };

  const handleSaveRecording = async (buffer: AudioBuffer, fileName: string, action: 'editor' | 'library') => {
    const ctx = audioEngine.getContext();
    const res = await exportAudio(buffer, {
      format: 'wav',
      wavBitDepth: 16,
      mp3Bitrate: 192,
      sampleRate: buffer.sampleRate,
      channels: buffer.numberOfChannels as 1 | 2,
      exportScope: 'all',
      fileName
    }, null, ctx);

    const peaks = generateWaveformPeaks(buffer, 64);
    const saved = await saveAudioFile({
      name: fileName,
      folderId: 'recordings',
      duration: buffer.duration,
      sampleRate: buffer.sampleRate,
      numberOfChannels: buffer.numberOfChannels,
      format: 'wav',
      size: res.blob.size,
      blob: res.blob,
      waveformPeaks: peaks,
      tags: ['recording', 'mic']
    });

    const updatedFiles = await getAllAudioFiles();
    setFiles(updatedFiles);
    await refreshStorage();

    if (action === 'editor') {
      setActiveFileId(saved.id);
      setCurrentFileName(saved.name);
      await audioEngine.loadBuffer(buffer, `Recorded "${fileName}"`);
      showToast(`Loaded recording "${fileName}"`, 'success');
    } else {
      showToast(`Saved recording "${fileName}" to Recordings`, 'success');
    }
  };

  const handleImportFiles = async (fileList: FileList | File[]) => {
    const tempAudioCtx = audioEngine.getContext();
    let imported = 0;

    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];

      if (file.name.endsWith('.zip')) {
        const res = await importFromZip(file);
        imported += res.importedCount;
        continue;
      }

      try {
        const arrayBuf = await file.arrayBuffer();
        const decoded = await tempAudioCtx.decodeAudioData(arrayBuf.slice(0));
        const nameParts = file.name.split('.');
        const format = nameParts.length > 1 ? nameParts.pop()!.toLowerCase() : 'wav';
        const name = nameParts.join('.');
        const peaks = generateWaveformPeaks(decoded, 64);

        const saved = await saveAudioFile({
          name,
          folderId: activeFolderId,
          duration: decoded.duration,
          sampleRate: decoded.sampleRate,
          numberOfChannels: decoded.numberOfChannels,
          format,
          size: file.size,
          blob: file,
          waveformPeaks: peaks,
          tags: ['imported']
        });

        if (i === 0 && fileList.length === 1) {
          loadFileToEditor(saved);
        }
        imported++;
      } catch (err) {
        console.warn('Failed to decode file:', file.name, err);
      }
    }

    const updatedFolders = await db.folders.toArray();
    setFolders(updatedFolders);
    const updatedFiles = await getAllAudioFiles();
    setFiles(updatedFiles);
    await refreshStorage();
    showToast(`Imported ${imported} audio file(s)`, 'success');
  };

  const handleCreateFolder = async (name: string, color?: string) => {
    await createFolder(name, null, color);
    const updated = await db.folders.toArray();
    setFolders(updated);
    showToast(`Folder "${name}" created`, 'success');
  };

  const handleRenameFolder = async (id: string, newName: string) => {
    await updateFolder(id, { name: newName });
    const updated = await db.folders.toArray();
    setFolders(updated);
    showToast('Folder renamed', 'success');
  };

  const handleDeleteFolder = async (id: string) => {
    await deleteFolder(id);
    const updated = await db.folders.toArray();
    setFolders(updated);
    if (activeFolderId === id) setActiveFolderId(null);
    showToast('Folder deleted', 'info');
  };

  const handleDeleteFile = async (id: string) => {
    await deleteAudioFile(id);
    const updated = await getAllAudioFiles();
    setFiles(updated);
    if (activeFileId === id) {
      setActiveFileId(null);
    }
    await refreshStorage();
    showToast('File deleted', 'info');
  };

  const handleExportZip = async () => {
    showToast('Generating .ZIP backup archive...', 'info');
    const zipBlob = await exportAllToZip();
    triggerDownload(zipBlob, `audiocraft_backup_${new Date().toISOString().slice(0, 10)}.zip`);
    showToast('Backup .ZIP downloaded', 'success');
  };

  const duration = currentBuffer ? currentBuffer.duration : 0;
  const viewportStart = Math.max(0, scrollLeft / zoom);
  const viewportEnd = Math.min(duration, (scrollLeft + canvasDimensions.width) / zoom);

  return (
    <div className="app-container">
      {/* Top Header */}
      <header className="top-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <button
            className="btn btn-ghost btn-icon-sm"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            title="Toggle File Library"
          >
            <Menu size={18} />
          </button>

          <a href="#" className="brand-logo" onClick={(e) => e.preventDefault()}>
            <svg viewBox="0 0 64 64">
              <rect width="64" height="64" rx="14" fill="#161e2e" />
              <rect x="12" y="24" width="5" height="16" rx="2" fill="#00f0ff" />
              <rect x="21" y="16" width="5" height="32" rx="2" fill="#38bdf8" />
              <rect x="30" y="8" width="5" height="48" rx="2" fill="#60a5fa" />
              <rect x="39" y="14" width="5" height="36" rx="2" fill="#818cf8" />
              <rect x="48" y="22" width="5" height="20" rx="2" fill="#a78bfa" />
            </svg>
            <span className="brand-title-text">AudioCraft</span>
          </a>

          <span className="brand-badge">PWA</span>
        </div>

        {/* Current Active Track Header */}
        <div className="track-header-display">
          <span className="track-prefix-label" style={{ color: 'var(--text-muted)' }}>Track:</span>
          <span>{currentFileName}</span>
        </div>

        {/* Header Action Buttons */}
        <div className="header-actions">
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => setPwaModalOpen(true)}
            title="Install PWA to Home Screen"
          >
            <Smartphone size={14} color="var(--accent-cyan)" />
            <span className="btn-text-desktop">Install</span>
          </button>

          <button
            className="btn btn-primary btn-sm"
            onClick={() => setExportModalOpen(true)}
            disabled={!currentBuffer}
            title="Export / Convert Audio (WAV, MP3, FLAC, OGG)"
          >
            <Download size={14} />
            <span>Export</span>
          </button>
        </div>
      </header>

      {/* Main Studio Body: Split View (Sidebar + Waveform Editor) */}
      <div className="main-content">
        {/* Mobile Backdrop for Sidebar Drawer */}
        {sidebarOpen && (
          <div
            className="backdrop"
            style={{ zIndex: 30, background: 'rgba(0, 0, 0, 0.6)' }}
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* File Manager Sidebar */}
        <aside className={`sidebar-panel ${sidebarOpen ? 'open' : ''}`}>
          <FileManager
            folders={folders}
            files={files}
            activeFileId={activeFileId}
            storageUsage={storageUsage}
            activeFolderId={activeFolderId}
            onSelectFolder={setActiveFolderId}
            onCreateFolder={handleCreateFolder}
            onRenameFolder={handleRenameFolder}
            onDeleteFolder={handleDeleteFolder}
            onLoadFileToEditor={loadFileToEditor}
            onDeleteFile={handleDeleteFile}
            onImportFiles={handleImportFiles}
            onExportZip={handleExportZip}
            onCloseSidebar={() => setSidebarOpen(false)}
          />
        </aside>

        {/* Main Waveform Workspace */}
        <main className="editor-panel">
          {/* DSP Editing Tool Palette */}
          <ToolPalette
            hasSelection={Boolean(selection && selection.end > selection.start)}
            onTrim={handleTrim}
            onCut={handleCut}
            onSilence={handleSilence}
            onInsertSilence={() => setSilenceModalOpen(true)}
            onFadeIn={handleFadeIn}
            onFadeOut={handleFadeOut}
            onGainModal={() => setGainModalOpen(true)}
            onNormalize={() => handleNormalize(0)}
            onReverse={handleReverse}
            onInvert={handleInvert}
            onSplit={handleSplit}
            onOpenEffects={() => setEffectsModalOpen(true)}
          />

          {/* MiniMap Overview */}
          <MiniMap
            buffer={currentBuffer}
            duration={duration}
            currentTime={currentTime}
            viewportStart={viewportStart}
            viewportEnd={viewportEnd}
            width={canvasDimensions.width}
            onSeekViewport={(newStart) => setScrollLeft(newStart * zoom)}
          />

          {/* Time Ruler */}
          <TimeRuler
            duration={duration}
            zoom={zoom}
            scrollLeft={scrollLeft}
            width={canvasDimensions.width}
          />

          {/* Main 60fps Waveform Canvas */}
          <div ref={canvasContainerRef} className="waveform-workspace">
            <WaveformCanvas
              buffer={currentBuffer}
              currentTime={currentTime}
              selection={selection}
              zoom={zoom}
              scrollLeft={scrollLeft}
              width={canvasDimensions.width}
              height={canvasDimensions.height}
              interactionMode={interactionMode}
              onInteractionModeChange={setInteractionMode}
              onSeek={handleSeek}
              onSelectRegion={setSelection}
              onZoomChange={setZoom}
              onScrollChange={setScrollLeft}
            />
          </div>

          {/* Selection Timecode & Quick Action Bar */}
          <SelectionInfo
            selection={selection}
            duration={duration}
            isLooping={isLooping}
            onSelectAll={handleSelectAll}
            onClearSelection={handleClearSelection}
            onToggleLoop={handleToggleLoop}
            onTrim={handleTrim}
            onCut={handleCut}
          />

          {/* Bottom Studio Transport Bar */}
          <TransportBar
            playState={playState}
            currentTime={currentTime}
            duration={duration}
            canUndo={canUndo}
            canRedo={canRedo}
            volume={volume}
            onPlay={handlePlay}
            onPause={handlePause}
            onStop={handleStop}
            onOpenRecord={() => setRecordModalOpen(true)}
            onUndo={handleUndo}
            onRedo={handleRedo}
            onZoomIn={handleZoomIn}
            onZoomOut={handleZoomOut}
            onZoomFit={handleZoomFit}
            onVolumeChange={handleVolumeChange}
          />
        </main>
      </div>

      {/* Modals Suite */}
      <RecordModal
        isOpen={recordModalOpen}
        onClose={() => setRecordModalOpen(false)}
        onSaveRecording={handleSaveRecording}
      />

      <EffectsModal
        isOpen={effectsModalOpen}
        onClose={() => setEffectsModalOpen(false)}
        onApplyEffects={handleApplyEffects}
      />

      <ExportModal
        isOpen={exportModalOpen}
        onClose={() => setExportModalOpen(false)}
        selection={selection}
        currentFileName={currentFileName}
        onExport={handleExport}
      />

      <GainModal
        isOpen={gainModalOpen}
        onClose={() => setGainModalOpen(false)}
        hasSelection={Boolean(selection && selection.end > selection.start)}
        onApplyGain={handleApplyGain}
      />

      <SilenceModal
        isOpen={silenceModalOpen}
        onClose={() => setSilenceModalOpen(false)}
        onInsertSilence={handleInsertSilence}
      />

      <PwaInstallModal
        isOpen={pwaModalOpen}
        onClose={() => setPwaModalOpen(false)}
        deferredPrompt={deferredPrompt}
        onPromptInstall={() => {
          if (deferredPrompt) {
            deferredPrompt.prompt();
            deferredPrompt.userChoice.then(() => setDeferredPrompt(null));
          }
        }}
      />
    </div>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <AudioStudioApp />
    </ToastProvider>
  );
}
