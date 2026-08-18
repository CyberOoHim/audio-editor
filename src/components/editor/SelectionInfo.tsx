import React from 'react';
import { Scissors, Crop, CheckSquare, XSquare, Repeat } from 'lucide-react';
import type { AudioSelection } from '../../types/audio';

export interface SelectionInfoProps {
  selection: AudioSelection | null;
  duration?: number;
  isLooping: boolean;
  onSelectAll: () => void;
  onClearSelection: () => void;
  onToggleLoop: () => void;
  onTrim: () => void;
  onCut: () => void;
}

export const SelectionInfo: React.FC<SelectionInfoProps> = ({
  selection,
  isLooping,
  onSelectAll,
  onClearSelection,
  onToggleLoop,
  onTrim,
  onCut
}) => {
  const formatTime = (sec: number): string => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    const ms = Math.floor((sec % 1) * 1000);
    return `${m}:${s < 10 ? '0' : ''}${s}.${ms < 10 ? '00' : ms < 100 ? '0' : ''}${ms}`;
  };

  const hasSelection = selection && selection.end > selection.start;
  const selLength = hasSelection ? selection.end - selection.start : 0;

  return (
    <div className="selection-info-bar">
      {/* Time stats */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
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
          </>
        ) : (
          <div style={{ color: 'var(--text-muted)', fontSize: 11 }}>
            Tap or drag to select • Swipe or use Pan mode to scroll
          </div>
        )}
      </div>

      {/* Quick Selection Actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
        {hasSelection && (
          <>
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
