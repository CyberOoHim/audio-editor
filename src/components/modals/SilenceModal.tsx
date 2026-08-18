import React, { useState } from 'react';
import { PlusCircle } from 'lucide-react';
import { Modal } from '../common/Modal';
import { Slider } from '../common/Slider';

export interface SilenceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onInsertSilence: (durationSec: number) => void;
}

export const SilenceModal: React.FC<SilenceModalProps> = ({
  isOpen,
  onClose,
  onInsertSilence
}) => {
  const [duration, setDuration] = useState(1.0);

  const handleApply = () => {
    onInsertSilence(duration);
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Insert Silence"
      maxWidth="420px"
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={handleApply}>
            <PlusCircle size={14} /> Insert Silence
          </button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
          Insert zero-amplitude silence at the current playhead position.
        </p>

        <Slider
          label="Silence Duration"
          value={duration}
          min={0.1}
          max={10.0}
          step={0.1}
          unit="sec"
          onChange={(val) => setDuration(val)}
        />
      </div>
    </Modal>
  );
};
