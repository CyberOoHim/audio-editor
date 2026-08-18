import React, { useEffect, useRef, useState } from 'react';
import type { AudioSelection } from '../../types/audio';

export interface TimeRulerProps {
  duration: number;
  zoom: number; // pixels per second
  scrollLeft: number;
  width: number;
  height?: number;
  selection?: AudioSelection | null;
  currentTime?: number;
  onSeek?: (time: number) => void;
  onSelectRegion?: (selection: AudioSelection | null) => void;
}

export const TimeRuler: React.FC<TimeRulerProps> = React.memo(({
  duration,
  zoom,
  scrollLeft,
  width,
  height = 24,
  selection = null,
  currentTime = 0,
  onSeek,
  onSelectRegion
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{ x: number; time: number; anchorTime: number }>({ x: 0, time: 0, anchorTime: 0 });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || width <= 0) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 1.25);
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

    // Selection highlight along the ruler
    if (selection && selection.end > selection.start) {
      const selStartX = selection.start * zoom - scrollLeft;
      const selEndX = selection.end * zoom - scrollLeft;
      const selWidth = selEndX - selStartX;
      ctx.fillStyle = 'rgba(56, 189, 248, 0.25)';
      ctx.fillRect(selStartX, 0, selWidth, height);
      ctx.fillStyle = '#38bdf8';
      ctx.fillRect(selStartX - 1, height - 3, selWidth + 2, 3);
    }

    // Playhead marker on ruler
    const playheadX = currentTime * zoom - scrollLeft;
    if (playheadX >= -2 && playheadX <= width + 2) {
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(playheadX - 4, 0);
      ctx.lineTo(playheadX + 4, 0);
      ctx.lineTo(playheadX, 6);
      ctx.closePath();
      ctx.fill();
    }

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
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';

    const firstTick = Math.floor(startTime / subInterval) * subInterval;
    const labels: Array<{ text: string; x: number }> = [];

    // Batch all tick marks in a single path
    ctx.fillStyle = '#475569';
    ctx.beginPath();
    for (let t = firstTick; t <= endTime + subInterval; t += subInterval) {
      const x = Math.round(t * zoom - scrollLeft);
      if (x < -10 || x > width + 10) continue;

      const isMajor = Math.abs(t % interval) < 0.0001 || Math.abs((t % interval) - interval) < 0.0001;

      if (isMajor) {
        ctx.rect(x, height - 8, 1, 8);

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

        labels.push({ text: label, x: x + 3 });
      } else {
        ctx.rect(x, height - 4, 1, 4);
      }
    }
    ctx.fill();

    // Render time labels
    ctx.fillStyle = '#94a3b8';
    for (let i = 0; i < labels.length; i++) {
      ctx.fillText(labels[i].text, labels[i].x, height / 2 - 2);
    }

    ctx.restore();
  }, [duration, zoom, scrollLeft, width, height, selection, currentTime]);

  const handlePointerDown = (e: React.PointerEvent) => {
    if (duration <= 0) return;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const x = e.clientX - rect.left;
    const clickTime = Math.max(0, Math.min(duration, (scrollLeft + x) / zoom));

    let anchorTime = clickTime;
    if (e.shiftKey) {
      if (selection && selection.end > selection.start) {
        const distToStart = Math.abs(clickTime - selection.start);
        const distToEnd = Math.abs(clickTime - selection.end);
        anchorTime = distToStart < distToEnd ? selection.end : selection.start;
      } else {
        anchorTime = currentTime;
      }
      if (onSelectRegion) {
        onSelectRegion({
          start: Math.min(anchorTime, clickTime),
          end: Math.max(anchorTime, clickTime)
        });
      }
    } else {
      if (onSeek) {
        onSeek(clickTime);
      }
    }

    setIsDragging(true);
    dragStartRef.current = { x, time: clickTime, anchorTime };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging || duration <= 0) return;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const x = e.clientX - rect.left;
    const currentTimeAtPointer = Math.max(0, Math.min(duration, (scrollLeft + x) / zoom));

    if (e.shiftKey || Math.abs(x - dragStartRef.current.x) > 6) {
      const anchor = dragStartRef.current.anchorTime;
      const start = Math.min(anchor, currentTimeAtPointer);
      const end = Math.max(anchor, currentTimeAtPointer);
      if (end - start > 0.005 && onSelectRegion) {
        onSelectRegion({ start, end });
      }
    } else if (onSeek) {
      onSeek(currentTimeAtPointer);
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    setIsDragging(false);
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // Ignored
    }
  };

  return (
    <div
      style={{
        width: '100%',
        maxWidth: '100vw',
        height: `${height}px`,
        overflow: 'hidden',
        touchAction: 'none',
        cursor: 'pointer'
      }}
    >
      <canvas
        ref={canvasRef}
        style={{
          width: `${width}px`,
          height: `${height}px`,
          display: 'block'
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      />
    </div>
  );
});
TimeRuler.displayName = 'TimeRuler';

