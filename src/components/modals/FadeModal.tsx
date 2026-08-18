import React, { useState, useEffect } from 'react';
import { TrendingUp, TrendingDown, Sparkles, Activity } from 'lucide-react';
import { Modal } from '../common/Modal';
import { Slider } from '../common/Slider';
import type { AudioSelection, FadeCurve, FadeType, FadePosition } from '../../types/audio';

export interface FadeModalProps {
  isOpen: boolean;
  onClose: () => void;
  selection: AudioSelection | null;
  trackDuration: number;
  currentTime: number;
  initialType?: FadeType;
  onApplyFade: (
    type: FadeType,
    durationSec: number,
    curve: FadeCurve,
    position: FadePosition
  ) => void;
}

export const FadeModal: React.FC<FadeModalProps> = ({
  isOpen,
  onClose,
  selection,
  trackDuration,
  currentTime: _currentTime,
  initialType = 'in',
  onApplyFade
}) => {
  const hasSelection = Boolean(selection && selection.end > selection.start);
  const selectionDuration = hasSelection ? selection!.end - selection!.start : 0;

  const [fadeType, setFadeType] = useState<FadeType>(initialType);
  const [duration, setDuration] = useState<number>(() => {
    if (hasSelection && selectionDuration > 0) {
      return Math.round(selectionDuration * 100) / 100;
    }
    return 1.5;
  });
  const [curve, setCurve] = useState<FadeCurve>('linear');
  const [position, setPosition] = useState<FadePosition>(() => {
    if (hasSelection) return 'selection';
    return initialType === 'in' ? 'start' : 'end';
  });

  // When modal opens or initialType changes, update defaults
  useEffect(() => {
    if (isOpen) {
      setFadeType(initialType);
      if (hasSelection && selectionDuration > 0) {
        setDuration(Math.max(0.05, Math.min(30, Math.round(selectionDuration * 100) / 100)));
        setPosition('selection');
      } else {
        setDuration((prev) => (prev > 0 ? prev : 1.5));
        setPosition(initialType === 'in' ? 'start' : 'end');
      }
    }
  }, [isOpen, initialType, hasSelection, selectionDuration]);

  // If user switches fadeType manually and no selection is active, adjust smart default position
  const handleTypeChange = (newType: FadeType) => {
    setFadeType(newType);
    if (!hasSelection || position !== 'selection') {
      setPosition(newType === 'in' ? 'start' : 'end');
    }
  };

  const handleApply = () => {
    const safeDuration = Math.max(0.01, Math.min(trackDuration || 300, duration));
    onApplyFade(fadeType, safeDuration, curve, position);
    onClose();
  };

  // Generate SVG points for curve visualization
  const renderCurvePreview = () => {
    const width = 360;
    const height = 90;
    const padding = 12;
    const plotW = width - padding * 2;
    const plotH = height - padding * 2;
    const points: string[] = [];

    const steps = 60;
    for (let s = 0; s <= steps; s++) {
      const progress = s / steps;
      let factor = fadeType === 'in' ? progress : 1 - progress;

      switch (curve) {
        case 'exponential':
          factor = fadeType === 'in' ? Math.pow(progress, 2) : Math.pow(1 - progress, 2);
          break;
        case 'logarithmic':
          factor = fadeType === 'in' ? Math.sqrt(progress) : Math.sqrt(1 - progress);
          break;
        case 's-curve':
          factor = fadeType === 'in'
            ? 0.5 - 0.5 * Math.cos(progress * Math.PI)
            : 0.5 + 0.5 * Math.cos(progress * Math.PI);
          break;
        case 'linear':
        default:
          break;
      }

      const x = padding + progress * plotW;
      const y = padding + (1 - factor) * plotH;
      points.push(`${x.toFixed(1)},${y.toFixed(1)}`);
    }

    const pathData = `M ${points.join(' L ')}`;
    const areaData = `${pathData} L ${padding + plotW},${padding + plotH} L ${padding},${padding + plotH} Z`;

    const accentColor = fadeType === 'in' ? 'var(--accent-emerald, #10b981)' : 'var(--accent-amber, #f59e0b)';
    const gradientId = `fadeGrad_${fadeType}_${curve}`;

    return (
      <div style={{
        background: 'radial-gradient(ellipse at top, #111827 0%, #090d16 100%)',
        border: '1px solid var(--border-medium)',
        borderRadius: 'var(--radius-md)',
        padding: '10px 12px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 6
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', fontSize: 11, color: 'var(--text-muted)' }}>
          <span>Envelope Preview: <strong style={{ color: 'var(--text-primary)' }}>{curve.toUpperCase()}</strong></span>
          <span className="mono" style={{ color: accentColor }}>{duration.toFixed(2)}s duration</span>
        </div>

        <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', height: 75, overflow: 'visible' }}>
          <defs>
            <linearGradient id={gradientId} x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor={accentColor} stopOpacity="0.35" />
              <stop offset="100%" stopColor={accentColor} stopOpacity="0.02" />
            </linearGradient>
          </defs>

          {/* Grid lines */}
          <line x1={padding} y1={padding} x2={padding + plotW} y2={padding} stroke="var(--border-subtle)" strokeDasharray="3 3" />
          <line x1={padding} y1={padding + plotH / 2} x2={padding + plotW} y2={padding + plotH / 2} stroke="var(--border-subtle)" strokeDasharray="3 3" />
          <line x1={padding} y1={padding + plotH} x2={padding + plotW} y2={padding + plotH} stroke="var(--border-subtle)" />

          {/* Shaded Area */}
          <path d={areaData} fill={`url(#${gradientId})`} />

          {/* Curve Line */}
          <path d={pathData} fill="none" stroke={accentColor} strokeWidth="2.5" strokeLinecap="round" />

          {/* Start and End nodes */}
          <circle cx={padding} cy={fadeType === 'in' ? padding + plotH : padding} r="4" fill={accentColor} />
          <circle cx={padding + plotW} cy={fadeType === 'in' ? padding : padding + plotH} r="4" fill={accentColor} />
        </svg>

        <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', fontSize: 10, color: 'var(--text-muted)' }}>
          <span>{fadeType === 'in' ? '0% (Silence)' : '100% (0dB)'}</span>
          <span>{fadeType === 'in' ? '100% (0dB)' : '0% (Silence)'}</span>
        </div>
      </div>
    );
  };

  const presets = [0.1, 0.25, 0.5, 1.0, 2.0, 3.0, 5.0];

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Fade Envelope Settings"
      maxWidth="480px"
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            onClick={handleApply}
            style={{
              background: fadeType === 'in'
                ? 'linear-gradient(135deg, #059669, #10b981)'
                : 'linear-gradient(135deg, #d97706, #f59e0b)'
            }}
          >
            {fadeType === 'in' ? <TrendingUp size={15} /> : <TrendingDown size={15} />}
            Apply {fadeType === 'in' ? 'Fade In' : 'Fade Out'} ({duration.toFixed(2)}s)
          </button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Fade Type Switcher */}
        <div className="form-group">
          <label className="form-label">Fade Direction</label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <button
              type="button"
              className={`btn ${fadeType === 'in' ? 'btn-primary' : 'btn-secondary'}`}
              style={fadeType === 'in' ? { background: 'linear-gradient(135deg, #059669, #10b981)' } : {}}
              onClick={() => handleTypeChange('in')}
            >
              <TrendingUp size={16} /> Fade In (Volume Up)
            </button>
            <button
              type="button"
              className={`btn ${fadeType === 'out' ? 'btn-primary' : 'btn-secondary'}`}
              style={fadeType === 'out' ? { background: 'linear-gradient(135deg, #d97706, #f59e0b)' } : {}}
              onClick={() => handleTypeChange('out')}
            >
              <TrendingDown size={16} /> Fade Out (Volume Down)
            </button>
          </div>
        </div>

        {/* Visual Graph Preview */}
        {renderCurvePreview()}

        {/* Duration Control */}
        <div className="form-group">
          <div className="form-label">
            <span>Fade Duration</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input
                type="number"
                min="0.05"
                max="60"
                step="0.05"
                value={duration}
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  if (!isNaN(val) && val >= 0) setDuration(val);
                }}
                className="form-input mono"
                style={{ width: 70, height: 26, padding: '2px 6px', fontSize: 12, textAlign: 'right' }}
              />
              <span className="mono" style={{ color: 'var(--accent-cyan)', fontSize: 12 }}>sec</span>
            </div>
          </div>

          <Slider
            value={duration}
            min={0.05}
            max={Math.min(30, Math.max(10, Math.round(trackDuration || 30)))}
            step={0.05}
            unit="sec"
            onChange={(val) => setDuration(Math.round(val * 100) / 100)}
          />

          {/* Duration Quick Preset Chips */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 4 }}>
            {presets.map((p) => (
              <button
                key={p}
                type="button"
                className={`btn btn-sm ${Math.abs(duration - p) < 0.01 ? 'btn-primary' : 'btn-secondary'}`}
                style={{ height: 24, padding: '0 8px', fontSize: 11 }}
                onClick={() => setDuration(p)}
              >
                {p}s
              </button>
            ))}

            {hasSelection && selectionDuration > 0 && (
              <button
                type="button"
                className={`btn btn-sm ${Math.abs(duration - selectionDuration) < 0.01 ? 'btn-primary' : 'btn-secondary'}`}
                style={{ height: 24, padding: '0 8px', fontSize: 11, color: 'var(--accent-cyan)' }}
                onClick={() => {
                  setDuration(Math.round(selectionDuration * 100) / 100);
                  setPosition('selection');
                }}
              >
                <Sparkles size={11} /> Selection ({selectionDuration.toFixed(2)}s)
              </button>
            )}
          </div>
        </div>

        {/* Curve Type Selector */}
        <div className="form-group">
          <label className="form-label">
            <span>Mathematical Curve Shape</span>
            <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>Acoustic Profile</span>
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6 }}>
            {[
              { id: 'linear', name: 'Linear', desc: 'Uniform transition' },
              { id: 'logarithmic', name: 'Logarithmic', desc: 'Perceptual ear response' },
              { id: 'exponential', name: 'Exponential', desc: 'Gentle slow curve' },
              { id: 's-curve', name: 'S-Curve (Equal Power)', desc: 'Constant perceived volume' }
            ].map((item) => (
              <button
                key={item.id}
                type="button"
                className={`btn ${curve === item.id ? 'btn-primary' : 'btn-secondary'}`}
                style={{
                  height: 'auto',
                  padding: '8px 10px',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'flex-start',
                  textAlign: 'left'
                }}
                onClick={() => setCurve(item.id as FadeCurve)}
              >
                <span style={{ fontWeight: 600, fontSize: 12 }}>{item.name}</span>
                <span style={{ fontSize: 10, opacity: 0.75 }}>{item.desc}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Position / Scope Selector */}
        <div className="form-group">
          <label className="form-label">
            <span>Apply Placement</span>
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: hasSelection ? 'repeat(3, 1fr)' : 'repeat(2, 1fr)', gap: 6 }}>
            <button
              type="button"
              className={`btn btn-sm ${position === 'start' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setPosition('start')}
            >
              Beginning (0.0s)
            </button>
            <button
              type="button"
              className={`btn btn-sm ${position === 'end' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setPosition('end')}
            >
              Track End
            </button>
            {hasSelection && (
              <button
                type="button"
                className={`btn btn-sm ${position === 'selection' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setPosition('selection')}
              >
                <Activity size={12} /> Active Selection
              </button>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
};
