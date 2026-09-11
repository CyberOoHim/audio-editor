import React, { useState, useEffect } from 'react';
import { BarChart2, CheckCircle2, Undo2, Redo2 } from 'lucide-react';
import { Modal } from '../common/Modal';
import { Slider } from '../common/Slider';
import type { AudioSelection } from '../../types/audio';

export interface NormalizeModalProps {
  isOpen: boolean;
  onClose: () => void;
  selection: AudioSelection | null;
  onApplyNormalize: (targetDb: number, scope: 'all' | 'selection') => void;
  canUndo?: boolean;
  canRedo?: boolean;
  onUndo?: () => void;
  onRedo?: () => void;
  undoDescription?: string;
  redoDescription?: string;
}

export const NormalizeModal: React.FC<NormalizeModalProps> = ({
  isOpen,
  onClose,
  selection,
  onApplyNormalize,
  canUndo = false,
  canRedo = false,
  onUndo,
  onRedo,
  undoDescription = '',
  redoDescription = ''
}) => {
  const hasSelection = Boolean(selection && selection.end > selection.start);
  const [targetDb, setTargetDb] = useState<number>(-0.1);
  const [scope, setScope] = useState<'all' | 'selection'>(hasSelection ? 'selection' : 'all');

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

  const presets = [
    { label: '0.0 dBFS', val: 0.0, desc: 'Full Scale Maximum' },
    { label: '-0.1 dBFS', val: -0.1, desc: 'True Peak Safe' },
    { label: '-1.0 dBFS', val: -1.0, desc: 'Streaming (Spotify/Apple)' },
    { label: '-3.0 dBFS', val: -3.0, desc: 'Mastering Headroom' },
    { label: '-6.0 dBFS', val: -6.0, desc: 'Mix Bus Headroom' },
    { label: '-14.0 dBFS', val: -14.0, desc: 'Podcast / Broadcast' }
  ];

  const handleApply = () => {
    onApplyNormalize(targetDb, scope);
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Normalize Peak Level"
      maxWidth="480px"
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
              <BarChart2 size={15} /> Normalize ({targetDb > 0 ? `+${targetDb}` : targetDb} dBFS)
            </button>
          </div>
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <p style={{ fontSize: 'var(--font-base)', color: 'var(--text-secondary)' }}>
          Scales audio amplitude so the highest peak precisely reaches the target level without distortion.
        </p>

        {/* Target Peak dBFS Slider */}
        <div className="form-group">
          <div className="form-label">
            <span>Target Peak Amplitude</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input
                type="number"
                min="-36"
                max="0"
                step="0.1"
                value={targetDb}
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  if (!isNaN(val)) setTargetDb(Math.min(0, Math.max(-36, val)));
                }}
                className="form-input mono"
                style={{ width: 70, height: 26, padding: '2px 6px', fontSize: 'var(--font-md)', textAlign: 'right' }}
              />
              <span className="mono" style={{ color: 'var(--accent-cyan)', fontSize: 'var(--font-md)' }}>dBFS</span>
            </div>
          </div>

          <Slider
            value={targetDb}
            min={-24}
            max={0}
            step={0.1}
            unit="dBFS"
            onChange={(val) => setTargetDb(Math.round(val * 10) / 10)}
          />
        </div>

        {/* Industry Standard Presets */}
        <div className="form-group">
          <label className="form-label">Industry Standard Presets</label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6 }}>
            {presets.map((p) => {
              const isSelected = Math.abs(targetDb - p.val) < 0.05;
              return (
                <button
                  key={p.val}
                  type="button"
                  className={`btn ${isSelected ? 'btn-primary' : 'btn-secondary'}`}
                  style={{
                    height: 'auto',
                    padding: '8px 10px',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'flex-start',
                    textAlign: 'left'
                  }}
                  onClick={() => setTargetDb(p.val)}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                    <span className="mono" style={{ fontWeight: 600, fontSize: 'var(--font-md)' }}>{p.label}</span>
                    {isSelected && <CheckCircle2 size={12} />}
                  </div>
                  <span style={{ fontSize: 'var(--font-xs)', opacity: 0.75 }}>{p.desc}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Scope Selector */}
        <div className="form-group">
          <label className="form-label">Target Scope</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              className={`btn btn-sm ${scope === 'all' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ flex: 1 }}
              onClick={() => setScope('all')}
            >
              Entire Audio Track
            </button>
            <button
              type="button"
              className={`btn btn-sm ${scope === 'selection' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ flex: 1 }}
              disabled={!hasSelection}
              onClick={() => setScope('selection')}
            >
              Selected Region Only
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
};
