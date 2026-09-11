import React, { useState, useRef, useEffect } from 'react';
import {
  Undo2,
  Redo2,
  History,
  Check,
  Crop,
  Scissors,
  VolumeX,
  TrendingUp,
  TrendingDown,
  Volume2,
  Sliders,
  RotateCcw,
  FlipHorizontal,
  Split,
  PlusCircle,
  BarChart2,
  Radio,
  SlidersHorizontal,
  FileX,
  Sparkles,
  Mic
} from 'lucide-react';
import type { FadeType } from '../../types/audio';

export interface ToolPaletteProps {
  hasSelection: boolean;
  hasBuffer: boolean;
  canUndo?: boolean;
  canRedo?: boolean;
  undoDescription?: string;
  redoDescription?: string;
  historyList?: { id: string; description: string; timestamp: number; isCurrent: boolean }[];
  onJumpToHistoryIndex?: (index: number) => void;
  memoryUsageInfo?: { usedBytes: number; maxBytes: number; entryCount: number };
  fadeInDuration: number;
  fadeOutDuration: number;
  onUndo?: () => void;
  onRedo?: () => void;
  onTrim: () => void;
  onCut: () => void;
  onSilence: () => void;
  onInsertSilence: () => void;
  onFadeInQuick: () => void;
  onFadeOutQuick: () => void;
  onOpenFadeModal: (type?: FadeType) => void;
  onGainModal: () => void;
  onOpenNormalizeModal: () => void;
  onReverse: () => void;
  onInvert: () => void;
  onSplit: () => void;
  onOpenEffects: () => void;
  onOpenVoiceChanger: () => void;
  onOpenVocalSeparation?: () => void;
  onOpenGenerator: () => void;
  onClearWorkspace?: () => void;
}

