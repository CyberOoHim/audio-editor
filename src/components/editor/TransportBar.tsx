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
import type { PlayState } from '../../types/audio';

export interface TransportBarProps {
  playState: PlayState;
  currentTime: number;
  duration: number;
  canUndo: boolean;
  canRedo: boolean;
  volume: number;
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
}

export const TransportBar: React.FC<TransportBarProps> = ({
  playState,
  currentTime,
  duration,
  canUndo,
  canRedo,
  volume,
  onPlay,
  onPause,
  onStop,
  onOpenRecord,
  onUndo,
  onRedo,
  onZoomIn,
  onZoomOut,
  onZoomFit,
  onVolumeChange
}) => {
  const formatTime = (sec: number): string => {
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
        <div className="time-display">
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

        {/* Right: Zoom & Volume */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 100 }}>
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
              style={{ width: 70 }}
              title={`Volume: ${Math.round(volume * 100)}%`}
            />
          </div>
        </div>
      </div>

      {/* Mobile 2-Row Layout (Zero Clipping on Android Vertical Mode) */}
      <div className="transport-mobile-wrap">
        {/* Row 1: Timecode + Zoom + Volume */}
        <div className="transport-mobile-row">
          <div className="time-display">
            <span>{formatTime(currentTime)}</span>
            <span className="time-total">/ {formatTime(duration)}</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
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
