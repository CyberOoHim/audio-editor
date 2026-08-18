import React from 'react';

export interface VuMeterProps {
  peakL: number; // 0 to 1
  peakR: number; // 0 to 1
  height?: number;
}

export const VuMeter: React.FC<VuMeterProps> = ({ peakL, peakR, height = 12 }) => {
  const normL = Math.min(100, Math.max(0, peakL * 100));
  const normR = Math.min(100, Math.max(0, peakR * 100));

  const isClippingL = peakL > 0.95;
  const isClippingR = peakR > 0.95;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, width: '100%' }}>
      {/* Left Channel Meter */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, color: 'var(--text-muted)' }}>
        <span style={{ width: 12, fontWeight: 700 }}>L</span>
        <div style={{
          flex: 1,
          height,
          backgroundColor: '#0b0f17',
          borderRadius: 3,
          overflow: 'hidden',
          position: 'relative',
          border: '1px solid var(--border-subtle)'
        }}>
          <div
            style={{
              width: `${normL}%`,
              height: '100%',
              background: isClippingL
                ? 'linear-gradient(90deg, #10b981 60%, #f59e0b 85%, #f43f5e 100%)'
                : 'linear-gradient(90deg, #10b981 70%, #f59e0b 90%)',
              transition: 'width 0.05s ease-out'
            }}
          />
        </div>
      </div>

      {/* Right Channel Meter */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, color: 'var(--text-muted)' }}>
        <span style={{ width: 12, fontWeight: 700 }}>R</span>
        <div style={{
          flex: 1,
          height,
          backgroundColor: '#0b0f17',
          borderRadius: 3,
          overflow: 'hidden',
          position: 'relative',
          border: '1px solid var(--border-subtle)'
        }}>
          <div
            style={{
              width: `${normR}%`,
              height: '100%',
              background: isClippingR
                ? 'linear-gradient(90deg, #10b981 60%, #f59e0b 85%, #f43f5e 100%)'
                : 'linear-gradient(90deg, #10b981 70%, #f59e0b 90%)',
              transition: 'width 0.05s ease-out'
            }}
          />
        </div>
      </div>
    </div>
  );
};
