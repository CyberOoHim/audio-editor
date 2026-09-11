import React, { useState, useEffect, useCallback } from 'react';
import { Sliders, Sparkles, Music2, RotateCcw, Undo2, Redo2, Zap } from 'lucide-react';
import { Modal } from '../common/Modal';
import { Knob } from '../common/Knob';
import { Slider } from '../common/Slider';
import type { EQSettings, FilterSettings, CompressorSettings } from '../../types/audio';

export interface EffectsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onApplyEffects: (
    eq: EQSettings,
    filters: FilterSettings,
    comp: CompressorSettings,
    speed: number,
    keepPitch: boolean
  ) => Promise<void>;
  speed?: number;
  keepPitch?: boolean;
  onSpeedChange?: (rate: number, showToastFeedback?: boolean) => void;
  onKeepPitchChange?: (keepPitch: boolean) => void;
  canUndo?: boolean;
  canRedo?: boolean;
  onUndo?: () => void;
  onRedo?: () => void;
  undoActionName?: string;
  redoActionName?: string;
}

const SPEED_PRESETS = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0];

export const EffectsModal: React.FC<EffectsModalProps> = ({
  isOpen,
  onClose,
  onApplyEffects,
  speed: propSpeed = 1.0,
  keepPitch: propKeepPitch = true,
  onSpeedChange,
  onKeepPitchChange,
  canUndo = false,
  canRedo = false,
  onUndo,
  onRedo,
  undoActionName = '',
  redoActionName = ''
}) => {
  const [eq, setEq] = useState<EQSettings>({
    enabled: true,
    lowGain: 0,
    midGain: 0,
    highGain: 0,
    lowFreq: 100,
    midFreq: 1000,
    highFreq: 8000
  });

  const [filters, setFilters] = useState<FilterSettings>({
    highpassEnabled: false,
    highpassFreq: 80,
    lowpassEnabled: false,
    lowpassFreq: 12000
  });

  const [comp, setComp] = useState<CompressorSettings>({
    enabled: false,
    threshold: -24,
    knee: 30,
    ratio: 4,
    attack: 0.003,
    release: 0.25
  });

  const [speed, setSpeed] = useState<number>(propSpeed);
  const [keepPitch, setKeepPitch] = useState<boolean>(propKeepPitch);
  const [isProcessing, setIsProcessing] = useState(false);

  // Sync state with incoming props
  useEffect(() => {
    if (propSpeed !== undefined) {
      setSpeed(propSpeed);
    }
  }, [propSpeed]);

  useEffect(() => {
    if (propKeepPitch !== undefined) {
      setKeepPitch(propKeepPitch);
    }
  }, [propKeepPitch]);

  // Global hotkey support inside modal (Ctrl+Z / Cmd+Z for undo, Ctrl+Y / Cmd+Shift+Z for redo)
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const cmdOrCtrl = isMac ? e.metaKey : e.ctrlKey;

      if (cmdOrCtrl && !e.altKey) {
        if (e.key === 'z' || e.key === 'Z') {
          e.preventDefault();
          if (e.shiftKey) {
            if (canRedo) onRedo?.();
          } else {
            if (canUndo) onUndo?.();
          }
        } else if (e.key === 'y' || e.key === 'Y') {
          e.preventDefault();
          if (canRedo) onRedo?.();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, canUndo, canRedo, onUndo, onRedo]);

  const handleSpeedChange = useCallback((val: number, showToast = false) => {
    const clamped = Math.max(0.25, Math.min(2.0, Math.round(val * 100) / 100));
    setSpeed(clamped);
    onSpeedChange?.(clamped, showToast);
  }, [onSpeedChange]);

  const handleKeepPitchChange = useCallback((nextKeep: boolean) => {
    setKeepPitch(nextKeep);
    onKeepPitchChange?.(nextKeep);
  }, [onKeepPitchChange]);

  const handleApply = async () => {
    setIsProcessing(true);
    try {
      await onApplyEffects(eq, filters, comp, speed, keepPitch);
      if (Math.abs(speed - 1.0) >= 0.005) {
        onSpeedChange?.(1.0);
      }
      onClose();
    } finally {
      setIsProcessing(false);
    }
  };

  const handleReset = () => {
    setEq({
      enabled: true,
      lowGain: 0,
      midGain: 0,
      highGain: 0,
      lowFreq: 100,
      midFreq: 1000,
      highFreq: 8000
    });
    setFilters({
      highpassEnabled: false,
      highpassFreq: 80,
      lowpassEnabled: false,
      lowpassFreq: 12000
    });
    setComp({
      enabled: false,
      threshold: -24,
      knee: 30,
      ratio: 4,
      attack: 0.003,
      release: 0.25
    });
    setSpeed(1.0);
    setKeepPitch(true);
    onSpeedChange?.(1.0, true);
    onKeepPitchChange?.(true);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Studio DSP & Equalizer Suite"
      maxWidth="560px"
      footer={
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', flexWrap: 'wrap', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => onUndo?.()}
              disabled={isProcessing || !canUndo}
              title={undoActionName ? `Undo: ${undoActionName} (Ctrl+Z)` : 'Undo (Ctrl+Z)'}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}
            >
              <Undo2 size={13} />
              <span>Undo</span>
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => onRedo?.()}
              disabled={isProcessing || !canRedo}
              title={redoActionName ? `Redo: ${redoActionName} (Ctrl+Y)` : 'Redo (Ctrl+Y)'}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}
            >
              <Redo2 size={13} />
              <span>Redo</span>
            </button>
            <button className="btn btn-ghost btn-sm" onClick={handleReset} disabled={isProcessing}>
              Reset Defaults
            </button>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto' }}>
            <button className="btn btn-secondary" onClick={onClose} disabled={isProcessing}>
              Cancel
            </button>
            <button
              className="btn btn-primary"
              onClick={handleApply}
              disabled={isProcessing}
            >
              <Sparkles size={14} />
              {isProcessing ? 'Applying...' : 'Apply Effects'}
            </button>
          </div>
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* In-Deck Undo / Redo Status Strip */}
        {(canUndo || canRedo || undoActionName) && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '7px 12px',
              backgroundColor: 'rgba(56, 189, 248, 0.08)',
              border: '1px solid rgba(56, 189, 248, 0.25)',
              borderRadius: 'var(--radius-sm)',
              fontSize: 'calc(11.5px * var(--ui-font-scale, 1))',
              color: 'var(--text-primary)'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, overflow: 'hidden' }}>
              <Zap size={13} color="var(--accent-cyan, #06b6d4)" style={{ flexShrink: 0 }} />
              <span style={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                Active in buffer: <strong>{undoActionName || 'Original Audio'}</strong>
              </span>
              {redoActionName && (
                <span style={{ color: 'var(--text-muted)', fontSize: 'calc(10.5px * var(--ui-font-scale, 1))' }}>
                  (Redo: {redoActionName})
                </span>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                style={{ height: 24, padding: '0 8px', fontSize: 'calc(11px * var(--ui-font-scale, 1))', color: 'var(--accent-cyan, #06b6d4)' }}
                onClick={() => onUndo?.()}
                disabled={isProcessing || !canUndo}
                title={undoActionName ? `Undo: ${undoActionName} (Ctrl+Z)` : 'Undo (Ctrl+Z)'}
              >
                <Undo2 size={12} /> Undo
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                style={{ height: 24, padding: '0 8px', fontSize: 'calc(11px * var(--ui-font-scale, 1))', color: 'var(--accent-cyan, #06b6d4)' }}
                onClick={() => onRedo?.()}
                disabled={isProcessing || !canRedo}
                title={redoActionName ? `Redo: ${redoActionName} (Ctrl+Y)` : 'Redo (Ctrl+Y)'}
              >
                <Redo2 size={12} /> Redo
              </button>
            </div>
          </div>
        )}

        {/* Processing Limit & Engine Hint */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '6px 10px',
            background: 'var(--bg-panel)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-sm)',
            fontSize: 'calc(10.5px * var(--ui-font-scale, 1))',
            color: 'var(--text-muted)'
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ color: 'var(--accent-cyan)', fontWeight: 600 }}>⚡</span>
            <span>Chunked DSP render (safe for long takes on iPad • Non-realtime)</span>
          </span>
          <span style={{ color: 'var(--text-secondary)' }}>RAM-governed</span>
        </div>

        {/* 3-Band EQ Section */}
        <div style={{
          backgroundColor: 'var(--bg-surface)',
          padding: 16,
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--border-subtle)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, fontSize: 'var(--font-base)' }}>
              <Sliders size={14} color="var(--accent-cyan)" />
              3-Band Parametric Equalizer
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 'var(--font-md)', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={eq.enabled}
                onChange={(e) => setEq({ ...eq, enabled: e.target.checked })}
              />
              Enable EQ
            </label>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-around', alignItems: 'center', opacity: eq.enabled ? 1 : 0.4 }}>
            <Knob
              label="Low (100Hz)"
              value={eq.lowGain}
              min={-24}
              max={24}
              unit="dB"
              onChange={(val) => setEq({ ...eq, lowGain: val })}
            />
            <Knob
              label="Mid (1kHz)"
              value={eq.midGain}
              min={-24}
              max={24}
              unit="dB"
              onChange={(val) => setEq({ ...eq, midGain: val })}
            />
            <Knob
              label="High (8kHz)"
              value={eq.highGain}
              min={-24}
              max={24}
              unit="dB"
              onChange={(val) => setEq({ ...eq, highGain: val })}
            />
          </div>
        </div>

        {/* High-Pass & Low-Pass Filters */}
        <div style={{
          backgroundColor: 'var(--bg-surface)',
          padding: 16,
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--border-subtle)',
          display: 'flex',
          flexDirection: 'column',
          gap: 12
        }}>
          <span style={{ fontWeight: 600, fontSize: 'var(--font-base)' }}>High-Pass & Low-Pass Filters</span>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 'var(--font-md)' }}>
                <input
                  type="checkbox"
                  checked={filters.highpassEnabled}
                  onChange={(e) => setFilters({ ...filters, highpassEnabled: e.target.checked })}
                />
                High-Pass Filter (Cut Rumble)
              </label>
            </div>
            <Slider
              value={filters.highpassFreq}
              min={20}
              max={500}
              step={5}
              unit="Hz"
              disabled={!filters.highpassEnabled}
              onChange={(val) => setFilters({ ...filters, highpassFreq: val })}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 'var(--font-md)' }}>
                <input
                  type="checkbox"
                  checked={filters.lowpassEnabled}
                  onChange={(e) => setFilters({ ...filters, lowpassEnabled: e.target.checked })}
                />
                Low-Pass Filter (Cut Hiss / Highs)
              </label>
            </div>
            <Slider
              value={filters.lowpassFreq}
              min={1000}
              max={20000}
              step={100}
              unit="Hz"
              disabled={!filters.lowpassEnabled}
              onChange={(val) => setFilters({ ...filters, lowpassFreq: val })}
            />
          </div>
        </div>

        {/* Dynamics Compressor & Speed */}
        <div style={{
          backgroundColor: 'var(--bg-surface)',
          padding: 16,
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--border-subtle)',
          display: 'flex',
          flexDirection: 'column',
          gap: 12
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontWeight: 600, fontSize: 'var(--font-base)' }}>Dynamics Compressor</span>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 'var(--font-md)' }}>
              <input
                type="checkbox"
                checked={comp.enabled}
                onChange={(e) => setComp({ ...comp, enabled: e.target.checked })}
              />
              Enable Compressor
            </label>
          </div>

          <div style={{ opacity: comp.enabled ? 1 : 0.4 }}>
            <Slider
              label="Threshold"
              value={comp.threshold}
              min={-60}
              max={0}
              unit="dB"
              disabled={!comp.enabled}
              onChange={(val) => setComp({ ...comp, threshold: val })}
            />
            <Slider
              label="Ratio"
              value={comp.ratio}
              min={1}
              max={20}
              step={0.5}
              unit=":1"
              disabled={!comp.enabled}
              onChange={(val) => setComp({ ...comp, ratio: val })}
            />
          </div>

          <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <Slider
              label="Playback & Render Speed Multiplier"
              value={speed}
              min={0.5}
              max={2.0}
              step={0.05}
              unit="x"
              onChange={(val) => handleSpeedChange(val)}
            />

            {/* Quick Speed Presets */}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ fontSize: 'calc(10.5px * var(--ui-font-scale, 1))', color: 'var(--text-muted)', fontWeight: 600 }}>Presets:</span>
              {SPEED_PRESETS.map((preset) => {
                const isActive = Math.abs(preset - speed) < 0.02;
                return (
                  <button
                    key={preset}
                    type="button"
                    className={`speed-preset-chip mono ${isActive ? 'active' : ''}`}
                    onClick={() => handleSpeedChange(preset, true)}
                    title={`Set speed to ${preset}x`}
                    style={{
                      height: 24,
                      padding: '0 8px',
                      fontSize: 'calc(11px * var(--ui-font-scale, 1))'
                    }}
                  >
                    {preset === 1.0 ? '1x' : preset === 2.0 ? '2x' : `${preset}x`}
                  </button>
                );
              })}
              {Math.abs(speed - 1.0) >= 0.02 && (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => handleSpeedChange(1.0, true)}
                  title="Reset speed to 1.0x"
                  style={{ height: 24, padding: '0 6px', fontSize: 'calc(10.5px * var(--ui-font-scale, 1))' }}
                >
                  <RotateCcw size={11} /> Reset 1x
                </button>
              )}
            </div>

            {/* Dedicated Keep Pitch Button */}
            <button
              type="button"
              id="effects-keep-pitch-toggle-btn"
              className={`speed-keep-pitch-toggle-btn ${keepPitch ? 'active' : ''}`}
              onClick={() => handleKeepPitchChange(!keepPitch)}
              role="switch"
              aria-checked={keepPitch}
              title={
                keepPitch
                  ? 'Keep Pitch is ON (Time stretch). Click to switch to Resample mode (pitch shifts with speed).'
                  : 'Keep Pitch is OFF (Resample mode). Click to preserve musical pitch.'
              }
            >
              <div className="speed-pitch-btn-left">
                <Music2 size={14} style={{ color: keepPitch ? 'var(--accent-cyan)' : 'var(--text-muted)' }} />
                <div className="speed-pitch-text-wrap">
                  <div className="speed-pitch-title-row">
                    <span className="speed-pitch-title">Keep pitch</span>
                  </div>
                  <span className="speed-pitch-desc">
                    {keepPitch
                      ? 'Time stretch (pitch preserved)'
                      : 'Resample / Tape mode (pitch shifts)'}
                  </span>
                </div>
              </div>
              <span className={`speed-pitch-pill ${keepPitch ? 'active' : ''}`}>
                {keepPitch ? 'ON' : 'OFF'}
              </span>
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
};
