import React from 'react';
import {
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
  FileX
} from 'lucide-react';
import type { FadeType } from '../../types/audio';

export interface ToolPaletteProps {
  hasSelection: boolean;
  hasBuffer: boolean;
  fadeInDuration: number;
  fadeOutDuration: number;
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
  onOpenGenerator: () => void;
  onClearWorkspace?: () => void;
}

export const ToolPalette: React.FC<ToolPaletteProps> = React.memo(({
  hasSelection,
  hasBuffer,
  fadeInDuration,
  fadeOutDuration,
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
  onOpenGenerator,
  onClearWorkspace
}) => {
  return (
    <div className="editor-toolbar">
      {/* Edit Group */}
      <div className="tool-group">
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
          className="btn btn-primary btn-sm"
          onClick={onOpenEffects}
          disabled={!hasBuffer}
          title="Open EQ, Highpass/Lowpass Filters & Compressor DSP Studio"
        >
          <Sliders size={14} /> Effects & EQ
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