export const ToolPalette: React.FC<ToolPaletteProps> = React.memo(({
  hasSelection,
  hasBuffer,
  canUndo = false,
  canRedo = false,
  undoDescription = '',
  redoDescription = '',
  historyList = [],
  onJumpToHistoryIndex,
  memoryUsageInfo,
  fadeInDuration,
  fadeOutDuration,
  onUndo,
  onRedo,
  onTrim,
  onCut,
  onSilence,
  onInsertSilence,
  onFadeInQuick,
  onFadeOutQuick,
  onOpenFadeModal,
  onGainModal,
  onOpenNormalizeModal,
  onReverse,
  onInvert,
  onSplit,
  onOpenEffects,
  onOpenVoiceChanger,
  onOpenVocalSeparation,
  onOpenGenerator,
  onClearWorkspace
}) => {
  const [showHistoryMenu, setShowHistoryMenu] = useState(false);
  const historyMenuRef = useRef<HTMLDivElement>(null);

  // Close history menu on outside click
  useEffect(() => {
    if (!showHistoryMenu) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (historyMenuRef.current && !historyMenuRef.current.contains(e.target as Node)) {
        setShowHistoryMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showHistoryMenu]);

  return (
    <div className="editor-toolbar">
      {/* Edit Group */}
      <div className="tool-group">
        <button
          className="btn btn-secondary btn-sm"
          onClick={onUndo}
          disabled={!canUndo}
          title={undoDescription ? `Undo: ${undoDescription} (Ctrl+Z)` : 'Undo (Ctrl+Z)'}
          aria-label="Undo last action"
        >
          <Undo2 size={14} /> Undo
        </button>

        <button
          className="btn btn-secondary btn-sm"
          onClick={onRedo}
          disabled={!canRedo}
          title={redoDescription ? `Redo: ${redoDescription} (Ctrl+Y)` : 'Redo (Ctrl+Y)'}
          aria-label="Redo action"
        >
          <Redo2 size={14} /> Redo
        </button>

        {/* History Dropdown / Inspector */}
        <div style={{ position: 'relative' }} ref={historyMenuRef}>
          <button
            className={`btn btn-secondary btn-sm ${showHistoryMenu ? 'active' : ''}`}
            onClick={() => setShowHistoryMenu(!showHistoryMenu)}
            disabled={!hasBuffer || historyList.length === 0}
            title="Inspect edit history and jump to any previous state"
            aria-label="View edit history"
          >
            <History size={14} /> History
            {historyList.length > 0 && (
              <span className="mono" style={{ fontSize: 'var(--font-xs)', opacity: 0.8, marginLeft: 2 }}>
                ({historyList.length})
              </span>
            )}
          </button>

          {showHistoryMenu && (
            <div
              style={{
                position: 'absolute',
                top: 'calc(100% + 4px)',
                left: 0,
                zIndex: 1000,
                width: 280,
                maxHeight: 320,
                overflowY: 'auto',
                backgroundColor: 'var(--bg-card, #18181b)',
                border: '1px solid var(--border-subtle, #27272a)',
                borderRadius: 'var(--radius-md, 8px)',
                boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.4)',
                padding: '6px 0',
                display: 'flex',
                flexDirection: 'column'
              }}
            >
              <div
                style={{
                  padding: '6px 12px',
                  fontSize: 'var(--font-xs)',
                  fontWeight: 600,
                  color: 'var(--text-muted)',
                  borderBottom: '1px solid var(--border-subtle)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}
              >
                <span>Edit History</span>
                {memoryUsageInfo && (
                  <span className="mono" style={{ fontSize: 'calc(9.5px * var(--ui-font-scale, 1))', opacity: 0.85 }}>
                    {(memoryUsageInfo.usedBytes / (1024 * 1024)).toFixed(1)}MB / {(memoryUsageInfo.maxBytes / (1024 * 1024)).toFixed(0)}MB
                  </span>
                )}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 1, padding: '4px 0' }}>
                {historyList.map((item, idx) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      if (!item.isCurrent && onJumpToHistoryIndex) {
                        onJumpToHistoryIndex(idx);
                        setShowHistoryMenu(false);
                      }
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '6px 12px',
                      background: item.isCurrent ? 'var(--accent-primary-subtle, rgba(2, 132, 199, 0.15))' : 'transparent',
                      border: 'none',
                      color: item.isCurrent ? 'var(--accent-cyan, #38bdf8)' : 'var(--text-main)',
                      fontWeight: item.isCurrent ? 600 : 400,
                      fontSize: 'var(--font-sm)',
                      cursor: item.isCurrent ? 'default' : 'pointer',
                      textAlign: 'left',
                      width: '100%',
                      transition: 'background 0.15s ease'
                    }}
                    onMouseEnter={(e) => {
                      if (!item.isCurrent) (e.currentTarget as HTMLElement).style.background = 'var(--bg-card-hover, rgba(255, 255, 255, 0.05))';
                    }}
                    onMouseLeave={(e) => {
                      if (!item.isCurrent) (e.currentTarget as HTMLElement).style.background = 'transparent';
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, overflow: 'hidden' }}>
                      <span className="mono" style={{ fontSize: 'var(--font-xs)', opacity: 0.5, minWidth: 18 }}>
                        #{idx + 1}
                      </span>
                      <span style={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                        {item.description}
                      </span>
                    </div>
                    {item.isCurrent && (
                      <Check size={13} style={{ color: 'var(--accent-cyan, #38bdf8)', flexShrink: 0, marginLeft: 6 }} />
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <button
          className="btn btn-secondary btn-sm"
          onClick={onTrim}
          disabled={!hasSelection || !hasBuffer}
          title="Trim: Keep only the selection and delete the rest"
        >
          <Crop size={14} color="var(--accent-cyan)" /> Trim
        </button>

        <button
          className="btn btn-secondary btn-sm"
          onClick={onCut}
          disabled={!hasSelection || !hasBuffer}
          title="Cut / Delete selected audio region"
        >
          <Scissors size={14} /> Cut
        </button>

        <button
          className="btn btn-secondary btn-sm"
          onClick={onSilence}
          disabled={!hasSelection || !hasBuffer}
          title="Mute / Silence selected region"
        >
          <VolumeX size={14} /> Silence
        </button>

        <button
          className="btn btn-secondary btn-sm"
          onClick={onInsertSilence}
          disabled={!hasBuffer}
          title="Insert customizable silence gap at playhead or bounds"
        >
          <PlusCircle size={14} /> +Silence
        </button>

        <button
          className="btn btn-secondary btn-sm"
          onClick={onOpenGenerator}
          title="Synthesize test tones (Sine, Square, Triangle, Noise)"
        >
          <Radio size={14} color="var(--accent-cyan)" /> +Signal
        </button>

        <button
          className="btn btn-secondary btn-sm"
          onClick={onSplit}
          disabled={!hasBuffer}
          title="Split track at current playhead"
        >
          <Split size={14} /> Split
        </button>
      </div>

      <div className="tool-divider" />

      {/* Fades & Dynamics Group */}
      <div className="tool-group">
        <button
          className="btn btn-secondary btn-sm"
          onClick={onFadeInQuick}
          disabled={!hasBuffer}
          title={
            hasSelection
              ? 'Quick Fade In over selection'
              : `Quick Fade In at start (${fadeInDuration.toFixed(1)}s)`
          }
        >
          <TrendingUp size={14} color="var(--accent-emerald)" />
          <span>Fade In</span>
          <span style={{ fontSize: 'var(--font-xs)', opacity: 0.7, marginLeft: -2 }}>
            {hasSelection ? 'Sel' : `${fadeInDuration}s`}
          </span>
        </button>

        <button
          className="btn btn-secondary btn-sm"
          onClick={onFadeOutQuick}
          disabled={!hasBuffer}
          title={
            hasSelection
              ? 'Quick Fade Out over selection'
              : `Quick Fade Out at end (${fadeOutDuration.toFixed(1)}s)`
          }
        >
          <TrendingDown size={14} color="var(--accent-amber)" />
          <span>Fade Out</span>
          <span style={{ fontSize: 'var(--font-xs)', opacity: 0.7, marginLeft: -2 }}>
            {hasSelection ? 'Sel' : `${fadeOutDuration}s`}
          </span>
        </button>

        <button
          className="btn btn-secondary btn-sm"
          onClick={() => onOpenFadeModal(hasSelection ? 'in' : 'in')}
          disabled={!hasBuffer}
          title="Configure custom fade duration, curve shapes & position"
        >
          <SlidersHorizontal size={13} color="var(--accent-cyan)" /> Fade...
        </button>

        <button
          className="btn btn-secondary btn-sm"
          onClick={onGainModal}
          disabled={!hasBuffer}
          title="Adjust Gain (Amplification / Attenuation)"
        >
          <Volume2 size={14} /> Gain dB
        </button>

        <button
          className="btn btn-secondary btn-sm"
          onClick={onOpenNormalizeModal}
          disabled={!hasBuffer}
          title="Normalize Peak Amplitude (True Peak, -1dB Streaming, 0dBFS)"
        >
          <BarChart2 size={14} color="var(--accent-blue)" /> Normalize...
        </button>
      </div>

      <div className="tool-divider" />

      {/* Transformations & FX */}
      <div className="tool-group">
        <button
          className="btn btn-secondary btn-sm"
          onClick={onReverse}
          disabled={!hasBuffer}
          title="Reverse audio (playback backwards)"
        >
          <RotateCcw size={14} /> Reverse
        </button>

        <button
          className="btn btn-secondary btn-sm"
          onClick={onInvert}
          disabled={!hasBuffer}
          title="Invert Phase (flip polarity)"
        >
          <FlipHorizontal size={14} /> Invert
        </button>

        <button
          className="btn btn-secondary btn-sm"
          onClick={onOpenEffects}
          disabled={!hasBuffer}
          title="Open EQ, Highpass/Lowpass Filters & Compressor DSP Studio"
        >
          <Sliders size={14} /> Effects & EQ
        </button>

        <button
          className="btn btn-primary btn-sm"
          onClick={onOpenVoiceChanger}
          disabled={!hasBuffer}
          title="Open Voice Changer Studio (Lo-Fi, Spatial Environments & Character Voice Effects)"
          style={{
            background: 'linear-gradient(135deg, #0284c7, #8b5cf6)',
            borderColor: 'rgba(139, 92, 246, 0.4)',
            color: '#ffffff'
          }}
        >
          <Sparkles size={14} /> Voice Changer
        </button>

        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={onOpenVocalSeparation}
          disabled={!hasBuffer}
          title="On-Device Vocal & Stem Separation (Vocals Only or Background Music Only via iPad GPU)"
          style={{
            background: 'linear-gradient(135deg, rgba(13, 148, 136, 0.25), rgba(2, 132, 199, 0.25))',
            borderColor: 'rgba(20, 184, 166, 0.45)',
            color: '#2dd4bf'
          }}
        >
          <Mic size={14} /> Vocal Separation
        </button>
      </div>

      <div className="tool-divider" />

      {/* Workspace Management */}
      <div className="tool-group">
        <button
          className="btn btn-ghost btn-sm"
          onClick={onClearWorkspace}
          disabled={!hasBuffer}
          title="Clear Workspace: Reset audio editor back to upload modal"
        >
          <FileX size={14} color={hasBuffer ? 'var(--accent-rose)' : undefined} />
          <span>Clear Workspace</span>
        </button>
      </div>
    </div>
  );
});
ToolPalette.displayName = 'ToolPalette';
