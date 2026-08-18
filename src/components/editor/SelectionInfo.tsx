import React from 'react';
import { Scissors, Crop, CheckSquare, XSquare, Repeat, TrendingUp } from 'lucide-react';
import type { AudioSelection, TimeFormat } from '../../types/audio';

export interface SelectionInfoProps {
  selection: AudioSelection | null;
  duration?: number;
  sampleRate?: number;
  timeFormat?: TimeFormat;
  onToggleTimeFormat?: () => void;
  isLooping: boolean;
  onSelectAll: () => void;
  onClearSelection: () => void;
  onToggleLoop: () => void;
  onTrim: () => void;
  onCut: () => void;
  onFadeSelection?: () => void;
}

export const SelectionInfo: React.FC<SelectionInfoProps> = ({
  selection,
  sampleRate = 44100,
  timeFormat = 'hms',
  onToggleTimeFormat,
  isLooping,
  onSelectAll,
  onClearSelection,
  onToggleLoop,
  onTrim,
  onCut,
  onFadeSelection
}) => {
  const formatTime = (sec: number): string => {
    if (timeFormat === 'seconds') {
      return `${sec.toFixed(3)}s`;
    }
    if (timeFormat === 'samples') {
      return `${Math.floor(sec * sampleRate).toLocaleString()} spl`;
    }
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    const ms = Math.floor((sec % 1) * 1000);
    return `${m}:${s < 10 ? '0' : ''}${s}.${ms < 10 ? '00' : ms < 100 ? '0' : ''}${ms}`;
  };

  const hasSelection = selection && selection.end > selection.start;
  const selLength = hasSelection ? selection.end - selection.start : 0;

  return (
    <div className="selection-info-bar">
      {/* Time stats with format switcher on click */}
      <div
        style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0, cursor: 'pointer' }}
        onClick={onToggleTimeFormat}
        title="Click to toggle time format (Timecode / Seconds / Samples)"
      >
        {hasSelection ? (
          <>
            <div>
              <span style={{ color: 'var(--text-muted)' }}>Start: </span>
              <span className="mono" style={{ color: 'var(--accent-cyan)' }}>{formatTime(selection.start)}</span>
            </div>
            <div>
              <span style={{ color: 'var(--text-muted)' }}>End: </span>
              <span className="mono" style={{ color: 'var(--accent-cyan)' }}>{formatTime(selection.end)}</span>
            </div>
            <div>
              <span style={{ color: 'var(--text-muted)' }}>Len: </span>
              <span className="mono" style={{ color: 'var(--accent-blue)', fontWeight: 600 }}>{formatTime(selLength)}</span>
            </div>
            <span style={{ fontSize: 'var(--font-xs)', color: 'var(--text-muted)', background: 'var(--bg-input)', padding: '1px 5px', borderRadius: 3 }}>
              {timeFormat.toUpperCase()}
            </span>
          </>
        ) : (
          <div style={{ color: 'var(--text-muted)', fontSize: 'var(--font-sm)' }}>
            Tap or drag to select • Click time display to toggle format ({timeFormat.toUpperCase()})
          </div>
        )}
      </div>

      {/* Quick Selection Actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
        {hasSelection && (
          <>
            {onFadeSelection && (
              <button
                className="btn btn-secondary btn-sm"
                onClick={onFadeSelection}
                title="Fade selection with custom duration & curve"
              >
                <TrendingUp size={12} color="var(--accent-emerald)" /> <span className="btn-text-desktop">Fade</span>
              </button>
            )}
            <button
              className="btn btn-secondary btn-sm"
              onClick={onTrim}
              title="Trim to selection"
            >
              <Crop size={12} /> <span className="btn-text-desktop">Trim</span>
            </button>
            <button
              className="btn btn-secondary btn-sm"
              onClick={onCut}
              title="Cut selection"
            >
              <Scissors size={12} /> <span className="btn-text-desktop">Cut</span>
            </button>
            <button
              className="btn btn-ghost btn-sm"
              onClick={onClearSelection}
              title="Clear selection"
            >
              <XSquare size={12} /> <span className="btn-text-desktop">Clear</span>
            </button>
          </>
        )}

        <button
          className="btn btn-ghost btn-sm"
          onClick={onSelectAll}
          title="Select entire audio track"
        >
          <CheckSquare size={12} /> <span className="btn-text-desktop">All</span>
        </button>

        <button
          className="btn btn-sm"
          style={{
            backgroundColor: isLooping ? 'var(--accent-cyan-dim)' : 'transparent',
            color: isLooping ? 'var(--accent-cyan)' : 'var(--text-secondary)'
          }}
          onClick={onToggleLoop}
          title={isLooping ? 'Loop is ON' : 'Toggle Looping'}
        >
          <Repeat size={12} /> <span className="btn-text-desktop">Loop</span>
        </button>
      </div>
    </div>
  );
};
