import React from 'react';

export interface SliderProps {
  label?: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  onChange: (val: number) => void;
  disabled?: boolean;
}

export const Slider: React.FC<SliderProps> = ({
  label,
  value,
  min,
  max,
  step = 1,
  unit = '',
  onChange,
  disabled = false
}) => {
  return (
    <div className="form-group">
      {label && (
        <div className="form-label">
          <span>{label}</span>
          <span className="mono" style={{ color: 'var(--accent-cyan)' }}>
            {value > 0 && unit === 'dB' ? `+${value}` : value} {unit}
          </span>
        </div>
      )}
      <input
        type="range"
        className="custom-slider"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(parseFloat(e.target.value))}
      />
    </div>
  );
};
