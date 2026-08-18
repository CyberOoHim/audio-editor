import React from 'react';
import {
  Play,
  Pause,
  Square,
  Mic,
  Undo2,
  Redo2,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Volume2,
  VolumeX,
  Gauge
} from 'lucide-react';
import type { PlayState, TimeFormat } from '../../types/audio';

export interface TransportBarProps {
  playState: PlayState;
  currentTime: number;
  duration: number;
  canUndo: boolean;
  canRedo: boolean;
  volume: number;
  playbackRate?: number;
  sampleRate?: number;
  timeFormat?: TimeFormat;
  onPlay: () => void;
  onPause: () => void;
  onStop: () => void;
  onOpenRecord: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomFit: () => void;
  onVolumeChange: (val: number) => void;
  onPlaybackRateChange?: (rate: number) => void;
  onToggleTimeFormat?: () => void;
}

export const TransportBar: React.FC<TransportBarProps> = ({
  playState,
  currentTime,
  duration,
  canUndo,
  canRedo,
  volume,
  playbackRate = 1.0,
  sampleRate = 44100,
  timeFormat = 'hms',
  onPlay,
  onPause,
  onStop,
  onOpenRecord,
  onUndo,
  onRedo,
  onZoomIn,
  onZoomOut,
  onZoomFit,
  onVolumeChange,
  onPlaybackRateChange,
  onToggleTimeFormat
}) => {
  const formatTime = (sec: number): string => {
    if (timeFormat === 'seconds') {
      return `${sec.toFixed(2)}s`;
    }
    if (timeFormat === 'samples') {
      return `${Math.floor(sec * sampleRate).toLocaleString()} spl`;
    }
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    const ms = Math.floor((sec % 1) * 1000);
    return `${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}.${ms < 10 ? '00' : ms < 100 ? '0' : ''}${ms}`;
  };

  const isPlaying = playState === 'playing';

  const speedOptions = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0];
  const handleCycleSpeed = () => {
    if (!onPlaybackRateChange) return;
    const currIdx = speedOptions.findIndex((s) => Math.abs(s - playbackRate) < 0.05);
    const nextIdx = currIdx === -1 || currIdx === speedOptions.length - 1 ? 0 : currIdx + 1;
    onPlaybackRateChange(speedOptions[nextIdx]);
  };

  return (
    <div className="transport-bar">
      {/* Desktop Inline Layout */}
      <div className="transport-desktop-wrap">
        {/* Left: Timecode Display */}
        <div
          className="time-display"
          onClick={onToggleTimeFormat}
          style={{ cursor: 'pointer' }}
          title="Click to toggle Timecode / Seconds / Samples"
        >
          <span>{formatTime(currentTime)}</span>
          <span className="time-total">/ {formatTime(duration)}</span>
        </div>

        {/* Center: Play, Pause, Stop, Record */}
        <div className="transport-controls">
          <button
            className="btn btn-secondary btn-icon"
            onClick={onUndo}
            disabled={!canUndo}
            title="Undo (Ctrl+Z)"
          >
            <Undo2 size={16} />
          </button>

          <button
            className="btn btn-secondary btn-icon"
            onClick={onRedo}
            disabled={!canRedo}
            title="Redo (Ctrl+Y)"
          >
            <Redo2 size={16} />
          </button>

          <button
            className="btn btn-secondary btn-icon"
            onClick={onStop}
            title="Stop Playback"
          >
            <Square size={16} />
          </button>

          {isPlaying ? (
            <button
              className="btn play-btn-large"
              onClick={onPause}
              title="Pause (Space)"
            >
              <Pause size={22} />
            </button>
          ) : (
            <button
              className="btn play-btn-large"
              onClick={onPlay}
              title="Play (Space)"
            >
              <Play size={22} style={{ marginLeft: 2 }} />
            </button>
          )}

          <button
            className="btn rec-btn-large"
            onClick={onOpenRecord}
            title="Record Audio from Microphone"
          >
            <Mic size={20} />
          </button>
        </div>

        {/* Right: Speed, Zoom & Volume */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* Playback Speed Pill */}
          {onPlaybackRateChange && (
            <button
              className="btn btn-secondary btn-sm mono"
              onClick={handleCycleSpeed}
              style={{
                height: 26,
                padding: '0 8px',
                fontSize: 11,
                fontWeight: 600,
                color: playbackRate !== 1.0 ? 'var(--accent-cyan)' : 'var(--text-secondary)',
                border: playbackRate !== 1.0 ? '1px solid var(--accent-cyan)' : undefined
              }}
              title="Click to cycle playback speed (0.5x, 0.75x, 1x, 1.25x, 1.5x, 2x)"
            >
              <Gauge size={12} />
              <span>{playbackRate.toFixed(2).replace(/\.00$/, '')}x</span>
            </button>
          )}

          {/* Zoom */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <button className="btn btn-ghost btn-icon-sm" onClick={onZoomOut} title="Zoom Out">
              <ZoomOut size={15} />
            </button>
            <button className="btn btn-ghost btn-icon-sm" onClick={onZoomFit} title="Fit Entire Audio to Screen">
              <Maximize2 size={14} />
            </button>
            <button className="btn btn-ghost btn-icon-sm" onClick={onZoomIn} title="Zoom In">
              <ZoomIn size={15} />
            </button>
          </div>

          {/* Volume */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 95 }}>
            <button
              className="btn btn-ghost btn-icon-sm"
              onClick={() => onVolumeChange(volume > 0 ? 0 : 1)}
              title="Mute / Unmute"
            >
              {volume === 0 ? <VolumeX size={15} /> : <Volume2 size={15} />}
            </button>
            <input
              type="range"
              className="custom-slider"
              min={0}
              max={1.5}
              step={0.05}
              value={volume}
              onChange={(e) => onVolumeChange(parseFloat(e.target.value))}
              style={{ width: 65 }}
              title={`Volume: ${Math.round(volume * 100)}%`}
            />
          </div>
        </div>
      </div>

      {/* Mobile 2-Row Layout */}
      <div className="transport-mobile-wrap">
        {/* Row 1: Timecode + Speed + Zoom + Volume */}
        <div className="transport-mobile-row">
          <div
            className="time-display"
            onClick={onToggleTimeFormat}
            style={{ cursor: 'pointer' }}
          >
            <span>{formatTime(currentTime)}</span>
            <span className="time-total">/ {formatTime(duration)}</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            {onPlaybackRateChange && (
              <button
                className="btn btn-ghost btn-sm mono"
                onClick={handleCycleSpeed}
                style={{
                  height: 24,
                  padding: '0 6px',
                  fontSize: 11,
                  color: playbackRate !== 1.0 ? 'var(--accent-cyan)' : 'var(--text-secondary)'
                }}
                title="Playback Speed"
              >
                {playbackRate.toFixed(2).replace(/\.00$/, '')}x
              </button>
            )}

            <button className="btn btn-ghost btn-icon-sm" onClick={onZoomOut} title="Zoom Out">
              <ZoomOut size={14} />
            </button>
            <button className="btn btn-ghost btn-icon-sm" onClick={onZoomFit} title="Fit Entire Audio">
              <Maximize2 size={13} />
            </button>
            <button className="btn btn-ghost btn-icon-sm" onClick={onZoomIn} title="Zoom In">
              <ZoomIn size={14} />
            </button>
            <button
              className="btn btn-ghost btn-icon-sm"
              onClick={() => onVolumeChange(volume > 0 ? 0 : 1)}
              title="Mute / Unmute"
            >
              {volume === 0 ? <VolumeX size={14} /> : <Volume2 size={14} />}
            </button>
          </div>
        </div>

        {/* Row 2: Transport Action Controls */}
        <div className="transport-mobile-row" style={{ justifyContent: 'center', gap: 14 }}>
          <button
            className="btn btn-secondary btn-icon"
            onClick={onUndo}
            disabled={!canUndo}
            title="Undo"
          >
            <Undo2 size={16} />
          </button>

          <button
            className="btn btn-secondary btn-icon"
            onClick={onRedo}
            disabled={!canRedo}
            title="Redo"
          >
            <Redo2 size={16} />
          </button>

          <button
            className="btn btn-secondary btn-icon"
            onClick={onStop}
            title="Stop"
          >
            <Square size={16} />
          </button>

          {isPlaying ? (
            <button
              className="btn play-btn-large"
              onClick={onPause}
              title="Pause"
            >
              <Pause size={20} />
            </button>
          ) : (
            <button
              className="btn play-btn-large"
              onClick={onPlay}
              title="Play"
            >
              <Play size={20} style={{ marginLeft: 2 }} />
            </button>
          )}

          <button
            className="btn rec-btn-large"
            onClick={onOpenRecord}
            title="Record"
          >
            <Mic size={18} />
          </button>
        </div>
      </div>
    </div>
  );
};
