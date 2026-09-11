import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Mic,
  Music,
  Sliders,
  Play,
  Square,
  Zap,
  ShieldCheck,
  Download,
  FolderPlus,
  Check,
  Undo2,
  Redo2,
  RefreshCw,
  Cpu,
  Layers
} from 'lucide-react';
import { Modal } from '../common/Modal';
import { Slider } from '../common/Slider';
import { VocalSeparationEngine, type SeparationProgressInfo } from '../../audio/vocal-separation/VocalSeparationEngine';
import type { GpuCapabilities } from '../../audio/vocal-separation/gpuDevice';
import type {
  AudioSelection,
  StemOutputMode,
  VocalRangePreset,
  VocalSeparationResult,
  VocalSeparationSettings
} from '../../types/audio';
import { encodeWav } from '../../audio/encoders/WavEncoder';

export interface VocalSeparationModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentBuffer: AudioBuffer | null;
  currentFileName: string;
  selection: AudioSelection | null;
  currentTime: number;
  onApplyStem: (resultBuffer: AudioBuffer, actionDescription: string, clearSelection?: boolean) => void;
  onSaveStemsToLibrary: (
    vocalBuffer: AudioBuffer,
    instrumentalBuffer: AudioBuffer,
    vocalBlob: Blob,
    instrumentalBlob: Blob,
    baseName: string
  ) => Promise<void>;
  canUndo?: boolean;
  canRedo?: boolean;
  onUndo?: () => void;
  onRedo?: () => void;
  undoActionName?: string;
  redoActionName?: string;
}

