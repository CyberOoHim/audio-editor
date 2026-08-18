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
  BarChart2
} from 'lucide-react';

export interface ToolPaletteProps {
  hasSelection: boolean;
  onTrim: () => void;
  onCut: () => void;
  onSilence: () => void;
  onInsertSilence: () => void;
  onFadeIn: () => void;
  onFadeOut: () => void;
  onGainModal: () => void;
  onNormalize: (targetDb: number) => void;
  onReverse: () => void;
  onInvert: () => void;
  onSplit: () => void;
  onOpenEffects: () => void;
}

export const ToolPalette: React.FC<ToolPaletteProps> = ({
  hasSelection,
  onTrim,
  onCut,
  onSilence,
  onInsertSilence,
  onFadeIn,
  onFadeOut,
  onGainModal,
  onNormalize,
  onReverse,
  onInvert,
  onSplit,
  onOpenEffects
}) => {
  return (
    <div className="editor-toolbar">
      {/* Edit Group */}
      <div className="tool-group">
        <button
          className="btn btn-secondary btn-sm"
          onClick={onTrim}
          disabled={!hasSelection}
          title="Trim: Keep only the selection and delete the rest"
        >
          <Crop size={14} color="var(--accent-cyan)" /> Trim
        </button>

        <button
          className="btn btn-secondary btn-sm"
          onClick={onCut}
          disabled={!hasSelection}
          title="Cut / Delete selected audio region"
        >
          <Scissors size={14} /> Cut
        </button>

        <button
          className="btn btn-secondary btn-sm"
          onClick={onSilence}
          disabled={!hasSelection}
          title="Mute / Silence selected region"
        >
          <VolumeX size={14} /> Silence
        </button>

        <button
          className="btn btn-secondary btn-sm"
          onClick={onInsertSilence}
          title="Insert silence at playhead position"
        >
          <PlusCircle size={14} /> +Silence
        </button>

        <button
          className="btn btn-secondary btn-sm"
          onClick={onSplit}
          title="Split track at current playhead"
        >
          <Split size={14} /> Split
        </button>
      </div>

      <div className="tool-divider" />

      {/* Fades & Dynamics */}
      <div className="tool-group">
        <button
          className="btn btn-secondary btn-sm"
          onClick={onFadeIn}
          disabled={!hasSelection}
          title="Fade In across selected region"
        >
          <TrendingUp size={14} color="var(--accent-emerald)" /> Fade In
        </button>

        <button
          className="btn btn-secondary btn-sm"
          onClick={onFadeOut}
          disabled={!hasSelection}
          title="Fade Out across selected region"
        >
          <TrendingDown size={14} color="var(--accent-amber)" /> Fade Out
        </button>

        <button
          className="btn btn-secondary btn-sm"
          onClick={onGainModal}
          title="Adjust Gain (Amplification / Attenuation)"
        >
          <Volume2 size={14} /> Gain dB
        </button>

        <button
          className="btn btn-secondary btn-sm"
          onClick={() => onNormalize(0)}
          title="Normalize Peak to 0.0 dBFS"
        >
          <BarChart2 size={14} color="var(--accent-blue)" /> Normalize (0dB)
        </button>
      </div>

      <div className="tool-divider" />

      {/* Transformations & FX */}
      <div className="tool-group">
        <button
          className="btn btn-secondary btn-sm"
          onClick={onReverse}
          title="Reverse audio (playback backwards)"
        >
          <RotateCcw size={14} /> Reverse
        </button>

        <button
          className="btn btn-secondary btn-sm"
          onClick={onInvert}
          title="Invert Phase (flip polarity)"
        >
          <FlipHorizontal size={14} /> Invert
        </button>

        <button
          className="btn btn-primary btn-sm"
          onClick={onOpenEffects}
          title="Open EQ, Filters & Compressor DSP Studio"
        >
          <Sliders size={14} /> Effects & EQ
        </button>
      </div>
    </div>
  );
};
