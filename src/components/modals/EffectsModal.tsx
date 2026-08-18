import React, { useState } from 'react';
import { Sliders, Sparkles } from 'lucide-react';
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
    speed: number
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
  const [isProcessing, setIsProcessing] = useState(false);

  const handleApply = async () => {
    setIsProcessing(true);
    try {
      await onApplyEffects(eq, filters, comp, speed);
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
            {isProcessing ? 'Processing DSP...' : 'Apply Effects'}
          </button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {/* 3-Band EQ Section */}
        <div style={{
          backgroundColor: 'var(--bg-surface)',
          padding: 16,
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--border-subtle)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, fontSize: 13 }}>
              <Sliders size={14} color="var(--accent-cyan)" />
              3-Band Parametric Equalizer
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer' }}>
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
          <span style={{ fontWeight: 600, fontSize: 13 }}>High-Pass & Low-Pass Filters</span>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
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
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
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
            <span style={{ fontWeight: 600, fontSize: 13 }}>Dynamics Compressor</span>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
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

          <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 10 }}>
            <Slider
              label="Playback & Render Speed Multiplier"
              value={speed}
              min={0.5}
              max={2.0}
              step={0.05}
              unit="x"
              onChange={(val) => setSpeed(val)}
            />
          </div>
        </div>
      </div>
    </Modal>
  );
};
