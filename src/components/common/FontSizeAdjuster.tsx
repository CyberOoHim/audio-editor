import React from 'react';
import { Minus, Plus, Type } from 'lucide-react';

export interface FontSizeAdjusterProps {
  fontScale: number;
  onDecrease: () => void;
  onIncrease: () => void;
  onReset: () => void;
  minScale?: number;
  maxScale?: number;
}

export const FontSizeAdjuster: React.FC<FontSizeAdjusterProps> = ({
  fontScale,
  onDecrease,
  onIncrease,
  onReset,
  minScale = 0.8,
  maxScale = 1.5
}) => {
  const percentage = Math.round(fontScale * 100);
  const isDefault = Math.abs(fontScale - 1.0) < 0.01;
  const isMin = fontScale <= minScale + 0.01;
  const isMax = fontScale >= maxScale - 0.01;

  return (
    <div
      className="font-size-adjuster"
      title="Adjust Overall UI Text Font Size"
      role="group"
      aria-label="Font size adjustment controls"
    >
      <button
        type="button"
        className="font-size-btn"
        onClick={onDecrease}
        disabled={isMin}
        title={isMin ? 'Minimum font size reached' : `Decrease font size (${Math.max(Math.round(minScale * 100), percentage - 10)}%)`}
        aria-label="Decrease UI font size"
      >
        <Minus size={13} />
      </button>

      <button
        type="button"
        className="font-size-display"
        onClick={onReset}
        title={isDefault ? 'Font size is 100% (Default)' : 'Click to reset font size to 100%'}
        aria-label={`Current font size is ${percentage}%. Click to reset to 100%`}
      >
        <Type
          size={12}
          style={{
            color: !isDefault ? 'var(--accent-cyan)' : 'var(--text-muted)',
            flexShrink: 0
          }}
        />
        <span>{percentage}%</span>
      </button>

      <button
        type="button"
        className="font-size-btn"
        onClick={onIncrease}
        disabled={isMax}
        title={isMax ? 'Maximum font size reached' : `Increase font size (${Math.min(Math.round(maxScale * 100), percentage + 10)}%)`}
        aria-label="Increase UI font size"
      >
        <Plus size={13} />
      </button>
    </div>
  );
};
