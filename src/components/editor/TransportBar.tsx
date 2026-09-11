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
  VolumeX
} from 'lucide-react';
import type { PlayState, TimeFormat } from '../../types/audio';
import { SpeedControl } from './SpeedControl';

export interface TransportBarProps {
  playState: PlayState;
  currentTime: number;
  duration: number;
  canUndo: boolean;
  canRedo: boolean;
  undoDescription?: string;
  redoDescription?: string;
  volume: number;
  playbackRate?: number;
  keepPitch?: boolean;
  sampleRate?: number;
  timeFormat?: TimeFormat;
  hasBuffer?: boolean;
  hasSelection?: boolean;
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
  onPlaybackRateChange?: (rate: number, showToastFeedback?: boolean) => void;
  onKeepPitchChange?: (keepPitch: boolean) => void;
  onApplySpeedTransform?: (rate: number, keepPitch: boolean) => void;
  onToggleTimeFormat?: () => void;
}

export const TransportBar: React.FC<TransportBarProps> = React.memo(({
  playState,
  currentTime,
  duration,
  canUndo,
  canRedo,
  undoDescription,
  redoDescription,
  volume,
  playbackRate = 1.0,
  keepPitch = true,
  sampleRate = 44100,
  timeFormat = 'hms',
  hasBuffer = false,
  hasSelection = false,
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
  onKeepPitchChange,
  onApplySpeedTransform,
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
            title={undoDescription ? `Undo: ${undoDescription} (Ctrl+Z)` : 'Undo (Ctrl+Z)'}
          >
            <Undo2 size={16} />
          </button>

          <button
            className="btn btn-secondary btn-icon"
            onClick={onRedo}
            disabled={!canRedo}
            title={redoDescription ? `Redo: ${redoDescription} (Ctrl+Y)` : 'Redo (Ctrl+Y)'}
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
          {/* Playback Speed Fine-Grained Slider */}
          {onPlaybackRateChange && (
            <SpeedControl
              playbackRate={playbackRate}
              keepPitch={keepPitch}
              onPlaybackRateChange={onPlaybackRateChange}
              onKeepPitchChange={onKeepPitchChange}
              onApplySpeedTransform={onApplySpeedTransform}
              hasBuffer={hasBuffer}
              hasSelection={hasSelection}
            />
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
              <SpeedControl
                playbackRate={playbackRate}
                keepPitch={keepPitch}
                onPlaybackRateChange={onPlaybackRateChange}
                onKeepPitchChange={onKeepPitchChange}
                onApplySpeedTransform={onApplySpeedTransform}
                hasBuffer={hasBuffer}
                hasSelection={hasSelection}
                isMobile
              />
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
            title={undoDescription ? `Undo: ${undoDescription}` : 'Undo'}
          >
            <Undo2 size={16} />
          </button>

          <button
            className="btn btn-secondary btn-icon"
            onClick={onRedo}
            disabled={!canRedo}
            title={redoDescription ? `Redo: ${redoDescription}` : 'Redo'}
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
});
TransportBar.displayName = 'TransportBar';
