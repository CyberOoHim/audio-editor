import React, { useState, useEffect } from 'react';
import { Clock, CheckSquare, ArrowRight, Sparkles, ZoomIn, X } from 'lucide-react';
import { Modal } from '../common/Modal';
import type { AudioSelection } from '../../types/audio';

export interface SetRangeModalProps {
  isOpen: boolean;
  onClose: () => void;
  duration: number;
  currentTime: number;
  viewportStart: number;
  viewportEnd: number;
  selection: AudioSelection | null;
  onApplySelection: (selection: AudioSelection | null, centerViewport?: boolean) => void;
}

export const SetRangeModal: React.FC<SetRangeModalProps> = ({
  isOpen,
  onClose,
  duration,
  currentTime,
  viewportStart,
  viewportEnd,
  selection,
  onApplySelection
}) => {
  const [startStr, setStartStr] = useState<string>('00:00.000');
  const [endStr, setEndStr] = useState<string>('00:00.000');
  const [centerInView, setCenterInView] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Time format helper (sec to MM:SS.mmm or HH:MM:SS.mmm)
  const formatTimeToString = (sec: number): string => {
    const clamped = Math.max(0, Math.min(duration, sec));
    const h = Math.floor(clamped / 3600);
    const m = Math.floor((clamped % 3600) / 60);
    const s = Math.floor(clamped % 60);
    const ms = Math.floor((clamped % 1) * 1000);
    const msStr = ms < 10 ? `00${ms}` : ms < 100 ? `0${ms}` : `${ms}`;
    const sStr = s < 10 ? `0${s}` : `${s}`;
    if (h > 0) {
      const mStr = m < 10 ? `0${m}` : `${m}`;
      return `${h}:${mStr}:${sStr}.${msStr}`;
    }
    return `${m}:${sStr}.${msStr}`;
  };

  // Parse time string to seconds
  const parseStringToTime = (val: string): number | null => {
    const trimmed = val.trim();
    if (!trimmed) return null;

    // Direct numeric seconds or samples
    if (/^\d+(\.\d+)?$/.test(trimmed)) {
      return parseFloat(trimmed);
    }

    // HH:MM:SS.mmm or MM:SS.mmm
    const parts = trimmed.split(':');
    if (parts.length === 2) {
      const min = parseFloat(parts[0]);
      const sec = parseFloat(parts[1]);
      if (!isNaN(min) && !isNaN(sec)) {
        return min * 60 + sec;
      }
    } else if (parts.length === 3) {
      const hr = parseFloat(parts[0]);
      const min = parseFloat(parts[1]);
      const sec = parseFloat(parts[2]);
      if (!isNaN(hr) && !isNaN(min) && !isNaN(sec)) {
        return hr * 3600 + min * 60 + sec;
      }
    }
    return null;
  };

  // Sync inputs when modal opens
  useEffect(() => {
    if (isOpen) {
      setErrorMessage(null);
      if (selection && selection.end > selection.start) {
        setStartStr(formatTimeToString(selection.start));
        setEndStr(formatTimeToString(selection.end));
      } else {
        // Default to playhead or whole track
        setStartStr(formatTimeToString(Math.max(0, currentTime)));
        setEndStr(formatTimeToString(Math.min(duration, currentTime + 10)));
      }
    }
  }, [isOpen, selection, currentTime, duration]);

  const handleApply = () => {
    setErrorMessage(null);
    const parsedStart = parseStringToTime(startStr);
    const parsedEnd = parseStringToTime(endStr);

    if (parsedStart === null || isNaN(parsedStart) || parsedStart < 0) {
      setErrorMessage('Please enter a valid Start Time (e.g. 0:00.000 or 12.5)');
      return;
    }

    if (parsedEnd === null || isNaN(parsedEnd) || parsedEnd <= 0) {
      setErrorMessage('Please enter a valid End Time (e.g. 1:30.000 or 90.0)');
      return;
    }

    if (parsedEnd <= parsedStart) {
      setErrorMessage('End Time must be strictly greater than Start Time.');
      return;
    }

    const finalStart = Math.max(0, Math.min(duration, parsedStart));
    const finalEnd = Math.max(0, Math.min(duration, parsedEnd));

    if (finalEnd - finalStart <= 0.005) {
      setErrorMessage('Selection duration must be at least 5 milliseconds.');
      return;
    }

    onApplySelection({ start: finalStart, end: finalEnd }, centerInView);
    onClose();
  };

  const handleSetEntireTrack = () => {
    setStartStr(formatTimeToString(0));
    setEndStr(formatTimeToString(duration));
    setErrorMessage(null);
  };

  const handleSetStartToPlayhead = () => {
    setStartStr(formatTimeToString(0));
    setEndStr(formatTimeToString(currentTime));
    setErrorMessage(null);
  };

  const handleSetPlayheadToEnd = () => {
    setStartStr(formatTimeToString(currentTime));
    setEndStr(formatTimeToString(duration));
    setErrorMessage(null);
  };

  const handleSetViewport = () => {
    setStartStr(formatTimeToString(viewportStart));
    setEndStr(formatTimeToString(viewportEnd));
    setErrorMessage(null);
  };

  const handleAddDurationFromPlayhead = (sec: number) => {
    setStartStr(formatTimeToString(currentTime));
    setEndStr(formatTimeToString(Math.min(duration, currentTime + sec)));
    setErrorMessage(null);
  };

  const currentParsedStart = parseStringToTime(startStr);
  const currentParsedEnd = parseStringToTime(endStr);
  const calculatedLen =
    currentParsedStart !== null && currentParsedEnd !== null && currentParsedEnd > currentParsedStart
      ? currentParsedEnd - currentParsedStart
      : null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Set Audio Selection Range" maxWidth="520px">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Helper Description */}
        <p style={{ margin: 0, fontSize: 'var(--font-sm)', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
          Specify start and end timecodes to select any audio period across the entire file. Supports MM:SS.mmm,
          HH:MM:SS, or seconds.
        </p>

        {/* Time Inputs Row */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', gap: 12 }}>
          <div className="input-group">
            <label className="input-label" style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <Clock size={13} color="var(--accent-cyan)" />
              <span>Start Time</span>
            </label>
            <input
              type="text"
              className="input-field mono"
              value={startStr}
              onChange={(e) => {
                setStartStr(e.target.value);
                setErrorMessage(null);
              }}
              placeholder="0:00.000"
              style={{ fontSize: 'var(--font-base)', fontWeight: 600 }}
              autoFocus
            />
          </div>

          <div style={{ paddingTop: 20, color: 'var(--text-muted)' }}>
            <ArrowRight size={18} />
          </div>

          <div className="input-group">
            <label className="input-label" style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <Clock size={13} color="var(--accent-blue)" />
              <span>End Time</span>
            </label>
            <input
              type="text"
              className="input-field mono"
              value={endStr}
              onChange={(e) => {
                setEndStr(e.target.value);
                setErrorMessage(null);
              }}
              placeholder={formatTimeToString(duration)}
              style={{ fontSize: 'var(--font-base)', fontWeight: 600 }}
            />
          </div>
        </div>

        {/* Length info banner */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '8px 12px',
            backgroundColor: 'var(--bg-card)',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border-subtle)',
            fontSize: 'var(--font-sm)'
          }}
        >
          <span style={{ color: 'var(--text-muted)' }}>Calculated Length:</span>
          <span className="mono" style={{ color: calculatedLen ? 'var(--accent-cyan)' : 'var(--text-muted)', fontWeight: 600 }}>
            {calculatedLen !== null ? `${calculatedLen.toFixed(3)}s (${formatTimeToString(calculatedLen)})` : '—'}
          </span>
        </div>

        {/* Error message */}
        {errorMessage && (
          <div
            style={{
              padding: '8px 12px',
              backgroundColor: 'rgba(239, 68, 68, 0.15)',
              border: '1px solid var(--accent-red)',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--accent-red)',
              fontSize: 'var(--font-xs)',
              fontWeight: 500
            }}
          >
            {errorMessage}
          </div>
        )}

        {/* Quick Presets Section */}
        <div>
          <label className="input-label" style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 8 }}>
            <Sparkles size={13} color="var(--accent-yellow)" />
            <span>Quick Range Presets</span>
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 8 }}>
            <button
              type="button"
              className="btn btn-secondary btn-xs"
              onClick={handleSetEntireTrack}
              title="Select 0:00 to End of Audio"
            >
              <CheckSquare size={12} />
              <span>Entire Track</span>
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-xs"
              onClick={handleSetStartToPlayhead}
              title="Select from 0:00 to Current Playhead"
            >
              <span>0:00 → Playhead</span>
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-xs"
              onClick={handleSetPlayheadToEnd}
              title="Select from Current Playhead to Track End"
            >
              <span>Playhead → End</span>
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-xs"
              onClick={handleSetViewport}
              title="Select the currently visible zoom window"
            >
              <span>Visible Viewport</span>
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-xs"
              onClick={() => handleAddDurationFromPlayhead(10)}
            >
              <span>+10s from Cursor</span>
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-xs"
              onClick={() => handleAddDurationFromPlayhead(30)}
            >
              <span>+30s from Cursor</span>
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-xs"
              onClick={() => handleAddDurationFromPlayhead(60)}
            >
              <span>+1 min from Cursor</span>
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-xs"
              onClick={() => handleAddDurationFromPlayhead(300)}
            >
              <span>+5 min from Cursor</span>
            </button>
          </div>
        </div>

        {/* Center viewport checkbox */}
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 'var(--font-sm)', color: 'var(--text-secondary)' }}>
          <input
            type="checkbox"
            checked={centerInView}
            onChange={(e) => setCenterInView(e.target.checked)}
            style={{ accentColor: 'var(--accent-cyan)' }}
          />
          <ZoomIn size={14} color="var(--text-muted)" />
          <span>Scroll and fit waveform viewport to this selection</span>
        </label>
      </div>

      {/* Modal Footer */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
          Cancel
        </button>
        {selection && (
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => {
              onApplySelection(null);
              onClose();
            }}
          >
            <X size={13} />
            <span>Clear Selection</span>
          </button>
        )}
        <button type="button" className="btn btn-primary btn-sm" onClick={handleApply}>
          <CheckSquare size={13} />
          <span>Apply Selection</span>
        </button>
      </div>
    </Modal>
  );
};
