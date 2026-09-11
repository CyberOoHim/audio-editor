import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Sparkles,
  Play,
  Square,
  RotateCcw,
  Disc,
  Waves,
  Bot,
  Radio,
  Bath,
  Warehouse,
  Music,
  Building,
  Check,
  Zap,
  Volume2,
  Ear,
  Undo2,
  Redo2
} from 'lucide-react';
import { Modal } from '../common/Modal';
import { Slider } from '../common/Slider';
import {
  VoiceChangerEngine
} from '../../audio/VoiceChangerEngine';
import {
  VOICE_PRESETS,
  DEFAULT_VOICE_SETTINGS,
  type VoicePreset
} from '../../audio/voicePresets';
import type {
  VoiceChangerSettings,
  VoiceChangerEnvironment,
  VoiceChangerBandpass,
  AudioSelection
} from '../../types/audio';

export interface VoiceChangerModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentBuffer: AudioBuffer | null;
  selection: AudioSelection | null;
  onApply: (settings: VoiceChangerSettings) => Promise<void>;
  canUndo?: boolean;
  canRedo?: boolean;
  onUndo?: () => void;
  onRedo?: () => void;
  undoActionName?: string;
  redoActionName?: string;
}

type TabType = 'presets' | 'lofi' | 'spatial' | 'pitch';

