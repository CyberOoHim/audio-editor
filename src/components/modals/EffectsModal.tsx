import React, { useState } from 'react';
import { Sliders, Sparkles, Music2 } from 'lucide-react';
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
}

export const EffectsModal: React.FC<EffectsModalProps> = ({
  isOpen,
  onClose,
  onApplyEffects
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

  const [speed, setSpeed] = useState<number>(1.0);
  const [keepPitch, setKeepPitch] = useState<boolean>(true);
  const [isProcessing, setIsProcessing] = useState(false);

  const handleApply = async () => {
    setIsProcessing(true);
    try {
      await onApplyEffects(eq, filters, comp, speed, keepPitch);
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
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Studio DSP & Equalizer Suite"
      maxWidth="560px"
      footer={
        <>
          <button className="btn btn-ghost btn-sm" onClick={handleReset}>
            Reset Defaults
          </button>
          <button className="btn btn-secondary" onClick={onClose}>
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
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
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
              onChange={(val) => setSpeed(val)}
            />

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '8px 10px',
                background: 'var(--bg-input)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-sm)'
              }}
            >
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  cursor: 'pointer',
                  fontSize: 'calc(11.5px * var(--ui-font-scale, 1))',
                  fontWeight: 600,
                  color: 'var(--text-primary)',
                  userSelect: 'none'
                }}
              >
                <input
                  type="checkbox"
                  checked={keepPitch}
                  onChange={(e) => setKeepPitch(e.target.checked)}
                  style={{ accentColor: 'var(--accent-cyan)', width: 14, height: 14, cursor: 'pointer' }}
                />
                <Music2 size={13} style={{ color: keepPitch ? 'var(--accent-cyan)' : 'var(--text-muted)' }} />
                <span>Keep Pitch (Time Stretch)</span>
              </label>

              <span
                style={{
                  fontSize: 'calc(10px * var(--ui-font-scale, 1))',
                  color: keepPitch ? 'var(--accent-cyan)' : 'var(--text-muted)',
                  fontWeight: 500
                }}
              >
                {keepPitch ? 'Pitch Preserved' : 'Pitch Shifts (Resample)'}
              </span>
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
};
