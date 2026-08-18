import React, { useRef, useCallback } from 'react';

export interface KnobProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  defaultValue?: number;
  unit?: string;
  onChange: (val: number) => void;
}

export const Knob: React.FC<KnobProps> = ({
  label,
  value,
  min,
  max,
  step = 1,
  defaultValue = 0,
  unit = 'dB',
  onChange
}) => {
  const startYRef = useRef<number | null>(null);
  const startValRef = useRef<number>(value);

  // Map value to angle (-135deg to +135deg, total 270deg)
  const norm = (value - min) / (max - min);
  const angle = -135 + norm * 270;

  const handlePointerDown = (e: React.PointerEvent) => {
    startYRef.current = e.clientY;
    startValRef.current = value;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (startYRef.current === null) return;
    const dy = startYRef.current - e.clientY; // drag up = increase
    const sensitivity = (max - min) / 120; // 120px full range
    let newVal = startValRef.current + dy * sensitivity;
    
    // Clamp and step
    newVal = Math.max(min, Math.min(max, newVal));
    if (step > 0) {
      newVal = Math.round(newVal / step) * step;
    }
    onChange(parseFloat(newVal.toFixed(1)));
  }, [max, min, step, onChange]);

  const handlePointerUp = (e: React.PointerEvent) => {
    startYRef.current = null;
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // Ignored
    }
  };

  const handleDoubleClick = () => {
    onChange(defaultValue);
  };

  return (
    <div className="knob-container" onDoubleClick={handleDoubleClick} title="Drag vertically to adjust, double-click to reset">
      <div
        className="knob-dial"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        style={{ transform: `rotate(${angle}deg)` }}
      >
        <div className="knob-pointer" />
      </div>
      <div className="knob-label">{label}</div>
      <div className="knob-value">
        {value > 0 && unit === 'dB' ? `+${value}` : value} {unit}
      </div>
    </div>
  );
};
