import React, { useRef, useEffect } from 'react';

export interface MiniMapProps {
  buffer: AudioBuffer | null;
  duration: number;
  currentTime: number;
  viewportStart: number; // in seconds
  viewportEnd: number;   // in seconds
  onSeekViewport: (startTime: number) => void;
  width: number;
  height?: number;
}

export const MiniMap: React.FC<MiniMapProps> = ({
  buffer,
  duration,
  currentTime,
  viewportStart,
  viewportEnd,
  onSeekViewport,
  width,
  height = 36
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDraggingRef = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !buffer || width <= 0 || duration <= 0) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    // Background
    ctx.fillStyle = '#080a0f';
    ctx.fillRect(0, 0, width, height);

    // Render overview waveform
    const dataL = buffer.getChannelData(0);
    const step = Math.ceil(dataL.length / width);
    const midY = height / 2;

    ctx.fillStyle = '#1e3a5f';
    for (let x = 0; x < width; x++) {
      let min = 1.0;
      let max = -1.0;
      const startIdx = x * step;
      const endIdx = Math.min(startIdx + step, dataL.length);

      for (let j = startIdx; j < endIdx; j += 4) {
        const val = dataL[j];
        if (val < min) min = val;
        if (val > max) max = val;
      }

      if (max < min) {
        min = 0;
        max = 0;
      }

      const h = Math.max(1, (max - min) * (midY - 2));
      ctx.fillRect(x, midY - h / 2, 1, h);
    }

    // Render Viewport Window Highlight
    const vpLeft = Math.max(0, (viewportStart / duration) * width);
    const vpRight = Math.min(width, (viewportEnd / duration) * width);
    const vpWidth = Math.max(8, vpRight - vpLeft);

    ctx.fillStyle = 'rgba(56, 189, 248, 0.15)';
    ctx.fillRect(vpLeft, 0, vpWidth, height);
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 1;
    ctx.strokeRect(vpLeft, 0.5, vpWidth, height - 1);

    // Render Playhead marker
    const playheadX = (currentTime / duration) * width;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(playheadX - 1, 0, 2, height);
  }, [buffer, duration, currentTime, viewportStart, viewportEnd, width, height]);

  const handlePointerDown = (e: React.PointerEvent) => {
    isDraggingRef.current = true;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    handlePointerMove(e);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDraggingRef.current || duration <= 0) return;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
    const targetTime = (x / rect.width) * duration;
    const vpDuration = viewportEnd - viewportStart;
    const newStart = Math.max(0, Math.min(duration - vpDuration, targetTime - vpDuration / 2));
    onSeekViewport(newStart);
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    isDraggingRef.current = false;
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // Ignored
    }
  };

  if (!buffer) return null;

  return (
    <div style={{ position: 'relative', width, height, borderBottom: '1px solid var(--border-subtle)' }}>
      <canvas
        ref={canvasRef}
        style={{ width: `${width}px`, height: `${height}px`, display: 'block', cursor: 'pointer' }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      />
    </div>
  );
};
