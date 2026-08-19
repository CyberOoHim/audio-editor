import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Download,
  Menu,
  Smartphone,
  FolderOpen,
  X,
  FileX
} from 'lucide-react';

import type { FolderItem, AudioFileItem, StorageUsage } from './types/storage';
import type {
  PlayState,
  AudioSelection,
  EQSettings,
  FilterSettings,
  CompressorSettings,
  ExportSettings,
  FadeCurve,
  FadeType,
  FadePosition,
  TimeFormat,
  SignalGeneratorSettings
} from './types/audio';

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
import { isSupportedAudioFile, SUPPORTED_UPLOAD_ACCEPT } from './audio/audioFormats';

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
import { FadeModal } from './components/modals/FadeModal';
import { NormalizeModal } from './components/modals/NormalizeModal';
import { GeneratorModal } from './components/modals/GeneratorModal';
import { SetRangeModal } from './components/modals/SetRangeModal';
import { PwaInstallModal } from './components/modals/PwaInstallModal';
import { FontSizeAdjuster } from './components/common/FontSizeAdjuster';
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
  const [currentFileName, setCurrentFileName] = useState<string>('No file selected');
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [playState, setPlayState] = useState<PlayState>('idle');
  const [selection, setSelection] = useState<AudioSelection | null>(null);
  const [isLooping, setIsLooping] = useState<boolean>(false);
  const [volume, setVolume] = useState<number>(1.0);
  const [playbackRate, setPlaybackRate] = useState<number>(1.0);
  const [timeFormat, setTimeFormat] = useState<TimeFormat>('hms');
  const [canUndo, setCanUndo] = useState<boolean>(false);
  const [canRedo, setCanRedo] = useState<boolean>(false);

  // User Settable Envelope & Tool Defaults
  const [fadeInDuration, setFadeInDuration] = useState<number>(1.5);
  const [fadeOutDuration, setFadeOutDuration] = useState<number>(1.5);
  const [fadeCurve, setFadeCurve] = useState<FadeCurve>('linear');

  // Canvas Viewport & Zoom State
  const [zoom, setZoom] = useState<number>(100); // pixels per second
  const [scrollLeft, setScrollLeft] = useState<number>(0);
  const [canvasDimensions, setCanvasDimensions] = useState<{ width: number; height: number }>({ width: 800, height: 260 });
  const [interactionMode, setInteractionMode] = useState<'select' | 'pan'>('select');
  const canvasContainerRef = useRef<HTMLDivElement>(null);

  // Overall UI Text Font Size Scaling State
  const [fontScale, setFontScale] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('audiocraft_ui_font_scale');
      if (saved) {
        const parsed = parseFloat(saved);
        if (!isNaN(parsed) && parsed >= 0.75 && parsed <= 1.55) {
          return parsed;
        }
      }
    } catch {
      // ignore
    }
    return 1.0;
  });

  // Apply UI Font Scale to CSS Root Variable
  useEffect(() => {
    document.documentElement.style.setProperty('--ui-font-scale', fontScale.toString());
    try {
      localStorage.setItem('audiocraft_ui_font_scale', fontScale.toString());
    } catch {
      // ignore
    }
  }, [fontScale]);

  const handleDecreaseFont = () => {
    setFontScale((prev) => {
      const next = Math.max(0.8, Math.round((prev - 0.1) * 10) / 10);
      showToast(`UI scale: ${Math.round(next * 100)}%`, 'info');
      return next;
    });
  };

  const handleIncreaseFont = () => {
    setFontScale((prev) => {
      const next = Math.min(1.5, Math.round((prev + 0.1) * 10) / 10);
      showToast(`UI scale: ${Math.round(next * 100)}%`, 'info');
      return next;
    });
  };

  const handleResetFont = () => {
    setFontScale(1.0);
    showToast('UI scale: 100% (Default)', 'info');
  };

  // Responsive UI & Modals State
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(() => {
    return typeof window !== 'undefined' && window.innerWidth > 960;
  });
  const [recordModalOpen, setRecordModalOpen] = useState<boolean>(false);
  const [effectsModalOpen, setEffectsModalOpen] = useState<boolean>(false);
  const [exportModalOpen, setExportModalOpen] = useState<boolean>(false);
  const [gainModalOpen, setGainModalOpen] = useState<boolean>(false);
  const [silenceModalOpen, setSilenceModalOpen] = useState<boolean>(false);
  const [fadeModalOpen, setFadeModalOpen] = useState<boolean>(false);
  const [fadeModalInitialType, setFadeModalInitialType] = useState<FadeType>('in');
  const [normalizeModalOpen, setNormalizeModalOpen] = useState<boolean>(false);
  const [generatorModalOpen, setGeneratorModalOpen] = useState<boolean>(false);
  const [rangeModalOpen, setRangeModalOpen] = useState<boolean>(false);
  const [pwaModalOpen, setPwaModalOpen] = useState<boolean>(false);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isEditorDragOver, setIsEditorDragOver] = useState<boolean>(false);
  const headerFileInputRef = useRef<HTMLInputElement>(null);
  const sidebarTouchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);

  // PWA Install Prompt Listener
  useEffect(() => {
    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
  }, []);

  // Update Canvas Dimensions on Resize using ResizeObserver with integer change threshold
  useEffect(() => {
    if (!canvasContainerRef.current) return;
    const container = canvasContainerRef.current;

    const updateFromRect = (width: number, height: number) => {
      if (width > 0 && height > 0) {
        const roundedW = Math.round(width);
        const roundedH = Math.round(height);
        setCanvasDimensions((prev) => {
          if (prev.width === roundedW && prev.height === roundedH) return prev;
          return { width: roundedW, height: roundedH };
        });
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

  const loadFileToEditor = useCallback(async (fileItem: AudioFileItem, preDecodedBuffer?: AudioBuffer) => {
    try {
      let decodedBuffer = preDecodedBuffer;
      if (!decodedBuffer) {
        const audioCtx = audioEngine.getContext();
        const arrayBuffer = await fileItem.blob.arrayBuffer();
        decodedBuffer = await audioCtx.decodeAudioData(arrayBuffer.slice(0));
      }

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

      showToast(`Loaded: ${fileItem.name}`, 'success');
      if (window.innerWidth <= 960) {
        setSidebarOpen(false);
      }
    } catch (err) {
      console.error(err);
      showToast('Failed to decode audio', 'error');
    }
  }, [canvasDimensions.width, showToast]);

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
  }, [refreshStorage]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Audio Engine Subscriptions with throttled React state
  useEffect(() => {
    let lastTimeUpdate = 0;
    const unsubTime = audioEngine.onTimeUpdate((time) => {
      const now = performance.now();
      // Throttle React state updates to ~30fps for UI labels, while canvases render smoothly
      if (now - lastTimeUpdate >= 32 || time === 0) {
        lastTimeUpdate = now;
        setCurrentTime(time);
      }
    });

    const unsubState = audioEngine.onStateChange((state) => {
      setPlayState(state);
    });

    const unsubBuffer = audioEngine.onBufferChange((buffer) => {
      setCurrentBuffer(buffer);
      setCanUndo(audioEngine.history.canUndo());
      setCanRedo(audioEngine.history.canRedo());
    });

    return () => {
      unsubTime();
      unsubState();
      unsubBuffer();
    };
  }, []);

  // User activity tracker for Audio Engine Eco / Low-Power Mode
  useEffect(() => {
    let lastReport = 0;
    const handleActivity = () => {
      const now = Date.now();
      if (now - lastReport > 2000) {
        lastReport = now;
        audioEngine.reportUserActivity();
      }
    };

    window.addEventListener('pointerdown', handleActivity, { passive: true });
    window.addEventListener('pointermove', handleActivity, { passive: true });
    window.addEventListener('keydown', handleActivity, { passive: true });
    window.addEventListener('touchstart', handleActivity, { passive: true });

    return () => {
      window.removeEventListener('pointerdown', handleActivity);
      window.removeEventListener('pointermove', handleActivity);
      window.removeEventListener('keydown', handleActivity);
      window.removeEventListener('touchstart', handleActivity);
    };
  }, []);

  // Playback Controls
  const handlePlay = useCallback(() => {
    if (!currentBuffer) return;
    audioEngine.play(currentTime, selection || undefined);
  }, [currentBuffer, currentTime, selection]);

  const handlePause = useCallback(() => {
    audioEngine.pause();
  }, []);

  const handleStop = useCallback(() => {
    audioEngine.stop();
    if (selection) {
      audioEngine.seek(selection.start);
    }
  }, [selection]);

  const handleSeek = useCallback((time: number) => {
    audioEngine.seek(time);
    setCurrentTime(time);
  }, []);

  const handleToggleLoop = useCallback(() => {
    setIsLooping((prev) => {
      const newLoop = !prev;
      audioEngine.setLoop(newLoop, selection || undefined);
      return newLoop;
    });
  }, [selection]);

  const handleVolumeChange = useCallback((val: number) => {
    setVolume(val);
    audioEngine.setVolume(val);
  }, []);

  // Undo / Redo
  const handleUndo = useCallback(() => {
    if (audioEngine.undo()) {
      showToast('Undo', 'info');
    }
  }, [showToast]);

  const handleRedo = useCallback(() => {
    if (audioEngine.redo()) {
      showToast('Redo', 'info');
    }
  }, [showToast]);

  // Zoom Controls
  const handleZoomIn = useCallback(() => {
    setZoom((prev) => Math.min(5000, prev * 1.4));
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoom((prev) => Math.max(10, prev / 1.4));
  }, []);

  const handleZoomFit = useCallback(() => {
    if (currentBuffer && canvasDimensions.width > 0) {
      const fitZoom = Math.max(10, canvasDimensions.width / currentBuffer.duration);
      setZoom(fitZoom);
      setScrollLeft(0);
    }
  }, [currentBuffer, canvasDimensions.width]);

  // Selection
  const handleSelectAll = useCallback(() => {
    if (currentBuffer) {
      setSelection({ start: 0, end: currentBuffer.duration });
    }
  }, [currentBuffer]);

  const handleClearSelection = useCallback(() => {
    setSelection(null);
  }, []);

  // DSP Operations
  const handleTrim = useCallback(() => {
    if (!currentBuffer || !selection || selection.end <= selection.start) return;
    const ctx = audioEngine.getContext();
    const newBuffer = BufferUtils.sliceBuffer(ctx, currentBuffer, selection.start, selection.end);
    audioEngine.setBufferDirectly(newBuffer, `Trim to ${selection.start.toFixed(2)}s - ${selection.end.toFixed(2)}s`);
    setSelection(null);
    setScrollLeft(0);
    showToast('Trimmed to selection', 'success');
  }, [currentBuffer, selection, showToast]);

  const handleCut = useCallback(() => {
    if (!currentBuffer || !selection || selection.end <= selection.start) return;
    const ctx = audioEngine.getContext();
    const newBuffer = BufferUtils.deleteRegion(ctx, currentBuffer, selection.start, selection.end);
    audioEngine.setBufferDirectly(newBuffer, `Cut ${selection.start.toFixed(2)}s - ${selection.end.toFixed(2)}s`);
    setSelection(null);
    showToast('Selection cut', 'success');
  }, [currentBuffer, selection, showToast]);

  // Keyboard Shortcuts (Hotkeys)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName)) {
        return;
      }

      if (e.code === 'Space') {
        e.preventDefault();
        if (!currentBuffer) return;
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
        if (e.shiftKey) {
          const vpStart = Math.max(0, scrollLeft / zoom);
          const vpEnd = Math.min(currentBuffer ? currentBuffer.duration : 0, (scrollLeft + canvasDimensions.width) / zoom);
          if (vpEnd > vpStart) {
            setSelection({ start: vpStart, end: vpEnd });
            showToast(`Selected viewport (${vpStart.toFixed(2)}s – ${vpEnd.toFixed(2)}s)`, 'info');
          }
        } else {
          handleSelectAll();
        }
      } else if (e.key === 'i' || e.key === 'I' || e.key === '[') {
        if (currentBuffer) {
          e.preventDefault();
          const curTime = currentTime;
          const trackDur = currentBuffer.duration;
          if (selection && selection.end > curTime) {
            setSelection({ start: curTime, end: selection.end });
          } else {
            setSelection({ start: curTime, end: Math.min(trackDur, curTime + 1) });
          }
          showToast(`In-point: ${curTime.toFixed(2)}s`, 'info');
        }
      } else if (e.key === 'o' || e.key === 'O' || e.key === ']') {
        if (currentBuffer) {
          e.preventDefault();
          const curTime = currentTime;
          if (selection && curTime > selection.start) {
            setSelection({ start: selection.start, end: curTime });
          } else {
            setSelection({ start: Math.max(0, curTime - 1), end: curTime });
          }
          showToast(`Out-point: ${curTime.toFixed(2)}s`, 'info');
        }
      } else if (e.shiftKey && e.key === 'Home') {
        if (currentBuffer) {
          e.preventDefault();
          setSelection({ start: 0, end: currentTime });
          showToast(`Selected: 0.00s – ${currentTime.toFixed(2)}s`, 'info');
        }
      } else if (e.shiftKey && e.key === 'End') {
        if (currentBuffer) {
          e.preventDefault();
          setSelection({ start: currentTime, end: currentBuffer.duration });
          showToast(`Selected: ${currentTime.toFixed(2)}s – ${currentBuffer.duration.toFixed(2)}s`, 'info');
        }
      } else if (e.shiftKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
        if (currentBuffer) {
          e.preventDefault();
          const step = e.altKey ? 0.1 : 0.5;
          const dir = e.key === 'ArrowRight' ? 1 : -1;
          const trackDur = currentBuffer.duration;
          if (selection && selection.end > selection.start) {
            const newEnd = Math.max(selection.start + 0.05, Math.min(trackDur, selection.end + dir * step));
            setSelection({ start: selection.start, end: newEnd });
          } else {
            const start = dir > 0 ? currentTime : Math.max(0, currentTime - step);
            const end = dir > 0 ? Math.min(trackDur, currentTime + step) : currentTime;
            setSelection({ start, end });
          }
        }
      } else if (e.key === 'Escape') {
        setSelection(null);
      } else if (!e.ctrlKey && !e.metaKey && !e.altKey && (e.key === 'v' || e.key === 'V')) {
        setInteractionMode('pan');
        showToast('Pan mode [V]', 'info');
      } else if (!e.ctrlKey && !e.metaKey && !e.altKey && (e.key === 's' || e.key === 'S')) {
        setInteractionMode('select');
        showToast('Select mode [S]', 'info');
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selection && selection.end > selection.start) {
          e.preventDefault();
          handleCut();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [playState, currentTime, selection, currentBuffer, scrollLeft, zoom, canvasDimensions.width, showToast, handleSelectAll, handleCut, handleUndo, handleRedo, setInteractionMode]);

  const handleToggleTimeFormat = useCallback(() => {
    setTimeFormat((prev) => {
      if (prev === 'hms') return 'seconds';
      if (prev === 'seconds') return 'samples';
      return 'hms';
    });
  }, []);

  const handlePlaybackRateChange = useCallback((rate: number) => {
    setPlaybackRate(rate);
    audioEngine.setPlaybackRate(rate);
    showToast(`Speed: ${rate}x`, 'info');
  }, [showToast]);

  const handleSilence = useCallback(() => {
    if (!currentBuffer || !selection || selection.end <= selection.start) return;
    const ctx = audioEngine.getContext();
    const newBuffer = BufferUtils.muteRegion(ctx, currentBuffer, selection.start, selection.end);
    audioEngine.setBufferDirectly(newBuffer, `Silenced ${selection.start.toFixed(2)}s - ${selection.end.toFixed(2)}s`);
    showToast('Selection silenced', 'success');
  }, [currentBuffer, selection, showToast]);

  const handleInsertSilence = useCallback((
    durationSec: number,
    placement: 'playhead' | 'start' | 'end' | 'replace-selection' = 'playhead'
  ) => {
    if (!currentBuffer) return;
    const ctx = audioEngine.getContext();
    let newBuffer: AudioBuffer;
    let label = '';

    if (placement === 'replace-selection' && selection && selection.end > selection.start) {
      const silenceBuf = BufferUtils.createEmptyBuffer(
        ctx,
        currentBuffer.numberOfChannels,
        Math.floor(durationSec * currentBuffer.sampleRate),
        currentBuffer.sampleRate
      );
      newBuffer = BufferUtils.replaceBufferRegion(ctx, currentBuffer, silenceBuf, selection.start, selection.end);
      label = `Replaced selection with ${durationSec}s silence`;
    } else {
      let atSec = currentTime;
      if (placement === 'start') atSec = 0;
      if (placement === 'end') atSec = currentBuffer.duration;
      newBuffer = BufferUtils.insertSilence(ctx, currentBuffer, atSec, durationSec);
      label = `Inserted ${durationSec}s silence at ${atSec.toFixed(2)}s`;
    }

    audioEngine.setBufferDirectly(newBuffer, label);
    showToast(`Silence inserted (${durationSec}s)`, 'success');
  }, [currentBuffer, selection, currentTime, showToast]);

  const handleQuickFadeIn = useCallback(() => {
    if (!currentBuffer) return;
    const ctx = audioEngine.getContext();
    let startSec = 0;
    let duration = fadeInDuration;

    if (selection && selection.end > selection.start) {
      startSec = selection.start;
      duration = selection.end - selection.start;
    }

    const safeDuration = Math.min(duration, Math.max(0.01, currentBuffer.duration - startSec));
    const newBuffer = BufferUtils.applyFade(ctx, currentBuffer, startSec, safeDuration, 'in', fadeCurve);
    audioEngine.setBufferDirectly(newBuffer, `Fade In (${safeDuration.toFixed(2)}s, ${fadeCurve})`);
    showToast(`Fade In applied (${safeDuration.toFixed(2)}s)`, 'success');
  }, [currentBuffer, selection, fadeInDuration, fadeCurve, showToast]);

  const handleQuickFadeOut = useCallback(() => {
    if (!currentBuffer) return;
    const ctx = audioEngine.getContext();
    let startSec = Math.max(0, currentBuffer.duration - fadeOutDuration);
    let duration = fadeOutDuration;

    if (selection && selection.end > selection.start) {
      startSec = selection.start;
      duration = selection.end - selection.start;
    }

    const safeDuration = Math.min(duration, Math.max(0.01, currentBuffer.duration - startSec));
    const newBuffer = BufferUtils.applyFade(ctx, currentBuffer, startSec, safeDuration, 'out', fadeCurve);
    audioEngine.setBufferDirectly(newBuffer, `Fade Out (${safeDuration.toFixed(2)}s, ${fadeCurve})`);
    showToast(`Fade Out applied (${safeDuration.toFixed(2)}s)`, 'success');
  }, [currentBuffer, selection, fadeOutDuration, fadeCurve, showToast]);

  const handleOpenFadeModal = useCallback((type: FadeType = 'in') => {
    setFadeModalInitialType(type);
    setFadeModalOpen(true);
  }, []);

  const handleApplyFade = useCallback((
    type: FadeType,
    durationSec: number,
    curve: FadeCurve,
    position: FadePosition
  ) => {
    if (!currentBuffer) return;
    const ctx = audioEngine.getContext();
    if (type === 'in') {
      setFadeInDuration(durationSec);
    } else {
      setFadeOutDuration(durationSec);
    }
    setFadeCurve(curve);

    let startSec = 0;
    const trackDur = currentBuffer.duration;

    if (position === 'start') {
      startSec = 0;
    } else if (position === 'end') {
      startSec = Math.max(0, trackDur - durationSec);
    } else if (position === 'selection' && selection && selection.end > selection.start) {
      startSec = selection.start;
    } else if (position === 'playhead') {
      startSec = type === 'in' ? currentTime : Math.max(0, currentTime - durationSec);
    }

    const safeDuration = Math.min(durationSec, Math.max(0.01, trackDur - startSec));
    const newBuffer = BufferUtils.applyFade(ctx, currentBuffer, startSec, safeDuration, type, curve);
    const label = `${type === 'in' ? 'Fade In' : 'Fade Out'} (${safeDuration.toFixed(2)}s, ${curve})`;
    audioEngine.setBufferDirectly(newBuffer, label);
    showToast(`Fade ${type === 'in' ? 'In' : 'Out'} applied (${safeDuration.toFixed(2)}s)`, 'success');
  }, [currentBuffer, selection, currentTime, showToast]);

  const handleApplyGain = useCallback((gainDb: number, target: 'selection' | 'all') => {
    if (!currentBuffer) return;
    const ctx = audioEngine.getContext();
    const startSec = target === 'selection' && selection ? selection.start : undefined;
    const endSec = target === 'selection' && selection ? selection.end : undefined;
    const newBuffer = BufferUtils.applyGain(ctx, currentBuffer, gainDb, startSec, endSec);
    audioEngine.setBufferDirectly(newBuffer, `Gain ${gainDb > 0 ? '+' : ''}${gainDb}dB`);
    showToast(`Gain applied (${gainDb > 0 ? '+' : ''}${gainDb} dB)`, 'success');
  }, [currentBuffer, selection, showToast]);

  const handleApplyNormalize = useCallback((targetDb: number = -0.1, scope: 'all' | 'selection' = 'all') => {
    if (!currentBuffer) return;
    const ctx = audioEngine.getContext();
    const startSec = scope === 'selection' && selection ? selection.start : undefined;
    const endSec = scope === 'selection' && selection ? selection.end : undefined;
    const newBuffer = BufferUtils.normalizeBuffer(ctx, currentBuffer, targetDb, startSec, endSec);
    const label = `Normalize to ${targetDb > 0 ? `+${targetDb}` : targetDb}dBFS (${scope})`;
    audioEngine.setBufferDirectly(newBuffer, label);
    showToast(`Normalized to ${targetDb} dBFS`, 'success');
  }, [currentBuffer, selection, showToast]);

  const handleGenerateSignal = useCallback(async (settings: SignalGeneratorSettings) => {
    const ctx = audioEngine.getContext();
    const genBuffer = BufferUtils.generateSignalBuffer(ctx, {
      type: settings.type,
      frequency: settings.frequency,
      gainDb: settings.gainDb,
      durationSec: settings.durationSec,
      channels: settings.channels,
      sampleRate: currentBuffer ? currentBuffer.sampleRate : 44100
    });

    const isNoise = settings.type === 'white-noise' || settings.type === 'pink-noise';
    const genName = isNoise
      ? `${settings.type === 'pink-noise' ? 'Pink Noise' : 'White Noise'} (${settings.durationSec}s)`
      : `${settings.frequency}Hz ${settings.type.charAt(0).toUpperCase() + settings.type.slice(1)} (${settings.durationSec}s)`;

    if (settings.placement === 'new-file' || !currentBuffer) {
      const res = await exportAudio(genBuffer, {
        format: 'wav',
        wavBitDepth: 16,
        mp3Bitrate: 192,
        sampleRate: genBuffer.sampleRate,
        channels: genBuffer.numberOfChannels as 1 | 2,
        exportScope: 'all',
        fileName: genName
      }, null, ctx);

      const savedFile = await saveAudioFile({
        name: genName,
        folderId: activeFolderId,
        duration: genBuffer.duration,
        sampleRate: genBuffer.sampleRate,
        numberOfChannels: genBuffer.numberOfChannels,
        format: 'wav',
        size: res.blob.size,
        blob: res.blob,
        waveformPeaks: generateWaveformPeaks(genBuffer, 64),
        tags: ['synth', settings.type]
      });

      await loadData();
      loadFileToEditor(savedFile);
      showToast(`Generated: ${genName}`, 'success');
      return;
    }

    let resultBuffer: AudioBuffer;
    if (settings.placement === 'replace-selection' && selection && selection.end > selection.start) {
      resultBuffer = BufferUtils.replaceBufferRegion(ctx, currentBuffer, genBuffer, selection.start, selection.end);
    } else {
      let atSec = currentTime;
      if (settings.placement === 'start') atSec = 0;
      if (settings.placement === 'end') atSec = currentBuffer.duration;
      resultBuffer = BufferUtils.insertBufferAt(ctx, currentBuffer, genBuffer, atSec);
    }

    audioEngine.setBufferDirectly(resultBuffer, `Inserted ${genName}`);
    showToast(`Signal inserted (${genName})`, 'success');
  }, [currentBuffer, selection, currentTime, activeFolderId, loadData, loadFileToEditor, showToast]);

  const handleReverse = useCallback(() => {
    if (!currentBuffer) return;
    const ctx = audioEngine.getContext();
    const startSec = selection ? selection.start : undefined;
    const endSec = selection ? selection.end : undefined;
    const newBuffer = BufferUtils.reverseBuffer(ctx, currentBuffer, startSec, endSec);
    audioEngine.setBufferDirectly(newBuffer, 'Reverse audio');
    showToast('Audio reversed', 'success');
  }, [currentBuffer, selection, showToast]);

  const handleInvert = useCallback(() => {
    if (!currentBuffer) return;
    const ctx = audioEngine.getContext();
    const startSec = selection ? selection.start : undefined;
    const endSec = selection ? selection.end : undefined;
    const newBuffer = BufferUtils.invertPhase(ctx, currentBuffer, startSec, endSec);
    audioEngine.setBufferDirectly(newBuffer, 'Invert Phase');
    showToast('Phase inverted', 'success');
  }, [currentBuffer, selection, showToast]);

  const handleSplit = useCallback(async () => {
    if (!currentBuffer || currentTime <= 0 || currentTime >= currentBuffer.duration) {
      showToast('Set playhead to split point', 'info');
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
    showToast(`Track split at ${currentTime.toFixed(2)}s`, 'success');
  }, [currentBuffer, currentTime, currentFileName, activeFolderId, refreshStorage, showToast]);

  const handleApplyEffects = useCallback(async (
    eq: EQSettings,
    filters: FilterSettings,
    comp: CompressorSettings,
    speed: number
  ) => {
    if (!currentBuffer) return;
    const newBuffer = await EffectsChain.renderEffects(currentBuffer, eq, filters, comp, speed);
    audioEngine.setBufferDirectly(newBuffer, 'Applied EQ & DSP Effects');
    showToast('Effects applied', 'success');
  }, [currentBuffer, showToast]);

  const handleExport = useCallback(async (
    settings: ExportSettings,
    destination: 'download' | 'library',
    onProgress?: (progress: number) => void
  ) => {
    if (!currentBuffer) return;
    const ctx = audioEngine.getContext();
    const result = await exportAudio(currentBuffer, settings, selection, ctx, onProgress);

    if (destination === 'download') {
      triggerDownload(result.blob, result.fileName);
      showToast(`Exported: ${result.fileName}`, 'success');
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
      showToast(`Saved to Library: ${saved.name}`, 'success');
    }
  }, [currentBuffer, selection, activeFolderId, refreshStorage, showToast]);

  const handleSaveRecording = useCallback(async (buffer: AudioBuffer, fileName: string, action: 'editor' | 'library') => {
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
      showToast(`Loaded: ${fileName}`, 'success');
    } else {
      showToast(`Saved: ${fileName}`, 'success');
    }
  }, [refreshStorage, showToast]);

  const importFiles = useCallback(async (
    fileList: FileList | File[],
    options: { loadToEditor?: boolean } = {}
  ) => {
    const { loadToEditor = false } = options;
    const tempAudioCtx = audioEngine.getContext();
    let imported = 0;
    const skippedFiles: string[] = [];
    let firstSavedFile: AudioFileItem | null = null;
    let firstDecodedBuffer: AudioBuffer | null = null;

    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];

      if (file.name.endsWith('.zip')) {
        const res = await importFromZip(file);
        imported += res.importedCount;
        continue;
      }

      if (!isSupportedAudioFile(file)) {
        skippedFiles.push(file.name);
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

        if (loadToEditor && !firstSavedFile) {
          firstSavedFile = saved;
          firstDecodedBuffer = decoded;
        }
        imported++;
      } catch (err) {
        console.warn('Failed to decode file:', file.name, err);
        skippedFiles.push(file.name);
      }
    }

    const updatedFolders = await db.folders.toArray();
    setFolders(updatedFolders);
    const updatedFiles = await getAllAudioFiles();
    setFiles(updatedFiles);
    await refreshStorage();

    if (loadToEditor) {
      if (firstSavedFile && firstDecodedBuffer) {
        await loadFileToEditor(firstSavedFile, firstDecodedBuffer);
        if (imported > 1) {
          showToast(`Loaded: ${firstSavedFile.name} (+${imported - 1} imported)`, 'success');
        }
      } else if (imported > 0) {
        const latestFile = updatedFiles[updatedFiles.length - 1];
        if (latestFile) {
          await loadFileToEditor(latestFile);
        }
      }
    } else {
      if (imported > 0) {
        showToast(`Imported ${imported} file${imported > 1 ? 's' : ''}`, 'success');
      }
    }

    if (skippedFiles.length > 0) {
      if (imported === 0) {
        showToast(`Unsupported format: ${skippedFiles[0]}`, 'error');
      } else {
        showToast(`Skipped ${skippedFiles.length} invalid file${skippedFiles.length > 1 ? 's' : ''}`, 'warning');
      }
    }
  }, [activeFolderId, loadFileToEditor, refreshStorage, showToast]);

  const handleWorkspaceImportFiles = useCallback((fileList: FileList | File[]) => {
    return importFiles(fileList, { loadToEditor: true });
  }, [importFiles]);

  const handleSidebarImportFiles = useCallback((fileList: FileList | File[]) => {
    return importFiles(fileList, { loadToEditor: false });
  }, [importFiles]);

  const handleCreateFolder = useCallback(async (name: string, color?: string) => {
    await createFolder(name, null, color);
    const updated = await db.folders.toArray();
    setFolders(updated);
    showToast(`Created folder "${name}"`, 'success');
  }, [showToast]);

  const handleRenameFolder = useCallback(async (id: string, newName: string) => {
    await updateFolder(id, { name: newName });
    const updated = await db.folders.toArray();
    setFolders(updated);
    showToast('Folder renamed', 'success');
  }, [showToast]);

  const handleDeleteFolder = useCallback(async (id: string) => {
    await deleteFolder(id);
    const updated = await db.folders.toArray();
    setFolders(updated);
    if (activeFolderId === id) setActiveFolderId(null);
    showToast('Folder deleted', 'info');
  }, [activeFolderId, showToast]);

  const handleDeleteFile = useCallback(async (id: string) => {
    await deleteAudioFile(id);
    const updated = await getAllAudioFiles();
    setFiles(updated);
    if (activeFileId === id) {
      setActiveFileId(null);
      setCurrentFileName('No file selected');
      audioEngine.clearBuffer();
      setSelection(null);
    }
    await refreshStorage();
    showToast('File deleted', 'info');
  }, [activeFileId, refreshStorage, showToast]);

  const handleClearWorkspace = useCallback(() => {
    if (!currentBuffer) return;
    if (canUndo) {
      const confirmed = window.confirm('Clear workspace? Any unsaved edits will be discarded.');
      if (!confirmed) return;
    }
    audioEngine.stop();
    audioEngine.clearBuffer();
    setActiveFileId(null);
    setCurrentFileName('No file selected');
    setCurrentTime(0);
    setSelection(null);
    setScrollLeft(0);
    setIsLooping(false);
    showToast('Workspace cleared', 'info');
  }, [currentBuffer, canUndo, showToast]);

  const handleExportZip = useCallback(async () => {
    showToast('Exporting ZIP backup...', 'info');
    const zipBlob = await exportAllToZip();
    triggerDownload(zipBlob, `audiocraft_backup_${new Date().toISOString().slice(0, 10)}.zip`);
    showToast('ZIP backup exported', 'success');
  }, [showToast]);

  // Stable Memoized Modal and UI Toggles
  const handleSeekViewport = useCallback((newStart: number) => {
    setScrollLeft(newStart * zoom);
  }, [zoom]);

  const handleFadeSelection = useCallback(() => {
    handleOpenFadeModal('in');
  }, [handleOpenFadeModal]);

  const handleOpenRangeModal = useCallback(() => setRangeModalOpen(true), []);
  const handleCloseRangeModal = useCallback(() => setRangeModalOpen(false), []);

  const handleApplyRangeSelection = useCallback((newSelection: AudioSelection | null, centerViewport: boolean = true) => {
    setSelection(newSelection);
    if (newSelection && centerViewport && currentBuffer) {
      const selDuration = newSelection.end - newSelection.start;
      const selCenter = (newSelection.start + newSelection.end) / 2;
      if (canvasDimensions.width > 0) {
        const desiredZoom = Math.max(10, Math.min(zoom, (canvasDimensions.width * 0.8) / Math.max(0.1, selDuration)));
        setZoom(desiredZoom);
        const targetScroll = Math.max(0, selCenter * desiredZoom - canvasDimensions.width / 2);
        setScrollLeft(targetScroll);
      }
    }
    if (newSelection) {
      showToast(`Selected: ${(newSelection.end - newSelection.start).toFixed(2)}s (${newSelection.start.toFixed(2)}s – ${newSelection.end.toFixed(2)}s)`, 'info');
    } else {
      showToast('Selection cleared', 'info');
    }
  }, [currentBuffer, zoom, canvasDimensions.width, showToast]);

  const handleOpenSilenceModal = useCallback(() => setSilenceModalOpen(true), []);
  const handleCloseSilenceModal = useCallback(() => setSilenceModalOpen(false), []);

  const handleOpenGainModal = useCallback(() => setGainModalOpen(true), []);
  const handleCloseGainModal = useCallback(() => setGainModalOpen(false), []);

  const handleOpenNormalizeModal = useCallback(() => setNormalizeModalOpen(true), []);
  const handleCloseNormalizeModal = useCallback(() => setNormalizeModalOpen(false), []);

  const handleOpenEffectsModal = useCallback(() => setEffectsModalOpen(true), []);
  const handleCloseEffectsModal = useCallback(() => setEffectsModalOpen(false), []);

  const handleOpenGeneratorModal = useCallback(() => setGeneratorModalOpen(true), []);
  const handleCloseGeneratorModal = useCallback(() => setGeneratorModalOpen(false), []);

  const handleOpenRecordModal = useCallback(() => setRecordModalOpen(true), []);
  const handleCloseRecordModal = useCallback(() => setRecordModalOpen(false), []);

  const handleCloseFadeModal = useCallback(() => setFadeModalOpen(false), []);

  const handleOpenExportModal = useCallback(() => setExportModalOpen(true), []);
  const handleCloseExportModal = useCallback(() => setExportModalOpen(false), []);

  const handleOpenPwaModal = useCallback(() => setPwaModalOpen(true), []);
  const handleClosePwaModal = useCallback(() => setPwaModalOpen(false), []);

  // Support Android System Back button & Back gesture navigation to dismiss sidebar
  useEffect(() => {
    const handlePopState = () => {
      setSidebarOpen(false);
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Escape key listener to close sidebar
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && sidebarOpen) {
        setSidebarOpen(false);
        if (typeof window !== 'undefined' && window.history.state?.drawer === 'sidebar') {
          window.history.back();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [sidebarOpen]);

  const handleOpenLibrary = useCallback(() => {
    setSidebarOpen(true);
    if (typeof window !== 'undefined' && window.innerWidth <= 960) {
      window.history.pushState({ drawer: 'sidebar' }, '');
    }
  }, []);

  const handleCloseSidebar = useCallback(() => {
    setSidebarOpen(false);
    if (typeof window !== 'undefined' && window.history.state?.drawer === 'sidebar') {
      window.history.back();
    }
  }, []);

  const handleToggleSidebar = useCallback(() => {
    setSidebarOpen((prev) => {
      const next = !prev;
      if (typeof window !== 'undefined') {
        if (next && window.innerWidth <= 960) {
          window.history.pushState({ drawer: 'sidebar' }, '');
        } else if (!next && window.history.state?.drawer === 'sidebar') {
          window.history.back();
        }
      }
      return next;
    });
  }, []);

  // Touch Swipe-to-Dismiss gesture handlers on sidebar for Android / Mobile
  const handleSidebarTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      sidebarTouchStartRef.current = {
        x: e.touches[0].clientX,
        y: e.touches[0].clientY,
        time: Date.now()
      };
    }
  }, []);

  const handleSidebarTouchEnd = useCallback((e: React.TouchEvent) => {
    if (!sidebarTouchStartRef.current || e.changedTouches.length === 0) return;
    const endX = e.changedTouches[0].clientX;
    const endY = e.changedTouches[0].clientY;
    const diffX = endX - sidebarTouchStartRef.current.x;
    const diffY = endY - sidebarTouchStartRef.current.y;
    const elapsed = Date.now() - sidebarTouchStartRef.current.time;

    // Horizontal swipe left by > 40px or quick flick left (< 250ms and > 25px)
    if ((diffX < -40 || (diffX < -25 && elapsed < 250)) && Math.abs(diffX) > Math.abs(diffY)) {
      handleCloseSidebar();
    }
    sidebarTouchStartRef.current = null;
  }, [handleCloseSidebar]);

  const handlePromptInstall = useCallback(() => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      deferredPrompt.userChoice.then(() => setDeferredPrompt(null));
    }
  }, [deferredPrompt]);

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
            onClick={handleToggleSidebar}
            title="Toggle File Library"
            aria-label="Toggle File Library"
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
          <input
            type="file"
            ref={headerFileInputRef}
            onChange={(e) => {
              if (e.target.files && e.target.files.length > 0) {
                handleWorkspaceImportFiles(e.target.files);
                e.target.value = '';
              }
            }}
            multiple
            accept={SUPPORTED_UPLOAD_ACCEPT}
            style={{ display: 'none' }}
          />
          <span className="track-prefix-label" style={{ color: 'var(--text-muted)' }}>Track:</span>
          <span className="track-name-text" title={currentFileName}>{currentFileName}</span>
          {!currentBuffer ? (
            <button
              type="button"
              className="btn btn-secondary btn-xs track-header-open-btn"
              onClick={() => headerFileInputRef.current?.click()}
              title="Open / Import Audio File"
            >
              <FolderOpen size={11} color="var(--accent-cyan)" />
              <span>Open</span>
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-ghost btn-xs track-header-clear-btn"
              onClick={handleClearWorkspace}
              title="Clear workspace (Return to upload modal)"
              aria-label="Clear workspace"
            >
              <X size={12} />
              <span className="btn-text-desktop">Clear</span>
            </button>
          )}
        </div>

        {/* Header Action Buttons */}
        <div className="header-actions">
          {/* Overall UI Text Font Size Adjuster (- / +) */}
          <FontSizeAdjuster
            fontScale={fontScale}
            onDecrease={handleDecreaseFont}
            onIncrease={handleIncreaseFont}
            onReset={handleResetFont}
          />

          {/* Clear Workspace Button */}
          <button
            type="button"
            className="btn btn-secondary btn-sm header-clear-btn"
            onClick={handleClearWorkspace}
            disabled={!currentBuffer}
            title="Clear workspace back to upload modal"
            aria-label="Clear workspace"
          >
            <FileX size={14} color={currentBuffer ? 'var(--accent-rose)' : undefined} />
            <span className="btn-text-desktop">Clear</span>
          </button>

          <button
            className="btn btn-secondary btn-sm"
            onClick={handleOpenPwaModal}
            title="Install PWA to Home Screen"
          >
            <Smartphone size={14} color="var(--accent-cyan)" />
            <span className="btn-text-desktop">Install</span>
          </button>

          <button
            className="btn btn-primary btn-sm"
            onClick={handleOpenExportModal}
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
            className="sidebar-backdrop"
            onClick={handleCloseSidebar}
            onTouchEnd={(e) => {
              e.preventDefault();
              handleCloseSidebar();
            }}
            role="button"
            tabIndex={0}
            aria-label="Close library sidebar"
          />
        )}

        {/* File Manager Sidebar */}
        <aside
          className={`sidebar-panel ${sidebarOpen ? 'open' : ''}`}
          onTouchStart={handleSidebarTouchStart}
          onTouchEnd={handleSidebarTouchEnd}
        >
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
            onImportFiles={handleSidebarImportFiles}
            onExportZip={handleExportZip}
            onCloseSidebar={handleCloseSidebar}
          />
        </aside>

        {/* Main Waveform Workspace */}
        <main
          className="editor-panel"
          onDragOver={(e) => {
            e.preventDefault();
            setIsEditorDragOver(true);
          }}
          onDragLeave={(e) => {
            e.preventDefault();
            setIsEditorDragOver(false);
          }}
          onDrop={(e) => {
            e.preventDefault();
            setIsEditorDragOver(false);
            if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
              handleWorkspaceImportFiles(e.dataTransfer.files);
            }
          }}
          style={{
            outline: isEditorDragOver ? '2px dashed var(--accent-cyan)' : 'none',
            outlineOffset: -4
          }}
        >
          {/* DSP Editing Tool Palette */}
          <ToolPalette
            hasSelection={Boolean(selection && selection.end > selection.start)}
            hasBuffer={Boolean(currentBuffer)}
            fadeInDuration={fadeInDuration}
            fadeOutDuration={fadeOutDuration}
            onTrim={handleTrim}
            onCut={handleCut}
            onSilence={handleSilence}
            onInsertSilence={handleOpenSilenceModal}
            onFadeInQuick={handleQuickFadeIn}
            onFadeOutQuick={handleQuickFadeOut}
            onOpenFadeModal={handleOpenFadeModal}
            onGainModal={handleOpenGainModal}
            onOpenNormalizeModal={handleOpenNormalizeModal}
            onReverse={handleReverse}
            onInvert={handleInvert}
            onSplit={handleSplit}
            onOpenEffects={handleOpenEffectsModal}
            onOpenGenerator={handleOpenGeneratorModal}
            onClearWorkspace={handleClearWorkspace}
          />

          {/* MiniMap Overview */}
          <MiniMap
            buffer={currentBuffer}
            duration={duration}
            currentTime={currentTime}
            viewportStart={viewportStart}
            viewportEnd={viewportEnd}
            selection={selection}
            mode={interactionMode === 'pan' ? 'viewport' : 'select'}
            onModeChange={(m) => setInteractionMode(m === 'viewport' ? 'pan' : 'select')}
            width={canvasDimensions.width}
            onSeekViewport={handleSeekViewport}
            onSeekPlayhead={handleSeek}
            onSelectRegion={setSelection}
          />

          {/* Time Ruler */}
          <TimeRuler
            duration={duration}
            zoom={zoom}
            scrollLeft={scrollLeft}
            width={canvasDimensions.width}
            selection={selection}
            currentTime={currentTime}
            onSeek={handleSeek}
            onSelectRegion={setSelection}
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
              onImportFiles={handleWorkspaceImportFiles}
              onLoadFileToEditor={loadFileToEditor}
              onOpenRecord={handleOpenRecordModal}
              onOpenGenerator={handleOpenGeneratorModal}
              onOpenLibrary={handleOpenLibrary}
              libraryFiles={files}
            />
          </div>

          {/* Selection Timecode & Quick Action Bar */}
          <SelectionInfo
            selection={selection}
            duration={duration}
            sampleRate={currentBuffer?.sampleRate || 44100}
            timeFormat={timeFormat}
            onToggleTimeFormat={handleToggleTimeFormat}
            isLooping={isLooping}
            onSelectAll={handleSelectAll}
            onClearSelection={handleClearSelection}
            onToggleLoop={handleToggleLoop}
            onTrim={handleTrim}
            onCut={handleCut}
            onFadeSelection={handleFadeSelection}
            onOpenSetRangeModal={handleOpenRangeModal}
          />

          {/* Bottom Studio Transport Bar */}
          <TransportBar
            playState={playState}
            currentTime={currentTime}
            duration={duration}
            canUndo={canUndo}
            canRedo={canRedo}
            volume={volume}
            playbackRate={playbackRate}
            sampleRate={currentBuffer?.sampleRate || 44100}
            timeFormat={timeFormat}
            onPlay={handlePlay}
            onPause={handlePause}
            onStop={handleStop}
            onOpenRecord={handleOpenRecordModal}
            onUndo={handleUndo}
            onRedo={handleRedo}
            onZoomIn={handleZoomIn}
            onZoomOut={handleZoomOut}
            onZoomFit={handleZoomFit}
            onVolumeChange={handleVolumeChange}
            onPlaybackRateChange={handlePlaybackRateChange}
            onToggleTimeFormat={handleToggleTimeFormat}
          />
        </main>
      </div>

      {/* Modals Suite */}
      <RecordModal
        isOpen={recordModalOpen}
        onClose={handleCloseRecordModal}
        onSaveRecording={handleSaveRecording}
      />

      <FadeModal
        isOpen={fadeModalOpen}
        onClose={handleCloseFadeModal}
        selection={selection}
        trackDuration={duration}
        currentTime={currentTime}
        initialType={fadeModalInitialType}
        onApplyFade={handleApplyFade}
      />

      <NormalizeModal
        isOpen={normalizeModalOpen}
        onClose={handleCloseNormalizeModal}
        selection={selection}
        onApplyNormalize={handleApplyNormalize}
      />

      <GeneratorModal
        isOpen={generatorModalOpen}
        onClose={handleCloseGeneratorModal}
        selection={selection}
        currentTime={currentTime}
        onGenerateSignal={handleGenerateSignal}
      />

      <SetRangeModal
        isOpen={rangeModalOpen}
        onClose={handleCloseRangeModal}
        duration={duration}
        currentTime={currentTime}
        viewportStart={viewportStart}
        viewportEnd={viewportEnd}
        selection={selection}
        onApplySelection={handleApplyRangeSelection}
      />

      <EffectsModal
        isOpen={effectsModalOpen}
        onClose={handleCloseEffectsModal}
        onApplyEffects={handleApplyEffects}
      />

      <ExportModal
        isOpen={exportModalOpen}
        onClose={handleCloseExportModal}
        selection={selection}
        currentFileName={currentFileName}
        isEdited={canUndo}
        onExport={handleExport}
      />

      <GainModal
        isOpen={gainModalOpen}
        onClose={handleCloseGainModal}
        hasSelection={Boolean(selection && selection.end > selection.start)}
        onApplyGain={handleApplyGain}
      />

      <SilenceModal
        isOpen={silenceModalOpen}
        onClose={handleCloseSilenceModal}
        selection={selection}
        currentTime={currentTime}
        onInsertSilence={handleInsertSilence}
      />

      <PwaInstallModal
        isOpen={pwaModalOpen}
        onClose={handleClosePwaModal}
        deferredPrompt={deferredPrompt}
        onPromptInstall={handlePromptInstall}
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
