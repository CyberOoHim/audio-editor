import React, { useEffect, useRef } from 'react';

export interface TimeRulerProps {
  duration: number;
  zoom: number; // pixels per second
  scrollLeft: number;
  width: number;
  height?: number;
}

export const TimeRuler: React.FC<TimeRulerProps> = React.memo(({
  duration,
  zoom,
  scrollLeft,
  width,
  height = 24
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || width <= 0) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const targetW = Math.round(width * dpr);
    const targetH = Math.round(height * dpr);

    if (canvas.width !== targetW || canvas.height !== targetH) {
      canvas.width = targetW;
      canvas.height = targetH;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    // Background
    ctx.fillStyle = '#0b0f17';
    ctx.fillRect(0, 0, width, height);

    // Bottom divider
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(0, height - 1, width, 1);

    // Calculate time interval based on zoom
    const targetPx = 80; // approximate pixels between major tick marks
    const roughSec = targetPx / zoom;
    const intervals = [0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300];
    let interval = intervals[intervals.length - 1];
    for (const val of intervals) {
      if (val >= roughSec) {
        interval = val;
        break;
      }
    }

    const subInterval = interval / 5;

    const startTime = Math.max(0, scrollLeft / zoom);
    const endTime = Math.min(duration, (scrollLeft + width) / zoom);

    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.fillStyle = '#64748b';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';

    const firstTick = Math.floor(startTime / subInterval) * subInterval;
    for (let t = firstTick; t <= endTime + subInterval; t += subInterval) {
      const x = t * zoom - scrollLeft;
      if (x < -10 || x > width + 10) continue;

      const isMajor = Math.abs(t % interval) < 0.0001 || Math.abs((t % interval) - interval) < 0.0001;

      if (isMajor) {
        ctx.fillStyle = '#475569';
        ctx.fillRect(x, height - 8, 1, 8);

        // Format time label
        const m = Math.floor(t / 60);
        const s = Math.floor(t % 60);
        const ms = Math.floor((t % 1) * 1000);
        
        let label = '';
        if (interval < 0.1) {
          label = `${m > 0 ? m + ':' : ''}${s}.${ms < 10 ? '00' : ms < 100 ? '0' : ''}${ms}s`;
        } else if (interval < 1) {
          const dec = Math.floor((t % 1) * 10);
          label = `${m > 0 ? m + ':' : ''}${s}.${dec}s`;
        } else {
          label = `${m}:${s < 10 ? '0' : ''}${s}`;
        }

        ctx.fillStyle = '#94a3b8';
        ctx.fillText(label, x + 3, height / 2 - 2);
      } else {
        ctx.fillStyle = '#334155';
        ctx.fillRect(x, height - 4, 1, 4);
      }
    }

    ctx.restore();
  }, [duration, zoom, scrollLeft, width, height]);

  return (
    <div style={{ width: '100%', maxWidth: '100vw', height: `${height}px`, overflow: 'hidden', touchAction: 'none' }}>
      <canvas
        ref={canvasRef}
        style={{
          width: `${width}px`,
          height: `${height}px`,
          display: 'block'
        }}
      />
    </div>
  );
});
TimeRuler.displayName = 'TimeRuler';
