import React, { useState } from 'react';
import { PlusCircle } from 'lucide-react';
import { Modal } from '../common/Modal';
import { Slider } from '../common/Slider';
import type { AudioSelection } from '../../types/audio';

export interface SilenceModalProps {
  isOpen: boolean;
  onClose: () => void;
  selection: AudioSelection | null;
  currentTime: number;
  onInsertSilence: (
    durationSec: number,
    placement: 'playhead' | 'start' | 'end' | 'replace-selection'
  ) => void;
}

export const SilenceModal: React.FC<SilenceModalProps> = ({
  isOpen,
  onClose,
  selection,
  currentTime,
  onInsertSilence
}) => {
  const hasSelection = Boolean(selection && selection.end > selection.start);
  const [duration, setDuration] = useState<number>(1.0);
  const [placement, setPlacement] = useState<'playhead' | 'start' | 'end' | 'replace-selection'>('playhead');

  const presets = [0.25, 0.5, 1.0, 2.0, 3.0, 5.0, 10.0];

  const handleApply = () => {
    onInsertSilence(duration, placement);
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Insert Silence / Gap"
      maxWidth="440px"
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={handleApply}>
            <PlusCircle size={15} /> Insert Silence (${duration}s)
          </button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <p style={{ fontSize: 'var(--font-base)', color: 'var(--text-secondary)' }}>
          Insert digital zero-amplitude silence into the track.
        </p>

        {/* Duration Control */}
        <div className="form-group">
          <div className="form-label">
            <span>Silence Duration</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input
                type="number"
                min="0.05"
                max="60"
                step="0.05"
                value={duration}
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  if (!isNaN(val) && val > 0) setDuration(Math.min(60, val));
                }}
                className="form-input mono"
                style={{ width: 70, height: 26, padding: '2px 6px', fontSize: 'var(--font-md)', textAlign: 'right' }}
              />
              <span className="mono" style={{ color: 'var(--accent-cyan)', fontSize: 'var(--font-md)' }}>sec</span>
            </div>
          </div>

          <Slider
            value={duration}
            min={0.1}
            max={10.0}
            step={0.1}
            unit="sec"
            onChange={(val) => setDuration(Math.round(val * 10) / 10)}
          />

          {/* Preset Buttons */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
            {presets.map((p) => (
              <button
                key={p}
                type="button"
                className={`btn btn-sm ${Math.abs(duration - p) < 0.01 ? 'btn-primary' : 'btn-secondary'}`}
                style={{ height: 24, padding: '0 8px', fontSize: 'var(--font-sm)' }}
                onClick={() => setDuration(p)}
              >
                {p}s
              </button>
            ))}
          </div>
        </div>

        {/* Placement Selector */}
        <div className="form-group">
          <label className="form-label">Insert Placement</label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            <button
              type="button"
              className={`btn btn-sm ${placement === 'playhead' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setPlacement('playhead')}
            >
              At Playhead ({currentTime.toFixed(2)}s)
            </button>
            <button
              type="button"
              className={`btn btn-sm ${placement === 'start' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setPlacement('start')}
            >
              At Beginning (0.0s)
            </button>
            <button
              type="button"
              className={`btn btn-sm ${placement === 'end' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setPlacement('end')}
            >
              At End of Track
            </button>
            {hasSelection && (
              <button
                type="button"
                className={`btn btn-sm ${placement === 'replace-selection' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setPlacement('replace-selection')}
              >
                Replace Selection
              </button>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
};
