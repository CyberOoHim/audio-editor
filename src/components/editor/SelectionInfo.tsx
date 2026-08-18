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
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '6px 12px',
      backgroundColor: 'var(--bg-panel)',
      borderTop: '1px solid var(--border-subtle)',
      fontSize: 12,
      gap: 8,
      flexWrap: 'wrap'
    }}>
      {/* Time stats */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
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
              <span style={{ color: 'var(--text-muted)' }}>Length: </span>
              <span className="mono" style={{ color: 'var(--accent-blue)', fontWeight: 600 }}>{formatTime(selLength)}</span>
            </div>
          </>
        ) : (
          <div style={{ color: 'var(--text-muted)' }}>
            No selection (Click & drag on waveform to select range)
          </div>
        )}
      </div>

      {/* Quick Selection Actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {hasSelection && (
          <>
            <button
              className="btn btn-secondary btn-sm"
              onClick={onTrim}
              title="Trim to selection (Keep only selected audio)"
            >
              <Crop size={13} /> Trim
            </button>
            <button
              className="btn btn-secondary btn-sm"
              onClick={onCut}
              title="Cut selection (Delete selected range)"
            >
              <Scissors size={13} /> Cut
            </button>
            <button
              className="btn btn-ghost btn-sm"
              onClick={onClearSelection}
              title="Clear selection"
            >
              <XSquare size={13} /> Clear
            </button>
          </>
        )}

        <button
          className="btn btn-ghost btn-sm"
          onClick={onSelectAll}
          title="Select entire audio track"
        >
          <CheckSquare size={13} /> Select All
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
          <Repeat size={13} /> Loop
        </button>
      </div>
    </div>
  );
};