export const VocalSeparationModal: React.FC<VocalSeparationModalProps> = ({
  isOpen,
  onClose,
  currentBuffer,
  currentFileName,
  selection,
  currentTime,
  onApplyStem,
  onSaveStemsToLibrary,
  canUndo = false,
  canRedo = false,
  onUndo,
  onRedo,
  undoActionName = '',
  redoActionName = ''
}) => {
  const [mode, setMode] = useState<StemOutputMode>('vocals-only');
  const [vocalBalance, setVocalBalance] = useState<number>(0.5); // 0 = music only, 1 = vocal only
  const [vocalSensitivity, setVocalSensitivity] = useState<number>(1.0);
  const [stereoCenterWeight, setStereoCenterWeight] = useState<number>(0.85);
  const [debleedStrength, setDebleedStrength] = useState<number>(0.3);
  const [vocalRange, setVocalRange] = useState<VocalRangePreset>('all');
  const [preserveStereoAmbience, setPreserveStereoAmbience] = useState<boolean>(true);
  const [scope, setScope] = useState<'all' | 'selection'>('all');

  // Hardware capabilities state
  const [gpuInfo, setGpuInfo] = useState<GpuCapabilities | null>(null);

  // Processing & Progress state
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [progressInfo, setProgressInfo] = useState<SeparationProgressInfo | null>(null);

  // Audition preview state
  const [isPreviewLoading, setIsPreviewLoading] = useState<boolean>(false);
  const [previewBuffer, setPreviewBuffer] = useState<AudioBuffer | null>(null);
  const [previewVocal, setPreviewVocal] = useState<AudioBuffer | null>(null);
  const [previewInst, setPreviewInst] = useState<AudioBuffer | null>(null);
  const [previewOrig, setPreviewOrig] = useState<AudioBuffer | null>(null);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isBypassed, setIsBypassed] = useState<boolean>(false);
  const [auditionPlayhead, setAuditionPlayhead] = useState<number>(0);

  const previewSourceNodeRef = useRef<AudioBufferSourceNode | null>(null);
  const previewCtxRef = useRef<AudioContext | null>(null);
  const previewStartTimeRef = useRef<number>(0);
  const previewTimerRef = useRef<number | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const hasSelection = Boolean(selection && selection.end > selection.start);

  // Clean up preview audio on unmount or close
  const stopAudition = useCallback(() => {
    if (previewSourceNodeRef.current) {
      try {
        previewSourceNodeRef.current.stop();
        previewSourceNodeRef.current.disconnect();
      } catch {
        // ignore
      }
      previewSourceNodeRef.current = null;
    }
    if (previewTimerRef.current) {
      clearInterval(previewTimerRef.current);
      previewTimerRef.current = null;
    }
    setIsPlaying(false);
  }, []);

  // Query GPU capabilities on open
  useEffect(() => {
    if (isOpen) {
      void VocalSeparationEngine.getGpuCapabilities().then((info) => {
        setGpuInfo(info);
      });
      // Stem separation defaults to 'all' (Full Track) so the whole song is processed
      // unless the user deliberately toggles to 'selection'.
      setScope('all');
    } else {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
      stopAudition();
    }
  }, [isOpen, hasSelection, stopAudition]);

  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
      stopAudition();
      if (previewCtxRef.current && previewCtxRef.current.state !== 'closed') {
        void previewCtxRef.current.close();
      }
    };
  }, [stopAudition]);

  const startPlaybackWithBuffer = useCallback((ctx: AudioContext, activeBuf: AudioBuffer) => {
    stopAudition();

    const source = ctx.createBufferSource();
    source.buffer = activeBuf;
    source.loop = true;
    source.connect(ctx.destination);
    source.start(0);

    previewSourceNodeRef.current = source;
    previewStartTimeRef.current = ctx.currentTime;
    setIsPlaying(true);

    const dur = activeBuf.duration;
    previewTimerRef.current = window.setInterval(() => {
      if (!previewCtxRef.current) return;
      const elapsed = previewCtxRef.current.currentTime - previewStartTimeRef.current;
      setAuditionPlayhead(elapsed % dur);
    }, 50);

    source.onended = () => {
      setIsPlaying(false);
      if (previewTimerRef.current) {
        clearInterval(previewTimerRef.current);
        previewTimerRef.current = null;
      }
    };
  }, [stopAudition]);

  // Generate audition preview slice when user requests audition or starts playback
  const generateAudition = useCallback(async (autoPlayAfter: boolean = false) => {
    if (!currentBuffer) return;
    setIsPreviewLoading(true);

    try {
      if (!previewCtxRef.current || previewCtxRef.current.state === 'closed') {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        previewCtxRef.current = new AudioCtx();
      }
      const ctx = previewCtxRef.current;
      if (ctx.state === 'suspended') {
        await ctx.resume();
      }

      const settings: VocalSeparationSettings = {
        mode,
        vocalBalance: mode === 'vocals-only' ? 1.0 : mode === 'music-only' ? 0.0 : vocalBalance,
        vocalSensitivity,
        stereoCenterWeight,
        debleedStrength,
        vocalRange,
        preserveStereoAmbience,
        scope
      };

      const center = hasSelection && selection ? (selection.start + selection.end) / 2 : currentTime;
      const slice = await VocalSeparationEngine.generateAuditionSlice(ctx, currentBuffer, settings, center, 4.0);

      setPreviewBuffer(slice.previewBuffer);
      setPreviewVocal(slice.vocalSlice);
      setPreviewInst(slice.instrumentalSlice);
      setPreviewOrig(slice.originalSlice);

      if (autoPlayAfter) {
        const targetBuf = isBypassed
          ? slice.originalSlice
          : mode === 'vocals-only'
          ? slice.vocalSlice
          : mode === 'music-only'
          ? slice.instrumentalSlice
          : slice.previewBuffer;
        startPlaybackWithBuffer(ctx, targetBuf);
      }
    } catch (err) {
      console.warn('Audition preview generation failed:', err);
    } finally {
      setIsPreviewLoading(false);
    }
  }, [
    currentBuffer,
    mode,
    vocalBalance,
    vocalSensitivity,
    stereoCenterWeight,
    debleedStrength,
    vocalRange,
    preserveStereoAmbience,
    scope,
    hasSelection,
    selection,
    currentTime,
    isBypassed,
    startPlaybackWithBuffer
  ]);

  // Toggle Play / Pause preview
  const handleTogglePlay = () => {
    if (isPlaying) {
      stopAudition();
      return;
    }

    const activeBuf = isBypassed
      ? previewOrig
      : mode === 'vocals-only'
      ? previewVocal
      : mode === 'music-only'
      ? previewInst
      : previewBuffer;

    if (!activeBuf) {
      void generateAudition(true);
      return;
    }

    if (!previewCtxRef.current || previewCtxRef.current.state === 'closed') {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      previewCtxRef.current = new AudioCtx();
    }
    const ctx = previewCtxRef.current;
    if (ctx.state === 'suspended') {
      void ctx.resume();
    }

    startPlaybackWithBuffer(ctx, activeBuf);
  };

  // Switch A/B bypass
  const handleToggleBypass = () => {
    const nextBypass = !isBypassed;
    setIsBypassed(nextBypass);
    if (isPlaying && previewCtxRef.current) {
      const targetBuf = nextBypass
        ? previewOrig
        : mode === 'vocals-only'
        ? previewVocal
        : mode === 'music-only'
        ? previewInst
        : previewBuffer;
      if (targetBuf) {
        startPlaybackWithBuffer(previewCtxRef.current, targetBuf);
      }
    }
  };

  // Execute full track separation
  const executeSeparation = async (): Promise<VocalSeparationResult | null> => {
    if (!currentBuffer) return null;
    stopAudition();
    setIsProcessing(true);

    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    const ctx = new AudioCtx();

    try {
      const settings: VocalSeparationSettings = {
        mode,
        vocalBalance: mode === 'vocals-only' ? 1.0 : mode === 'music-only' ? 0.0 : vocalBalance,
        vocalSensitivity,
        stereoCenterWeight,
        debleedStrength,
        vocalRange,
        preserveStereoAmbience,
        scope
      };

      const result = await VocalSeparationEngine.separateStems(
        ctx,
        currentBuffer,
        settings,
        scope === 'selection' ? selection : null,
        (info) => {
          setProgressInfo(info);
        }
      );

      return result;
    } catch (err) {
      console.error('Stem separation failed:', err);
      alert('Vocal separation failed: ' + (err instanceof Error ? err.message : String(err)));
      return null;
    } finally {
      if (ctx.state !== 'closed') {
        void ctx.close();
      }
      setIsProcessing(false);
      setProgressInfo(null);
    }
  };

  // Action 1: Apply to workspace
  const handleApplyToWorkspace = async () => {
    const result = await executeSeparation();
    if (!result) return;

    let targetBuffer: AudioBuffer;
    let description: string;

    if (mode === 'vocals-only') {
      targetBuffer = result.vocalBuffer;
      description = `Isolate Vocals (${gpuInfo?.hasWebGPU ? 'iPad GPU' : 'Audio DSP'})`;
    } else if (mode === 'music-only') {
      targetBuffer = result.instrumentalBuffer;
      description = `Remove Vocals / Music Only (${gpuInfo?.hasWebGPU ? 'iPad GPU' : 'Audio DSP'})`;
    } else if (mode === 'both-stems') {
      targetBuffer = result.vocalBuffer;
      description = `Isolate Vocals (Stem Separation)`;
    } else {
      targetBuffer = result.outputBuffer;
      description = `Stem Mix (${Math.round((1 - vocalBalance) * 100)}% Music / ${Math.round(vocalBalance * 100)}% Vocals)`;
    }

    onApplyStem(targetBuffer, description, scope === 'all');
    onClose();
  };

  // Action 2: Save both stems into File Library
  const handleSaveBothStems = async () => {
    const result = await executeSeparation();
    if (!result || !currentBuffer) return;

    const baseName = currentFileName.replace(/\.[^/.]+$/, '');
    const vocalBlob = await encodeWav(result.vocalBuffer, { bitDepth: 16 });
    const instrumentalBlob = await encodeWav(result.instrumentalBuffer, { bitDepth: 16 });

    await onSaveStemsToLibrary(
      result.vocalBuffer,
      result.instrumentalBuffer,
      vocalBlob,
      instrumentalBlob,
      baseName
    );
    onClose();
  };

  // Action 3: Direct download of chosen stem
  const handleDownloadWav = async () => {
    const result = await executeSeparation();
    if (!result || !currentBuffer) return;

    let targetBuffer: AudioBuffer;
    let suffix: string;

    if (mode === 'vocals-only') {
      targetBuffer = result.vocalBuffer;
      suffix = '_vocals.wav';
    } else if (mode === 'music-only') {
      targetBuffer = result.instrumentalBuffer;
      suffix = '_instrumental.wav';
    } else if (mode === 'both-stems') {
      targetBuffer = result.vocalBuffer;
      suffix = '_vocals.wav';
    } else {
      targetBuffer = result.outputBuffer;
      suffix = `_stem_mix_${Math.round(vocalBalance * 100)}voc.wav`;
    }

    const filename = currentFileName.replace(/\.[^/.]+$/, '') + suffix;

    const blob = await encodeWav(targetBuffer, { bitDepth: 16 });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => {
        if (!isProcessing) {
          stopAudition();
          onClose();
        }
      }}
      title="On-Device Vocal & Stem Separation"
      maxWidth="680px"
      footer={
        <div className="modal-footer-dual" style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          {/* Undo / Redo controls */}
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
            <button
              className="btn btn-ghost btn-sm"
              onClick={onUndo}
              disabled={!canUndo || isProcessing}
              title={undoActionName ? `Undo: ${undoActionName} (Ctrl+Z)` : 'Undo'}
            >
              <Undo2 size={13} />
            </button>
            <button
              className="btn btn-ghost btn-sm"
              onClick={onRedo}
              disabled={!canRedo || isProcessing}
              title={redoActionName ? `Redo: ${redoActionName} (Ctrl+Y)` : 'Redo'}
            >
              <Redo2 size={13} />
            </button>
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => {
                stopAudition();
                onClose();
              }}
              disabled={isProcessing}
            >
              Cancel
            </button>

            <button
              className="btn btn-secondary btn-sm"
              onClick={handleDownloadWav}
              disabled={isProcessing || !currentBuffer}
              title="Directly download the isolated stem as a WAV audio file"
            >
              <Download size={14} color="#38bdf8" />
              <span>Download WAV</span>
            </button>

            <button
              className="btn btn-secondary btn-sm"
              onClick={handleSaveBothStems}
              disabled={isProcessing || !currentBuffer}
              title="Saves isolated vocal and instrumental WAV files directly to your File Manager library"
            >
              <FolderPlus size={14} color="var(--accent-cyan)" />
              <span>Save Both Stems</span>
            </button>

            <button
              className="btn btn-primary btn-sm"
              onClick={handleApplyToWorkspace}
              disabled={isProcessing || !currentBuffer}
              style={{
                background: 'linear-gradient(135deg, #0d9488, #0284c7)',
                borderColor: '#14b8a6',
                color: '#ffffff'
              }}
            >
              <Check size={14} />
              <span>Apply to Workspace</span>
            </button>
          </div>
        </div>
      }
    >
      <div className="vocal-separation-container" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {/* Hardware Status Banner */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '10px 14px',
            backgroundColor: 'rgba(15, 23, 42, 0.65)',
            border: '1px solid rgba(20, 184, 166, 0.25)',
            borderRadius: 'var(--radius-md, 8px)',
            gap: '12px'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: '8px',
                backgroundColor: 'rgba(20, 184, 166, 0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#2dd4bf'
              }}
            >
              {gpuInfo?.hasWebGPU ? <Zap size={18} /> : <Cpu size={18} />}
            </div>
            <div>
              <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-bright, #f8fafc)' }}>
                {gpuInfo?.hasWebGPU
                  ? `⚡ Hardware Acceleration: ${gpuInfo.deviceDescription}`
                  : `⚙️ Acceleration: ${gpuInfo?.deviceDescription || 'Multi-Threaded Audio DSP'}`}
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted, #94a3b8)' }}>
                STFT Formant Decomposition & Phase-Exact Residual Cancellation
              </div>
            </div>
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              padding: '4px 8px',
              backgroundColor: 'rgba(16, 185, 129, 0.12)',
              borderRadius: '999px',
              border: '1px solid rgba(16, 185, 129, 0.3)',
              color: '#34d399',
              fontSize: '0.7rem',
              fontWeight: 500,
              whiteSpace: 'nowrap'
            }}
          >
            <ShieldCheck size={12} />
            <span>100% On-Device</span>
          </div>
        </div>

        {/* Separation Mode Selector Cards */}
        <div>
          <label style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '8px', display: 'block' }}>
            SEPARATION TARGET
          </label>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
              gap: '8px'
            }}
          >
            {/* Mode 1: Vocals Only */}
            <button
              type="button"
              className={`stem-mode-card ${mode === 'vocals-only' ? 'active' : ''}`}
              onClick={() => {
                setMode('vocals-only');
                setVocalBalance(1.0);
              }}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                textAlign: 'center',
                padding: '12px 10px',
                borderRadius: 'var(--radius-md, 8px)',
                backgroundColor: mode === 'vocals-only' ? 'rgba(20, 184, 166, 0.15)' : 'var(--bg-card, #18181b)',
                border: `1px solid ${mode === 'vocals-only' ? 'var(--accent-cyan, #06b6d4)' : 'var(--border-subtle, #27272a)'}`,
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
            >
              <Mic size={20} color={mode === 'vocals-only' ? '#2dd4bf' : 'var(--text-muted)'} style={{ marginBottom: 6 }} />
              <div style={{ fontSize: '0.85rem', fontWeight: 600, color: mode === 'vocals-only' ? '#f8fafc' : 'var(--text-muted)' }}>
                Vocals Only
              </div>
              <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: 2 }}>
                Acapella / Speech
              </div>
            </button>

            {/* Mode 2: Music Only */}
            <button
              type="button"
              className={`stem-mode-card ${mode === 'music-only' ? 'active' : ''}`}
              onClick={() => {
                setMode('music-only');
                setVocalBalance(0.0);
              }}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                textAlign: 'center',
                padding: '12px 10px',
                borderRadius: 'var(--radius-md, 8px)',
                backgroundColor: mode === 'music-only' ? 'rgba(56, 189, 248, 0.15)' : 'var(--bg-card, #18181b)',
                border: `1px solid ${mode === 'music-only' ? 'var(--accent-blue, #38bdf8)' : 'var(--border-subtle, #27272a)'}`,
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
            >
              <Music size={20} color={mode === 'music-only' ? '#38bdf8' : 'var(--text-muted)'} style={{ marginBottom: 6 }} />
              <div style={{ fontSize: '0.85rem', fontWeight: 600, color: mode === 'music-only' ? '#f8fafc' : 'var(--text-muted)' }}>
                Music Only
              </div>
              <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: 2 }}>
                Karaoke / Instrumental
              </div>
            </button>

            {/* Mode 3: Custom Stem Balance */}
            <button
              type="button"
              className={`stem-mode-card ${mode === 'custom-balance' ? 'active' : ''}`}
              onClick={() => setMode('custom-balance')}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                textAlign: 'center',
                padding: '12px 10px',
                borderRadius: 'var(--radius-md, 8px)',
                backgroundColor: mode === 'custom-balance' ? 'rgba(168, 85, 247, 0.15)' : 'var(--bg-card, #18181b)',
                border: `1px solid ${mode === 'custom-balance' ? '#a855f7' : 'var(--border-subtle, #27272a)'}`,
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
            >
              <Sliders size={20} color={mode === 'custom-balance' ? '#c084fc' : 'var(--text-muted)'} style={{ marginBottom: 6 }} />
              <div style={{ fontSize: '0.85rem', fontWeight: 600, color: mode === 'custom-balance' ? '#f8fafc' : 'var(--text-muted)' }}>
                Custom Blend
              </div>
              <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: 2 }}>
                Vocal/Music Crossfader
              </div>
            </button>

            {/* Mode 4: Extract Both Stems */}
            <button
              type="button"
              className={`stem-mode-card ${mode === 'both-stems' ? 'active' : ''}`}
              onClick={() => setMode('both-stems')}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                textAlign: 'center',
                padding: '12px 10px',
                borderRadius: 'var(--radius-md, 8px)',
                backgroundColor: mode === 'both-stems' ? 'rgba(234, 179, 8, 0.15)' : 'var(--bg-card, #18181b)',
                border: `1px solid ${mode === 'both-stems' ? '#eab308' : 'var(--border-subtle, #27272a)'}`,
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
            >
              <Layers size={20} color={mode === 'both-stems' ? '#facc15' : 'var(--text-muted)'} style={{ marginBottom: 6 }} />
              <div style={{ fontSize: '0.85rem', fontWeight: 600, color: mode === 'both-stems' ? '#f8fafc' : 'var(--text-muted)' }}>
                Extract Both
              </div>
              <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: 2 }}>
                2-Stem Split to Files
              </div>
            </button>
          </div>
        </div>

        {/* Stem Crossfader Slider (for custom balance or preview) */}
        {mode === 'custom-balance' && (
          <div
            style={{
              padding: '12px 14px',
              backgroundColor: 'var(--bg-card, #18181b)',
              border: '1px solid var(--border-subtle, #27272a)',
              borderRadius: 'var(--radius-md, 8px)'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: '6px' }}>
              <span style={{ color: '#38bdf8' }}>🎸 100% Backing Music</span>
              <span className="mono" style={{ color: 'var(--accent-cyan)' }}>
                {Math.round((1 - vocalBalance) * 100)}% Music / {Math.round(vocalBalance * 100)}% Vocals
              </span>
              <span style={{ color: '#2dd4bf' }}>🎤 100% Vocals</span>
            </div>
            <input
              type="range"
              className="custom-slider"
              min="0"
              max="1"
              step="0.01"
              value={vocalBalance}
              onChange={(e) => setVocalBalance(parseFloat(e.target.value))}
            />
          </div>
        )}

        {/* Advanced Acoustic Controls Grid */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
            gap: '12px',
            backgroundColor: 'var(--bg-card, #18181b)',
            padding: '14px',
            borderRadius: 'var(--radius-md, 8px)',
            border: '1px solid var(--border-subtle, #27272a)'
          }}
        >
          {/* Vocal Formant Range */}
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label" style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              Vocal Frequency Range
            </label>
            <select
              className="custom-select"
              value={vocalRange}
              onChange={(e) => setVocalRange(e.target.value as VocalRangePreset)}
              style={{
                width: '100%',
                padding: '8px 10px',
                backgroundColor: 'var(--bg-main, #09090b)',
                border: '1px solid var(--border-subtle, #27272a)',
                borderRadius: '6px',
                color: 'var(--text-bright, #f8fafc)',
                fontSize: '0.82rem'
              }}
            >
              <option value="all">Full Spectrum (110 Hz – 4.5 kHz)</option>
              <option value="female-high">Female / High Lead (200 Hz – 4.8 kHz)</option>
              <option value="male-low">Male / Deep Lead (90 Hz – 3.5 kHz)</option>
              <option value="speech-lead">Spoken Word / Podcast (120 Hz – 3.2 kHz)</option>
            </select>
          </div>

          {/* Scope Selector */}
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label" style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              Processing Scope
            </label>
            <div style={{ display: 'flex', gap: '6px' }}>
              <button
                type="button"
                className={`btn btn-xs ${scope === 'all' ? 'btn-secondary' : 'btn-ghost'}`}
                style={{ flex: 1, borderColor: scope === 'all' ? 'var(--accent-cyan)' : undefined }}
                onClick={() => setScope('all')}
              >
                Full Track
              </button>
              <button
                type="button"
                className={`btn btn-xs ${scope === 'selection' ? 'btn-secondary' : 'btn-ghost'}`}
                style={{ flex: 1, borderColor: scope === 'selection' ? 'var(--accent-cyan)' : undefined }}
                onClick={() => setScope('selection')}
                disabled={!hasSelection}
                title={hasSelection ? 'Process active highlighted selection region only' : 'Make a selection on waveform to use'}
              >
                Selection {hasSelection && selection ? `(${selection.start.toFixed(1)}s-${selection.end.toFixed(1)}s)` : ''}
              </button>
            </div>
          </div>

          {/* Vocal Sensitivity */}
          <Slider
            label="Vocal Formant Sensitivity"
            value={vocalSensitivity}
            min={0.5}
            max={2.0}
            step={0.05}
            unit="x"
            onChange={setVocalSensitivity}
          />

          {/* De-bleed Gate */}
          <Slider
            label="De-Bleed Clarity Gate"
            value={Math.round(debleedStrength * 100)}
            min={0}
            max={100}
            step={5}
            unit="%"
            onChange={(val) => setDebleedStrength(val / 100)}
          />

          {/* Center Panning Correlation */}
          <Slider
            label="Center Panning Bias"
            value={Math.round(stereoCenterWeight * 100)}
            min={0}
            max={100}
            step={5}
            unit="%"
            onChange={(val) => setStereoCenterWeight(val / 100)}
          />

          {/* Preserve Stereo Ambience Toggle */}
          <div
            style={{
              gridColumn: '1 / -1',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingTop: '6px',
              borderTop: '1px solid var(--border-subtle, #27272a)'
            }}
          >
            <label
              htmlFor="preserve-ambience"
              style={{
                fontSize: '0.78rem',
                color: 'var(--text-muted, #94a3b8)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              <input
                id="preserve-ambience"
                type="checkbox"
                checked={preserveStereoAmbience}
                onChange={(e) => setPreserveStereoAmbience(e.target.checked)}
                style={{ accentColor: 'var(--accent-cyan, #06b6d4)', cursor: 'pointer' }}
              />
              <span>Preserve Stereo Room & Reverb Ambience in Instrumental Stem</span>
            </label>
          </div>
        </div>

        {/* Interactive Audition Player Bar */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '10px 14px',
            backgroundColor: 'rgba(2, 6, 23, 0.8)',
            border: '1px solid rgba(56, 189, 248, 0.25)',
            borderRadius: 'var(--radius-md, 8px)',
            gap: '12px'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button
              type="button"
              className="btn btn-primary btn-icon-sm"
              onClick={handleTogglePlay}
              disabled={isPreviewLoading}
              title={isPlaying ? 'Pause Audition' : 'Play Audition Preview Loop'}
              style={{
                background: isPlaying ? 'var(--accent-rose, #f43f5e)' : 'linear-gradient(135deg, #0284c7, #0d9488)',
                width: 34,
                height: 34,
                borderRadius: '50%'
              }}
            >
              {isPlaying ? <Square size={14} fill="currentColor" /> : <Play size={15} fill="currentColor" style={{ marginLeft: 2 }} />}
            </button>

            <div>
              <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span>
                  {isPreviewLoading
                    ? 'Generating Audition…'
                    : isPlaying
                    ? 'Auditioning (Loop)'
                    : previewBuffer
                    ? 'Audition Ready'
                    : 'Audition Preview (Click Play)'}
                </span>
                {isPlaying && (
                  <span className="mono" style={{ fontSize: '0.7rem', color: 'var(--accent-cyan)' }}>
                    {auditionPlayhead.toFixed(2)}s
                  </span>
                )}
              </div>
              <div style={{ fontSize: '0.7rem', color: isBypassed ? '#f59e0b' : '#38bdf8' }}>
                {isBypassed ? 'Listening to: ORIGINAL (Bypassed)' : `Listening to: ${mode === 'vocals-only' ? 'ISOLATED VOCALS' : mode === 'music-only' ? 'INSTRUMENTAL MUSIC' : 'CUSTOM STEM BLEND'}`}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
            <button
              type="button"
              className={`btn btn-xs ${isBypassed ? 'btn-warning' : 'btn-secondary'}`}
              onClick={handleToggleBypass}
              title="A/B Comparison: Toggle between original audio and separated stem"
            >
              {isBypassed ? 'Bypass ON (Original)' : 'A/B Compare'}
            </button>

            <button
              type="button"
              className="btn btn-ghost btn-xs"
              onClick={() => void generateAudition()}
              disabled={isPreviewLoading}
              title="Recompute audition preview with current slider settings"
            >
              <RefreshCw size={12} className={isPreviewLoading ? 'spin' : ''} />
            </button>
          </div>
        </div>

        {/* Progress Bar (Visible during separation) */}
        {isProcessing && progressInfo && (
          <div
            style={{
              padding: '12px 14px',
              backgroundColor: 'rgba(15, 23, 42, 0.95)',
              border: '1px solid var(--accent-cyan)',
              borderRadius: 'var(--radius-md, 8px)',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem' }}>
              <span style={{ color: 'var(--accent-cyan)', fontWeight: 600 }}>
                {progressInfo.statusText}
              </span>
              <span className="mono" style={{ color: '#f8fafc' }}>
                {progressInfo.progress}%
              </span>
            </div>
            <div
              style={{
                width: '100%',
                height: 6,
                backgroundColor: 'rgba(255, 255, 255, 0.1)',
                borderRadius: 3,
                overflow: 'hidden'
              }}
            >
              <div
                style={{
                  width: `${progressInfo.progress}%`,
                  height: '100%',
                  backgroundColor: 'var(--accent-cyan, #06b6d4)',
                  transition: 'width 0.15s ease'
                }}
              />
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
};
