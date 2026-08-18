import React, { useState } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import { Modal } from '../common/Modal';
import { Slider } from '../common/Slider';

export interface GainModalProps {
  isOpen: boolean;
  onClose: () => void;
  hasSelection: boolean;
  onApplyGain: (gainDb: number, target: 'selection' | 'all') => void;
}

export const GainModal: React.FC<GainModalProps> = ({
  isOpen,
  onClose,
  hasSelection,
  onApplyGain
}) => {
  const [gainDb, setGainDb] = useState<number>(3.0);
  const [target, setTarget] = useState<'selection' | 'all'>(hasSelection ? 'selection' : 'all');

  const presets = [-12, -6, -3, 3, 6, 12];

  const handleApply = () => {
    onApplyGain(gainDb, target);
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Adjust Gain / Volume"
      maxWidth="440px"
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={handleApply}>
            <Volume2 size={14} /> Apply {gainDb > 0 ? `+${gainDb}` : gainDb} dB Gain
          </button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Gain Slider & Numeric Input */}
        <div className="form-group">
          <div className="form-label">
            <span>Gain Adjustment</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input
                type="number"
                min="-60"
                max="36"
                step="0.5"
                value={gainDb}
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  if (!isNaN(val)) setGainDb(Math.max(-60, Math.min(36, val)));
                }}
                className="form-input mono"
                style={{ width: 70, height: 26, padding: '2px 6px', fontSize: 12, textAlign: 'right' }}
              />
              <span className="mono" style={{ color: 'var(--accent-cyan)', fontSize: 12 }}>dB</span>
            </div>
          </div>

          <Slider
            value={gainDb}
            min={-36}
            max={24}
            step={0.5}
            unit="dB"
            onChange={(val) => setGainDb(Math.round(val * 10) / 10)}
          />

          {/* Quick Presets */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
            {presets.map((p) => (
              <button
                key={p}
                type="button"
                className={`btn btn-sm ${Math.abs(gainDb - p) < 0.1 ? 'btn-primary' : 'btn-secondary'}`}
                style={{ height: 24, padding: '0 8px', fontSize: 11 }}
                onClick={() => setGainDb(p)}
              >
                {p > 0 ? `+${p}` : p} dB
              </button>
            ))}
            <button
              type="button"
              className={`btn btn-sm ${gainDb <= -36 ? 'btn-primary' : 'btn-secondary'}`}
              style={{ height: 24, padding: '0 8px', fontSize: 11 }}
              onClick={() => setGainDb(-36)}
            >
              <VolumeX size={11} /> Mute
            </button>
          </div>
        </div>

        {/* Scope */}
        <div className="form-group">
          <label className="form-label">Apply Scope</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              className={`btn btn-sm ${target === 'selection' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ flex: 1 }}
              disabled={!hasSelection}
              onClick={() => setTarget('selection')}
            >
              Selected Region Only
            </button>
            <button
              type="button"
              className={`btn btn-sm ${target === 'all' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ flex: 1 }}
              onClick={() => setTarget('all')}
            >
              Entire Audio Track
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
};
