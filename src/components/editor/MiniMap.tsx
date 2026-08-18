import React, { useRef, useEffect } from 'react';
import { getDecimatedPeaks } from '../../audio/BufferUtils';

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

export const MiniMap: React.FC<MiniMapProps> = React.memo(({
  buffer,
  duration,
  currentTime,
  viewportStart,
  viewportEnd,
  onSeekViewport,
  width,
  height = 36
}) => {
  const baseCanvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const isDraggingRef = useRef(false);

  // 1. Draw static overview waveform ONLY when buffer, duration, width, or height change
  useEffect(() => {
    const canvas = baseCanvasRef.current;
    if (!canvas || !buffer || width <= 0 || duration <= 0) return;

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
    ctx.fillStyle = '#080a0f';
    ctx.fillRect(0, 0, width, height);

    // Fast overview peak rendering using precomputed decimated peak cache in a single batched path
    const peaks = getDecimatedPeaks(buffer, 8192);
    const mins = peaks.mins[0];
    const maxs = peaks.maxs[0];
    const totalBuckets = peaks.totalBuckets;
    const midY = height / 2;

    ctx.fillStyle = '#1e3a5f';
    ctx.beginPath();
    for (let x = 0; x < width; x += 3) {
      const bucketIdx = Math.floor((x / width) * totalBuckets);
      const min = bucketIdx < mins.length ? mins[bucketIdx] : 0;
      const max = bucketIdx < maxs.length ? maxs[bucketIdx] : 0;

      const h = Math.max(1, (max - min) * (midY - 2));
      ctx.rect(x, midY - h / 2, 2, h);
    }
    ctx.fill();

    ctx.restore();
  }, [buffer, duration, width, height]);

  // 2. Draw overlay (Viewport indicator & Playhead) efficiently (<0.01ms) on time or viewport updates
  useEffect(() => {
    const canvas = overlayCanvasRef.current;
    if (!canvas || width <= 0 || duration <= 0) return;

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
    if (playheadX >= 0 && playheadX <= width) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(playheadX - 1, 0, 2, height);
    }

    ctx.restore();
  }, [duration, currentTime, viewportStart, viewportEnd, width, height]);

  const handlePointerDown = (e: React.PointerEvent) => {
    isDraggingRef.current = true;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    handlePointerMove(e);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDraggingRef.current || duration <= 0) return;
    const rect = overlayCanvasRef.current?.getBoundingClientRect();
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
    <div
      style={{
        position: 'relative',
        width: '100%',
        maxWidth: '100vw',
        height,
        borderBottom: '1px solid var(--border-subtle)',
        overflow: 'hidden',
        touchAction: 'none'
      }}
    >
      {/* Static Waveform Layer */}
      <canvas
        ref={baseCanvasRef}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: `${width}px`,
          height: `${height}px`,
          display: 'block'
        }}
      />
      {/* Interactive Overlay Layer */}
      <canvas
        ref={overlayCanvasRef}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: `${width}px`,
          height: `${height}px`,
          display: 'block',
          cursor: 'pointer'
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      />
    </div>
  );
});
MiniMap.displayName = 'MiniMap';