export const VoiceChangerModal: React.FC<VoiceChangerModalProps> = ({
  isOpen,
  onClose,
  currentBuffer,
  selection,
  onApply,
  canUndo = false,
  canRedo = false,
  onUndo,
  onRedo,
  undoActionName = '',
  redoActionName = ''
}) => {
  const [activeTab, setActiveTab] = useState<TabType>('presets');
  const [settings, setSettings] = useState<VoiceChangerSettings>(() => ({
    ...DEFAULT_VOICE_SETTINGS,
    scope: selection && selection.end > selection.start ? 'selection' : 'all'
  }));

  const [isPlaying, setIsPlaying] = useState(false);
  const [isBypassed, setIsBypassed] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  // Canvas visualizer refs - battery & iPad GPU friendly
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  const hasSelection = !!(selection && selection.end > selection.start);

  // Sync scope if selection exists when opened
  useEffect(() => {
    if (isOpen) {
      setSettings((prev) => ({
        ...prev,
        scope: hasSelection ? 'selection' : 'all'
      }));
    }
  }, [isOpen, hasSelection]);

  // Global hotkeys inside modal (Ctrl+Z / Ctrl+Y / Cmd+Z / Cmd+Shift+Z)
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName)) {
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        e.stopPropagation();
        if (e.shiftKey) {
          if (canRedo && onRedo) {
            VoiceChangerEngine.stopPreview();
            setIsPlaying(false);
            onRedo();
          }
        } else {
          if (canUndo && onUndo) {
            VoiceChangerEngine.stopPreview();
            setIsPlaying(false);
            onUndo();
          }
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        e.stopPropagation();
        if (canRedo && onRedo) {
          VoiceChangerEngine.stopPreview();
          setIsPlaying(false);
          onRedo();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, canUndo, canRedo, onUndo, onRedo]);

  // When currentBuffer updates (e.g. from undo/redo or apply), halt preview cleanly
  useEffect(() => {
    if (isPlaying) {
      VoiceChangerEngine.stopPreview();
      setIsPlaying(false);
    }
  }, [currentBuffer, isPlaying]);

  // Teardown preview on unmount or close to conserve iPad battery
  useEffect(() => {
    if (!isOpen) {
      VoiceChangerEngine.disposePreview();
      setIsPlaying(false);
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    }
    return () => {
      VoiceChangerEngine.disposePreview();
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isOpen]);

  // Visualizer loop: ONLY executes RAF when actively playing to avoid iPad battery drain
  const startVisualizer = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;

    const analyser = VoiceChangerEngine.getPreviewAnalyser();
    if (!analyser) return;

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    const grad = ctx.createLinearGradient(0, canvas.height, 0, 0);
    grad.addColorStop(0, '#0284c7');
    grad.addColorStop(0.6, '#00f0ff');
    grad.addColorStop(1, '#10b981');
    let lastDraw = 0;
    const minDrawInterval = 1000 / 24;

    const draw = (timestamp: number) => {
      if (!VoiceChangerEngine.isPreviewPlaying()) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        animationFrameRef.current = null;
        return;
      }

      if (document.hidden) {
        animationFrameRef.current = requestAnimationFrame(draw);
        return;
      }

      if (timestamp - lastDraw >= minDrawInterval) {
        lastDraw = timestamp;
        analyser.getByteFrequencyData(dataArray);

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const barWidth = (canvas.width / bufferLength) * 2.2;
        let x = 0;

        ctx.fillStyle = grad;
        for (let i = 0; i < bufferLength; i++) {
          const barHeight = (dataArray[i] / 255) * canvas.height;
          ctx.fillRect(x, canvas.height - barHeight, Math.max(1, barWidth - 1), barHeight);
          x += barWidth;
        }
      }

      animationFrameRef.current = requestAnimationFrame(draw);
    };

    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    animationFrameRef.current = requestAnimationFrame(draw);
  }, []);

  const handleTogglePlay = async () => {
    if (!currentBuffer) return;

    if (isPlaying) {
      VoiceChangerEngine.stopPreview();
      setIsPlaying(false);
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    } else {
      setIsPlaying(true);
      await VoiceChangerEngine.startPreview(
        currentBuffer,
        settings,
        settings.scope === 'selection' ? selection : null,
        isBypassed,
        () => {
          setIsPlaying(false);
          if (animationFrameRef.current !== null) {
            cancelAnimationFrame(animationFrameRef.current);
            animationFrameRef.current = null;
          }
        }
      );
      startVisualizer();
    }
  };

  const handleToggleBypass = async () => {
    const nextBypass = !isBypassed;
    setIsBypassed(nextBypass);
    if (isPlaying && currentBuffer) {
      // Hot-restart preview with bypass state
      await VoiceChangerEngine.startPreview(
        currentBuffer,
        settings,
        settings.scope === 'selection' ? selection : null,
        nextBypass,
        () => setIsPlaying(false)
      );
    }
  };

  const handleApplyPreset = (preset: VoicePreset) => {
    const updated: VoiceChangerSettings = {
      ...DEFAULT_VOICE_SETTINGS,
      ...preset.settings,
      presetId: preset.id,
      scope: settings.scope
    };
    setSettings(updated);

    // If already auditioning, immediately restart audition with new preset
    if (isPlaying && currentBuffer) {
      VoiceChangerEngine.startPreview(
        currentBuffer,
        updated,
        updated.scope === 'selection' ? selection : null,
        isBypassed,
        () => setIsPlaying(false)
      );
    }
  };

  const updateSetting = <K extends keyof VoiceChangerSettings>(
    key: K,
    val: VoiceChangerSettings[K]
  ) => {
    const updated: VoiceChangerSettings = {
      ...settings,
      [key]: val,
      presetId: 'custom'
    };
    setSettings(updated);

    // Live update preview if playing
    if (isPlaying && currentBuffer) {
      VoiceChangerEngine.startPreview(
        currentBuffer,
        updated,
        updated.scope === 'selection' ? selection : null,
        isBypassed,
        () => setIsPlaying(false)
      );
    }
  };

  const handleReset = () => {
    const reset: VoiceChangerSettings = {
      ...DEFAULT_VOICE_SETTINGS,
      scope: hasSelection ? 'selection' : 'all'
    };
    setSettings(reset);
    if (isPlaying && currentBuffer) {
      VoiceChangerEngine.startPreview(
        currentBuffer,
        reset,
        reset.scope === 'selection' ? selection : null,
        isBypassed,
        () => setIsPlaying(false)
      );
    }
  };

  const handleApply = async (closeAfter: boolean = false) => {
    VoiceChangerEngine.stopPreview();
    setIsPlaying(false);
    setIsProcessing(true);
    try {
      await onApply(settings);
      if (closeAfter) {
        onClose();
      }
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => {
        VoiceChangerEngine.stopPreview();
        setIsPlaying(false);
        onClose();
      }}
      title="Voice Changer & Acoustic Studio"
      maxWidth="720px"
      footer={
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', flexWrap: 'wrap', gap: 8 }}>
          {/* Global Undo / Redo & Defaults */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => {
                VoiceChangerEngine.stopPreview();
                setIsPlaying(false);
                onUndo?.();
              }}
              disabled={isProcessing || !canUndo}
              title={undoActionName ? `Undo: ${undoActionName} (Ctrl+Z)` : 'Undo (Ctrl+Z)'}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}
            >
              <Undo2 size={13} />
              <span>Undo</span>
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => {
                VoiceChangerEngine.stopPreview();
                setIsPlaying(false);
                onRedo?.();
              }}
              disabled={isProcessing || !canRedo}
              title={redoActionName ? `Redo: ${redoActionName} (Ctrl+Y)` : 'Redo (Ctrl+Y)'}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}
            >
              <Redo2 size={13} />
              <span>Redo</span>
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={handleReset}
              disabled={isProcessing}
              title="Reset all voice parameters to clean defaults"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
            >
              <RotateCcw size={13} />
              <span>Reset Controls</span>
            </button>
          </div>

          {/* Close, Apply (Keep Open), Apply & Close */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                VoiceChangerEngine.stopPreview();
                setIsPlaying(false);
                onClose();
              }}
              disabled={isProcessing}
            >
              Close
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => handleApply(false)}
              disabled={isProcessing || !currentBuffer}
              title="Apply voice FX to audio buffer without closing modal (managed in global undo/redo)"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              <Sparkles size={14} />
              <span>{isProcessing ? 'Processing...' : 'Apply'}</span>
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => handleApply(true)}
              disabled={isProcessing || !currentBuffer}
              title="Apply voice FX to audio buffer and close modal (managed in global undo/redo)"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              <Check size={14} />
              <span>{isProcessing ? 'Processing...' : 'Apply & Close'}</span>
            </button>
          </div>
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* Top Audition & Control Bar */}
        <div
          style={{
            backgroundColor: 'var(--bg-panel)',
            border: '1px solid var(--border-medium)',
            borderRadius: 'var(--radius-md)',
            padding: '10px 14px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            boxShadow: 'var(--shadow-sm)'
          }}
        >
          {/* Audition Player */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              className={`btn ${isPlaying ? 'btn-danger' : 'btn-primary'} btn-sm`}
              onClick={handleTogglePlay}
              disabled={!currentBuffer}
              style={{ minWidth: 96, justifyContent: 'center' }}
            >
              {isPlaying ? (
                <>
                  <Square size={13} fill="currentColor" /> Stop
                </>
              ) : (
                <>
                  <Play size={13} fill="currentColor" /> Audition
                </>
              )}
            </button>

            {/* A/B Bypass Button */}
            <button
              className={`btn ${isBypassed ? 'btn-amber' : 'btn-secondary'} btn-sm`}
              onClick={handleToggleBypass}
              title="Compare Original Audio vs Transformed Voice (A/B Test)"
            >
              <Ear size={14} />
              <span>{isBypassed ? 'Bypassed (Original)' : 'DSP Active'}</span>
            </button>
          </div>

          {/* Real-time mini spectrum visualizer */}
          <div
            style={{
              height: 28,
              width: 140,
              backgroundColor: 'var(--bg-input)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 4,
              overflow: 'hidden',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              position: 'relative'
            }}
          >
            <canvas
              ref={canvasRef}
              width={140}
              height={28}
              style={{
                width: '100%',
                height: '100%',
                display: 'block'
              }}
            />
            {!isPlaying && (
              <span
                style={{
                  position: 'absolute',
                  fontSize: 'calc(9.5px * var(--ui-font-scale, 1))',
                  color: 'var(--text-muted)',
                  pointerEvents: 'none'
                }}
              >
                Spectrum Idle
              </span>
            )}
          </div>

          {/* Scope Selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 'calc(11px * var(--ui-font-scale, 1))', color: 'var(--text-muted)' }}>
              Scope:
            </span>
            <div style={{ display: 'inline-flex', borderRadius: 'var(--radius-sm)', overflow: 'hidden', border: '1px solid var(--border-medium)' }}>
              <button
                type="button"
                className={`btn btn-sm ${settings.scope === 'all' ? 'btn-primary' : 'btn-ghost'}`}
                style={{ height: 26, padding: '0 8px', fontSize: 'calc(11px * var(--ui-font-scale, 1))' }}
                onClick={() => updateSetting('scope', 'all')}
              >
                Full Track
              </button>
              <button
                type="button"
                className={`btn btn-sm ${settings.scope === 'selection' ? 'btn-primary' : 'btn-ghost'}`}
                style={{ height: 26, padding: '0 8px', fontSize: 'calc(11px * var(--ui-font-scale, 1))' }}
                disabled={!hasSelection}
                onClick={() => updateSetting('scope', 'selection')}
                title={hasSelection ? 'Apply only to selected range' : 'Select a range on waveform first'}
              >
                Selection {hasSelection ? `(${selection!.start.toFixed(1)}s - ${selection!.end.toFixed(1)}s)` : ''}
              </button>
            </div>
          </div>
        </div>

        {/* Global Undo State Pill if active buffer has a Voice FX entry */}
        {undoActionName && undoActionName.includes('Voice FX') && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '7px 12px',
              backgroundColor: 'rgba(56, 189, 248, 0.08)',
              border: '1px solid rgba(56, 189, 248, 0.25)',
              borderRadius: 'var(--radius-sm)',
              fontSize: 'calc(11.5px * var(--ui-font-scale, 1))',
              color: 'var(--text-primary)'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <Zap size={13} color="var(--accent-cyan, #06b6d4)" />
              <span>Active in buffer: <strong>{undoActionName}</strong></span>
              <span style={{ color: 'var(--text-muted)', fontSize: 'calc(10.5px * var(--ui-font-scale, 1))' }}>
                (managed with global redo/undo)
              </span>
            </div>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              style={{ height: 24, padding: '0 8px', fontSize: 'calc(11px * var(--ui-font-scale, 1))', color: 'var(--accent-cyan, #06b6d4)' }}
              onClick={() => {
                VoiceChangerEngine.stopPreview();
                setIsPlaying(false);
                onUndo?.();
              }}
              title="Undo this voice transformation (Ctrl+Z)"
            >
              <Undo2 size={12} /> Undo FX
            </button>
          </div>
        )}

        {/* Tab Navigation */}
        <div
          style={{
            display: 'flex',
            gap: 6,
            borderBottom: '1px solid var(--border-subtle)',
            paddingBottom: 4
          }}
        >
          <button
            type="button"
            className={`btn btn-sm ${activeTab === 'presets' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setActiveTab('presets')}
          >
            <Sparkles size={14} /> Presets & Styles
          </button>
          <button
            type="button"
            className={`btn btn-sm ${activeTab === 'lofi' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setActiveTab('lofi')}
          >
            <Disc size={14} /> 1. Lo-Fi Suite
          </button>
          <button
            type="button"
            className={`btn btn-sm ${activeTab === 'spatial' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setActiveTab('spatial')}
          >
            <Waves size={14} /> 2. Spatial & Environments
          </button>
          <button
            type="button"
            className={`btn btn-sm ${activeTab === 'pitch' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setActiveTab('pitch')}
          >
            <Bot size={14} /> Pitch & Robot Mod
          </button>
        </div>

        {/* TAB 1: PRESETS */}
        {activeTab === 'presets' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* Category: Lo-Fi */}
            <div>
              <div style={{ fontSize: 'calc(11.5px * var(--ui-font-scale, 1))', fontWeight: 700, color: 'var(--accent-amber)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Lo-Fi & Vintage Telephony
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: 8 }}>
                {VOICE_PRESETS.filter((p) => p.category === 'lofi').map((preset) => {
                  const isSelected = settings.presetId === preset.id;
                  return (
                    <div
                      key={preset.id}
                      onClick={() => handleApplyPreset(preset)}
                      style={{
                        backgroundColor: isSelected ? 'var(--bg-surface-active)' : 'var(--bg-surface)',
                        border: `1px solid ${isSelected ? 'var(--accent-cyan)' : 'var(--border-subtle)'}`,
                        borderRadius: 'var(--radius-md)',
                        padding: '10px 12px',
                        cursor: 'pointer',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 4,
                        transition: 'all 0.15s ease',
                        boxShadow: isSelected ? '0 0 0 1px var(--accent-cyan-glow)' : 'none'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, fontSize: 'calc(12px * var(--ui-font-scale, 1))', color: 'var(--text-primary)' }}>
                          <Disc size={13} color="var(--accent-amber)" />
                          {preset.name}
                        </div>
                        {isSelected && <Check size={14} color="var(--accent-cyan)" />}
                      </div>
                      <div style={{ fontSize: 'calc(10.5px * var(--ui-font-scale, 1))', color: 'var(--text-muted)', lineHeight: 1.4 }}>
                        {preset.description}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Category: Spatial Environments */}
            <div>
              <div style={{ fontSize: 'calc(11.5px * var(--ui-font-scale, 1))', fontWeight: 700, color: 'var(--accent-cyan)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Spatial & Acoustic Environments
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: 8 }}>
                {VOICE_PRESETS.filter((p) => p.category === 'spatial').map((preset) => {
                  const isSelected = settings.presetId === preset.id;
                  return (
                    <div
                      key={preset.id}
                      onClick={() => handleApplyPreset(preset)}
                      style={{
                        backgroundColor: isSelected ? 'var(--bg-surface-active)' : 'var(--bg-surface)',
                        border: `1px solid ${isSelected ? 'var(--accent-cyan)' : 'var(--border-subtle)'}`,
                        borderRadius: 'var(--radius-md)',
                        padding: '10px 12px',
                        cursor: 'pointer',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 4,
                        transition: 'all 0.15s ease',
                        boxShadow: isSelected ? '0 0 0 1px var(--accent-cyan-glow)' : 'none'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, fontSize: 'calc(12px * var(--ui-font-scale, 1))', color: 'var(--text-primary)' }}>
                          <Waves size={13} color="var(--accent-cyan)" />
                          {preset.name}
                        </div>
                        {isSelected && <Check size={14} color="var(--accent-cyan)" />}
                      </div>
                      <div style={{ fontSize: 'calc(10.5px * var(--ui-font-scale, 1))', color: 'var(--text-muted)', lineHeight: 1.4 }}>
                        {preset.description}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Category: Character Voices */}
            <div>
              <div style={{ fontSize: 'calc(11.5px * var(--ui-font-scale, 1))', fontWeight: 700, color: 'var(--accent-emerald)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Vocal Characters & Ring Mod
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: 8 }}>
                {VOICE_PRESETS.filter((p) => p.category === 'character').map((preset) => {
                  const isSelected = settings.presetId === preset.id;
                  return (
                    <div
                      key={preset.id}
                      onClick={() => handleApplyPreset(preset)}
                      style={{
                        backgroundColor: isSelected ? 'var(--bg-surface-active)' : 'var(--bg-surface)',
                        border: `1px solid ${isSelected ? 'var(--accent-cyan)' : 'var(--border-subtle)'}`,
                        borderRadius: 'var(--radius-md)',
                        padding: '10px 12px',
                        cursor: 'pointer',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 4,
                        transition: 'all 0.15s ease',
                        boxShadow: isSelected ? '0 0 0 1px var(--accent-cyan-glow)' : 'none'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, fontSize: 'calc(12px * var(--ui-font-scale, 1))', color: 'var(--text-primary)' }}>
                          <Bot size={13} color="var(--accent-emerald)" />
                          {preset.name}
                        </div>
                        {isSelected && <Check size={14} color="var(--accent-cyan)" />}
                      </div>
                      <div style={{ fontSize: 'calc(10.5px * var(--ui-font-scale, 1))', color: 'var(--text-muted)', lineHeight: 1.4 }}>
                        {preset.description}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: LO-FI SUITE */}
        {activeTab === 'lofi' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* Bandpass Communication Filter Selector */}
            <div
              style={{
                backgroundColor: 'var(--bg-surface)',
                padding: '12px 14px',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-subtle)',
                display: 'flex',
                flexDirection: 'column',
                gap: 8
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, fontSize: 'calc(12px * var(--ui-font-scale, 1))' }}>
                <Radio size={14} color="var(--accent-amber)" />
                Communication & Acoustic Medium Filter
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {(
                  [
                    { id: 'none', label: 'Bypass (Full Band)' },
                    { id: 'telephone', label: 'Telephone (300-3400Hz)' },
                    { id: 'walkie-talkie', label: 'Walkie-Talkie (Resonant)' },
                    { id: 'megaphone', label: 'Megaphone Bullhorn' },
                    { id: 'am-radio', label: 'AM Shortwave Radio' },
                    { id: 'underwater', label: 'Underwater Muffled' },
                    { id: 'behind-wall', label: 'Behind the Wall' }
                  ] as { id: VoiceChangerBandpass; label: string }[]
                ).map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    className={`btn btn-sm ${settings.bandpass === b.id ? 'btn-primary' : 'btn-secondary'}`}
                    onClick={() => updateSetting('bandpass', b.id)}
                    style={{ fontSize: 'calc(11px * var(--ui-font-scale, 1))' }}
                  >
                    {b.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Bitcrusher & Sample Rate Decimator */}
            <div
              style={{
                backgroundColor: 'var(--bg-surface)',
                padding: '12px 14px',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-subtle)',
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                gap: 16
              }}
            >
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: 'calc(11.5px * var(--ui-font-scale, 1))', fontWeight: 600 }}>
                    Bit-Depth Reduction (Bitcrusher)
                  </span>
                  <span className="mono" style={{ color: 'var(--accent-cyan)', fontSize: 'calc(11px * var(--ui-font-scale, 1))' }}>
                    {settings.bitDepth >= 16 ? '16-bit (Clean)' : `${settings.bitDepth}-bit`}
                  </span>
                </div>
                <input
                  type="range"
                  className="custom-slider"
                  min={4}
                  max={16}
                  step={1}
                  value={settings.bitDepth}
                  onChange={(e) => updateSetting('bitDepth', parseInt(e.target.value, 10))}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'calc(9.5px * var(--ui-font-scale, 1))', color: 'var(--text-muted)' }}>
                  <span>4-bit (Chiptune)</span>
                  <span>8-bit (Retro)</span>
                  <span>16-bit (Clean)</span>
                </div>
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: 'calc(11.5px * var(--ui-font-scale, 1))', fontWeight: 600 }}>
                    Sample Rate Decimator
                  </span>
                  <span className="mono" style={{ color: 'var(--accent-cyan)', fontSize: 'calc(11px * var(--ui-font-scale, 1))' }}>
                    {settings.sampleRateKhz >= 44 ? '44.1 kHz (Hi-Fi)' : `${settings.sampleRateKhz} kHz`}
                  </span>
                </div>
                <input
                  type="range"
                  className="custom-slider"
                  min={4}
                  max={44}
                  step={4}
                  value={settings.sampleRateKhz}
                  onChange={(e) => updateSetting('sampleRateKhz', parseInt(e.target.value, 10))}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'calc(9.5px * var(--ui-font-scale, 1))', color: 'var(--text-muted)' }}>
                  <span>4 kHz (Lo-Res)</span>
                  <span>16 kHz</span>
                  <span>44 kHz (Studio)</span>
                </div>
              </div>
            </div>

            {/* Analog Grit, Saturation & Noise */}
            <div
              style={{
                backgroundColor: 'var(--bg-surface)',
                padding: '12px 14px',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-subtle)',
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: 14
              }}
            >
              <Slider
                label="Vinyl Dust & Micro-Crackle"
                value={Math.round(settings.vinylCrackle * 100)}
                min={0}
                max={100}
                step={5}
                unit="%"
                onChange={(v) => updateSetting('vinylCrackle', v / 100)}
              />

              <Slider
                label="Tape Saturation (Drive)"
                value={Math.round(settings.tapeSaturation * 100)}
                min={0}
                max={100}
                step={5}
                unit="%"
                onChange={(v) => updateSetting('tapeSaturation', v / 100)}
              />

              <Slider
                label="Tape Wow & Flutter (Wobble)"
                value={Math.round(settings.tapeFlutter * 100)}
                min={0}
                max={100}
                step={5}
                unit="%"
                onChange={(v) => updateSetting('tapeFlutter', v / 100)}
              />
            </div>
          </div>
        )}

        {/* TAB 3: SPATIAL & ENVIRONMENTS */}
        {activeTab === 'spatial' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* Environment Picker Grid */}
            <div
              style={{
                backgroundColor: 'var(--bg-surface)',
                padding: '12px 14px',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-subtle)',
                display: 'flex',
                flexDirection: 'column',
                gap: 8
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, fontSize: 'calc(12px * var(--ui-font-scale, 1))' }}>
                <Waves size={14} color="var(--accent-cyan)" />
                Acoustic Space Selection
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 6 }}>
                {(
                  [
                    { id: 'none', label: 'Dry / No Room', icon: Volume2 },
                    { id: 'cathedral', label: 'Cathedral', icon: ChurchIcon },
                    { id: 'bathroom', label: 'Tiled Bathroom', icon: Bath },
                    { id: 'warehouse', label: 'Warehouse', icon: Warehouse },
                    { id: 'hall', label: 'Concert Hall', icon: Music },
                    { id: 'underwater', label: 'Underwater', icon: Waves },
                    { id: 'behind-wall', label: 'Behind Wall', icon: Building },
                    { id: 'cosmic-void', label: 'Cosmic Void', icon: Zap }
                  ] as { id: VoiceChangerEnvironment; label: string; icon: React.ComponentType<{ size?: number }> }[]
                ).map((env) => {
                  const Icon = env.icon;
                  const isSelected = settings.environment === env.id;
                  return (
                    <button
                      key={env.id}
                      type="button"
                      className={`btn btn-sm ${isSelected ? 'btn-primary' : 'btn-secondary'}`}
                      onClick={() => {
                        let decay = settings.reverbDecay;
                        let damping = settings.reverbDamping;
                        let mix = settings.reverbMix === 0 ? 0.5 : settings.reverbMix;

                        if (env.id === 'cathedral') { decay = 4.2; damping = 5000; }
                        else if (env.id === 'bathroom') { decay = 0.5; damping = 14000; }
                        else if (env.id === 'warehouse') { decay = 3.0; damping = 4000; }
                        else if (env.id === 'hall') { decay = 2.2; damping = 7500; }
                        else if (env.id === 'underwater') { decay = 1.6; damping = 900; }
                        else if (env.id === 'behind-wall') { decay = 0.9; damping = 600; }
                        else if (env.id === 'cosmic-void') { decay = 5.0; damping = 6500; }
                        else if (env.id === 'none') { mix = 0; }

                        const updated: VoiceChangerSettings = {
                          ...settings,
                          environment: env.id,
                          reverbDecay: decay,
                          reverbDamping: damping,
                          reverbMix: mix,
                          presetId: 'custom'
                        };
                        setSettings(updated);

                        if (isPlaying && currentBuffer) {
                          VoiceChangerEngine.startPreview(
                            currentBuffer,
                            updated,
                            updated.scope === 'selection' ? selection : null,
                            isBypassed,
                            () => setIsPlaying(false)
                          );
                        }
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'flex-start',
                        gap: 6,
                        height: 34,
                        padding: '0 8px',
                        fontSize: 'calc(11px * var(--ui-font-scale, 1))'
                      }}
                    >
                      <Icon size={14} />
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {env.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Reverb & Space Parameters */}
            <div
              style={{
                backgroundColor: 'var(--bg-surface)',
                padding: '12px 14px',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-subtle)',
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: 14
              }}
            >
              <Slider
                label="Environment Reverb Wet Mix"
                value={Math.round(settings.reverbMix * 100)}
                min={0}
                max={100}
                step={5}
                unit="%"
                onChange={(v) => updateSetting('reverbMix', v / 100)}
              />

              <Slider
                label="Decay Time (Tail Length)"
                value={settings.reverbDecay}
                min={0.2}
                max={5.0}
                step={0.1}
                unit="s"
                onChange={(v) => updateSetting('reverbDecay', v)}
              />

              <Slider
                label="Air Damping / High Cut"
                value={settings.reverbDamping}
                min={500}
                max={16000}
                step={250}
                unit="Hz"
                onChange={(v) => updateSetting('reverbDamping', v)}
              />

              <Slider
                label="3D Haas Stereo Widener"
                value={Math.round(settings.stereoWidth * 100)}
                min={0}
                max={200}
                step={10}
                unit="%"
                onChange={(v) => updateSetting('stereoWidth', v / 100)}
              />
            </div>
          </div>
        )}

        {/* TAB 4: PITCH & ROBOT MODULATION */}
        {activeTab === 'pitch' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* Pitch Shift Controls */}
            <div
              style={{
                backgroundColor: 'var(--bg-surface)',
                padding: '12px 14px',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-subtle)',
                display: 'flex',
                flexDirection: 'column',
                gap: 10
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 'calc(12px * var(--ui-font-scale, 1))', fontWeight: 600 }}>
                  Pitch Shift (Semitones)
                </span>
                <span className="mono" style={{ color: 'var(--accent-cyan)', fontSize: 'calc(12px * var(--ui-font-scale, 1))', fontWeight: 700 }}>
                  {settings.pitchSemitones > 0 ? `+${settings.pitchSemitones}` : settings.pitchSemitones} semitones
                </span>
              </div>

              <input
                type="range"
                className="custom-slider"
                min={-12}
                max={12}
                step={1}
                value={settings.pitchSemitones}
                onChange={(e) => updateSetting('pitchSemitones', parseInt(e.target.value, 10))}
              />

              {/* Quick semitone jumpers */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {[
                  { label: '-12 Octave', val: -12 },
                  { label: '-6 Deep Titan', val: -6 },
                  { label: '-3 Minor', val: -3 },
                  { label: '0 Normal', val: 0 },
                  { label: '+4 High', val: 4 },
                  { label: '+8 Chipmunk', val: 8 },
                  { label: '+12 Octave Up', val: 12 }
                ].map((item) => (
                  <button
                    key={item.val}
                    type="button"
                    className={`btn btn-sm ${settings.pitchSemitones === item.val ? 'btn-primary' : 'btn-secondary'}`}
                    onClick={() => updateSetting('pitchSemitones', item.val)}
                    style={{ fontSize: 'calc(10.5px * var(--ui-font-scale, 1))', padding: '2px 8px', height: 26 }}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Cyborg Ring Modulator */}
            <div
              style={{
                backgroundColor: 'var(--bg-surface)',
                padding: '12px 14px',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-subtle)',
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: 14
              }}
            >
              <div>
                <Slider
                  label="Ring Mod Carrier Pitch (Robot Voice)"
                  value={settings.ringModFreq}
                  min={0}
                  max={240}
                  step={5}
                  unit="Hz"
                  onChange={(v) => updateSetting('ringModFreq', v)}
                />
                <div style={{ fontSize: 'calc(10px * var(--ui-font-scale, 1))', color: 'var(--text-muted)', marginTop: -6 }}>
                  0 = Off • 40-70Hz Dalek Cyborg • 120-200Hz Alien Tone
                </div>
              </div>

              <div>
                <Slider
                  label="Robot Modulation Intensity"
                  value={Math.round(settings.ringModMix * 100)}
                  min={0}
                  max={100}
                  step={5}
                  unit="%"
                  onChange={(v) => updateSetting('ringModMix', v / 100)}
                />
              </div>
            </div>
          </div>
        )}

        {/* Master Output & Wet/Dry Mixer */}
        <div
          style={{
            backgroundColor: 'var(--bg-panel)',
            padding: '10px 14px',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border-subtle)',
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 14
          }}
        >
          <Slider
            label="Master FX Mix (Wet / Dry)"
            value={Math.round(settings.mix * 100)}
            min={0}
            max={100}
            step={5}
            unit="%"
            onChange={(v) => updateSetting('mix', v / 100)}
          />

          <Slider
            label="Output Level Trim"
            value={settings.outputGainDb}
            min={-12}
            max={12}
            step={0.5}
            unit="dB"
            onChange={(v) => updateSetting('outputGainDb', v)}
          />
        </div>
      </div>
    </Modal>
  );
};

// Simple church icon helper
const ChurchIcon: React.FC<{ size?: number }> = ({ size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10 9h4" />
    <path d="M12 7v5" />
    <path d="M14 22v-4a2 2 0 0 0-4 0v4" />
    <path d="m18 10 3.447 2.298A2 2 0 0 1 22 14.167V20a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-5.833a2 2 0 0 1 .553-1.869L6 10" />
    <path d="m14 7-2-5-2 5" />
    <path d="M6 10v12" />
    <path d="M18 10v12" />
  </svg>
);
