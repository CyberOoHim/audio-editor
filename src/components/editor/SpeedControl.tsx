import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Gauge,
  RotateCcw,
  Minus,
  Plus,
  X,
  ChevronDown,
  Music2,
  Zap
} from 'lucide-react';

export interface SpeedControlProps {
  playbackRate: number;
  keepPitch?: boolean;
  onPlaybackRateChange: (rate: number, showToastFeedback?: boolean) => void;
  onKeepPitchChange?: (keepPitch: boolean) => void;
  onApplySpeedTransform?: (rate: number, keepPitch: boolean) => void;
  hasBuffer?: boolean;
  hasSelection?: boolean;
  isMobile?: boolean;
}

const SPEED_PRESETS = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0];

export const SpeedControl: React.FC<SpeedControlProps> = React.memo(({
  playbackRate,
  keepPitch = true,
  onPlaybackRateChange,
  onKeepPitchChange,
  onApplySpeedTransform,
  hasBuffer = false,
  hasSelection = false,
  isMobile = false
}) => {
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close when clicking outside or pressing Escape
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const roundRate = Math.round(playbackRate * 100) / 100;

  const handleSetRate = useCallback((rate: number, showToast = false) => {
    const clamped = Math.max(0.25, Math.min(2.0, Math.round(rate * 100) / 100));
    onPlaybackRateChange(clamped, showToast);
  }, [onPlaybackRateChange]);

  const handleNudgeDown = useCallback(() => {
    const next = Math.max(0.25, Math.round((roundRate - 0.05) * 100) / 100);
    handleSetRate(next, false);
  }, [roundRate, handleSetRate]);

  const handleNudgeUp = useCallback(() => {
    const next = Math.min(2.0, Math.round((roundRate + 0.05) * 100) / 100);
    handleSetRate(next, false);
  }, [roundRate, handleSetRate]);

  const formatButtonLabel = (rate: number): string => {
    const r = Math.round(rate * 100) / 100;
    if (r === 1) return '1x';
    if (r === 2) return '2x';
    return `${r}x`;
  };

  const isCustomRate = roundRate !== 1.0;

  return (
    <div className="speed-popover-container" ref={containerRef}>
      {/* Trigger Button Pill */}
      <button
        type="button"
        className={`btn ${isMobile ? 'btn-ghost' : 'btn-secondary'} btn-sm mono speed-toggle-pill`}
        onClick={() => setIsOpen((prev) => !prev)}
        style={{
          height: isMobile ? 24 : 26,
          padding: isMobile ? '0 6px' : '0 8px',
          fontSize: 'var(--font-sm)',
          fontWeight: 600,
          color: isOpen || isCustomRate ? 'var(--accent-cyan)' : 'var(--text-secondary)',
          borderColor: isOpen || isCustomRate ? 'var(--accent-cyan)' : undefined,
          backgroundColor: isOpen ? 'var(--accent-cyan-dim)' : undefined,
          boxShadow: isOpen ? '0 0 8px var(--accent-cyan-glow)' : undefined
        }}
        title={isOpen ? 'Close speed slider' : 'Adjust playback speed (0.05x step)'}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
      >
        <Gauge size={isMobile ? 11 : 12} />
        <span>{formatButtonLabel(playbackRate)}</span>
        <ChevronDown
          size={11}
          style={{
            transform: isOpen ? 'rotate(180deg)' : 'none',
            transition: 'transform 0.15s ease',
            opacity: 0.7
          }}
        />
      </button>

      {/* Popover Slider Panel */}
      {isOpen && (
        <div
          className="speed-slider-popover"
          role="dialog"
          aria-label="Playback speed fine-grained slider"
        >
          {/* Header */}
          <div className="speed-popover-header">
            <div className="speed-popover-title">
              <Gauge size={13} style={{ color: 'var(--accent-cyan)' }} />
              <span>Speed Control</span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {isCustomRate && (
                <button
                  type="button"
                  className="speed-reset-btn"
                  onClick={() => handleSetRate(1.0, true)}
                  title="Reset to 1.0x normal speed"
                >
                  <RotateCcw size={10} />
                  <span>1.0x</span>
                </button>
              )}
              <button
                type="button"
                className="speed-close-btn"
                onClick={() => setIsOpen(false)}
                title="Close slider"
                aria-label="Close"
              >
                <X size={13} />
              </button>
            </div>
          </div>

          {/* Current Speed Readout Display */}
          <div className="speed-readout-wrap">
            <span className="speed-readout-val mono">{roundRate.toFixed(2)}x</span>
            <span className="speed-readout-desc">
              {roundRate === 1.0
                ? 'Normal speed'
                : roundRate > 1.0
                ? `+${Math.round((roundRate - 1.0) * 100)}% faster`
                : `-${Math.round((1.0 - roundRate) * 100)}% slower`}
            </span>
          </div>

          {/* Fine-grained Slider with 0.05x step and Nudge Controls */}
          <div className="speed-slider-row">
            <button
              type="button"
              className="speed-nudge-btn"
              onClick={handleNudgeDown}
              disabled={roundRate <= 0.25}
              title="Decrease speed by 0.05x"
              aria-label="Decrease speed by 0.05x"
            >
              <Minus size={13} />
            </button>

            <div className="speed-slider-track-wrap">
              <input
                type="range"
                className="custom-slider speed-range-input"
                min={0.25}
                max={2.0}
                step={0.05}
                value={roundRate}
                onChange={(e) => handleSetRate(parseFloat(e.target.value), false)}
                aria-label="Playback speed slider with 0.05x step"
              />
              <div className="speed-scale-ticks">
                <span>0.25x</span>
                <span
                  className="tick-normal"
                  onClick={() => handleSetRate(1.0, true)}
                  title="Reset to 1.0x normal"
                >
                  1.0x
                </span>
                <span>2.0x</span>
              </div>
            </div>

            <button
              type="button"
              className="speed-nudge-btn"
              onClick={handleNudgeUp}
              disabled={roundRate >= 2.0}
              title="Increase speed by 0.05x"
              aria-label="Increase speed by 0.05x"
            >
              <Plus size={13} />
            </button>
          </div>

          {/* Quick Presets Grid */}
          <div className="speed-presets-grid">
            {SPEED_PRESETS.map((preset) => {
              const isActive = Math.abs(preset - roundRate) < 0.02;
              return (
                <button
                  key={preset}
                  type="button"
                  className={`speed-preset-chip mono ${isActive ? 'active' : ''}`}
                  onClick={() => handleSetRate(preset, true)}
                  title={`Set speed to ${preset}x`}
                >
                  {preset === 1.0 ? '1x' : preset === 2.0 ? '2x' : `${preset}x`}
                </button>
              );
            })}
          </div>

          {/* Keep Pitch Option (Default: Keep Pitch = true) */}
          <div className="speed-pitch-control-row">
            <label
              className="speed-pitch-label"
              title="Keep original musical pitch (time stretch) or let pitch shift with speed"
            >
              <input
                type="checkbox"
                className="speed-pitch-checkbox"
                checked={keepPitch}
                onChange={(e) => onKeepPitchChange?.(e.target.checked)}
              />
              <div className="speed-pitch-text-wrap">
                <div className="speed-pitch-title-row">
                  <Music2 size={11} style={{ color: keepPitch ? 'var(--accent-cyan)' : 'var(--text-muted)' }} />
                  <span className="speed-pitch-title">Keep pitch</span>
                  <span className={`speed-pitch-badge ${keepPitch ? 'active' : ''}`}>
                    {keepPitch ? 'ON' : 'OFF'}
                  </span>
                </div>
                <span className="speed-pitch-desc">
                  {keepPitch
                    ? 'Time stretch (pitch preserved)'
                    : 'Resample / Tape mode (pitch shifts)'}
                </span>
              </div>
            </label>
          </div>

          {/* Apply Speed Transform Button (Render / Bake into Audio) */}
          {onApplySpeedTransform && (
            <div className="speed-apply-wrap">
              <button
                id="speed-apply-transform-btn"
                type="button"
                className={`speed-apply-btn ${!hasBuffer || !isCustomRate ? 'disabled' : ''}`}
                disabled={!hasBuffer || !isCustomRate}
                onClick={() => {
                  if (hasBuffer && isCustomRate) {
                    onApplySpeedTransform(roundRate, keepPitch);
                    setIsOpen(false);
                  }
                }}
                style={{
                  opacity: !hasBuffer || !isCustomRate ? 0.45 : 1,
                  cursor: !hasBuffer || !isCustomRate ? 'not-allowed' : 'pointer',
                  filter: !hasBuffer || !isCustomRate ? 'grayscale(0.5)' : 'none'
                }}
                title={
                  !hasBuffer
                    ? 'Load an audio track first to apply transform'
                    : !isCustomRate
                    ? 'Change speed from 1.0x (e.g. 1.25x or 0.75x) to apply permanent transform'
                    : `Apply ${roundRate.toFixed(2)}x speed transform permanently to ${hasSelection ? 'selection' : 'entire track'} (${keepPitch ? 'keep pitch' : 'shift pitch'})`
                }
              >
                <Zap size={12} />
                <span>
                  {!isCustomRate
                    ? 'Apply Transform (Change speed first)'
                    : `Apply Transform (${roundRate.toFixed(2)}x)`}
                </span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
});

SpeedControl.displayName = 'SpeedControl';
