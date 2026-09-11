import React, { useState, useEffect } from 'react';
import { Volume2, VolumeX, Undo2, Redo2 } from 'lucide-react';
import { Modal } from '../common/Modal';
import { Slider } from '../common/Slider';

export interface GainModalProps {
  isOpen: boolean;
  onClose: () => void;
  hasSelection: boolean;
  onApplyGain: (gainDb: number, target: 'selection' | 'all') => void;
  canUndo?: boolean;
  canRedo?: boolean;
  onUndo?: () => void;
  onRedo?: () => void;
  undoDescription?: string;
  redoDescription?: string;
}

export const GainModal: React.FC<GainModalProps> = ({
  isOpen,
  onClose,
  hasSelection,
  onApplyGain,
  canUndo = false,
  canRedo = false,
  onUndo,
  onRedo,
  undoDescription = '',
  redoDescription = ''
}) => {
  const [gainDb, setGainDb] = useState<number>(3.0);
  const [target, setTarget] = useState<'selection' | 'all'>(hasSelection ? 'selection' : 'all');

  const presets = [-12, -6, -3, 3, 6, 12];

  // Hotkey support for Undo/Redo inside modal
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const cmdOrCtrl = isMac ? e.metaKey : e.ctrlKey;
      if (cmdOrCtrl && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        e.stopPropagation();
        if (e.shiftKey) {
          if (canRedo && onRedo) onRedo();
        } else {
          if (canUndo && onUndo) onUndo();
        }
      } else if (cmdOrCtrl && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        e.stopPropagation();
        if (canRedo && onRedo) onRedo();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, canUndo, canRedo, onUndo, onRedo]);

  const handleApply = () => {
    onApplyGain(gainDb, target);
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Adjust Gain / Volume"
      maxWidth="460px"
      footer={
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', flexWrap: 'wrap', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {onUndo && (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={onUndo}
                disabled={!canUndo}
                title={undoDescription ? `Undo: ${undoDescription} (Ctrl+Z)` : 'Undo (Ctrl+Z)'}
                style={{ height: 32, padding: '0 10px' }}
              >
                <Undo2 size={13} /> Undo
              </button>
            )}
            {onRedo && (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={onRedo}
                disabled={!canRedo}
                title={redoDescription ? `Redo: ${redoDescription} (Ctrl+Y)` : 'Redo (Ctrl+Y)'}
                style={{ height: 32, padding: '0 10px' }}
              >
                <Redo2 size={13} /> Redo
              </button>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button className="btn btn-primary" onClick={handleApply}>
              <Volume2 size={14} /> Apply Gain ({gainDb > 0 ? `+${gainDb}` : gainDb} dB)
            </button>
          </div>
        </div>
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
                style={{ width: 70, height: 26, padding: '2px 6px', fontSize: 'var(--font-md)', textAlign: 'right' }}
              />
              <span className="mono" style={{ color: 'var(--accent-cyan)', fontSize: 'var(--font-md)' }}>dB</span>
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
                style={{ height: 24, padding: '0 8px', fontSize: 'var(--font-sm)' }}
                onClick={() => setGainDb(p)}
              >
                {p > 0 ? `+${p}` : p} dB
              </button>
            ))}
            <button
              type="button"
              className={`btn btn-sm ${gainDb <= -36 ? 'btn-primary' : 'btn-secondary'}`}
              style={{ height: 24, padding: '0 8px', fontSize: 'var(--font-sm)' }}
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
