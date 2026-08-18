import React, { useState } from 'react';
import { Volume2 } from 'lucide-react';
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
  const [gainDb, setGainDb] = useState(3.0);
  const [target, setTarget] = useState<'selection' | 'all'>(hasSelection ? 'selection' : 'all');

  const handleApply = () => {
    onApplyGain(gainDb, target);
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Adjust Gain / Volume"
      maxWidth="420px"
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={handleApply}>
            <Volume2 size={14} /> Apply Gain
          </button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Slider
          label="Gain Adjustment"
          value={gainDb}
          min={-36}
          max={24}
          step={0.5}
          unit="dB"
          onChange={(val) => setGainDb(val)}
        />

        <div className="form-group">
          <label className="form-label">Apply Scope</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              className={`btn btn-sm ${target === 'selection' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ flex: 1 }}
              disabled={!hasSelection}
              onClick={() => setTarget('selection')}
            >
              Selected Region Only
            </button>
            <button
              className={`btn btn-sm ${target === 'all' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ flex: 1 }}
              onClick={() => setTarget('all')}
            >
              Entire Track
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
};
