import React, { useRef, useEffect, useState } from 'react';
import { Hand, MousePointer } from 'lucide-react';
import type { AudioSelection } from '../../types/audio';
import { getDecimatedPeaks } from '../../audio/BufferUtils';

export interface MiniMapProps {
  buffer: AudioBuffer | null;
  duration: number;
  currentTime: number;
  viewportStart: number; // in seconds
  viewportEnd: number;   // in seconds
  selection?: AudioSelection | null;
  onSeekViewport: (startTime: number) => void;
  onSeekPlayhead?: (time: number) => void;
  onSelectRegion?: (selection: AudioSelection | null) => void;
  width: number;
  height?: number;
}

type MiniDragMode = 'none' | 'viewport-pan' | 'select-create' | 'select-handle-start' | 'select-handle-end';

export const MiniMap: React.FC<MiniMapProps> = React.memo(({
  buffer,
  duration,
  currentTime,
  viewportStart,
  viewportEnd,
  selection = null,
  onSeekViewport,
  onSeekPlayhead,
  onSelectRegion,
  width,
  height = 38
}) => {
  const baseCanvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const [miniMapMode, setMiniMapMode] = useState<'viewport' | 'select'>('viewport');
  const [dragMode, setDragMode] = useState<MiniDragMode>('none');
  const [hoverCursor, setHoverCursor] = useState<string>('pointer');

  const dragStartRef = useRef<{
    x: number;
    time: number;
    anchorTime: number;
    initialSelection: AudioSelection | null;
  }>({
    x: 0,
    time: 0,
    anchorTime: 0,
    initialSelection: null
  });

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

    // Fast overview peak rendering using precomputed decimated peak cache
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

  // 2. Draw overlay (Selection, Viewport indicator & Playhead) efficiently
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

    // 2a. Render Selection Region on Overview Map
    if (selection && selection.end > selection.start) {
      const selLeft = Math.max(0, (selection.start / duration) * width);
      const selRight = Math.min(width, (selection.end / duration) * width);
      const selWidth = Math.max(2, selRight - selLeft);

      // Distinct Glowing Selection Highlight
      ctx.fillStyle = 'rgba(56, 189, 248, 0.35)';
      ctx.fillRect(selLeft, 0, selWidth, height);

      ctx.fillStyle = '#38bdf8';
      ctx.fillRect(selLeft - 1, 0, 2, height);
      ctx.fillRect(selRight - 1, 0, 2, height);

      // Handle Knobs
      ctx.beginPath();
      ctx.arc(selLeft, 6, 3, 0, Math.PI * 2);
      ctx.arc(selLeft, height - 6, 3, 0, Math.PI * 2);
      ctx.arc(selRight, 6, 3, 0, Math.PI * 2);
      ctx.arc(selRight, height - 6, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    // 2b. Render Viewport Window Highlight (Glass overlay)
    const vpLeft = Math.max(0, (viewportStart / duration) * width);
    const vpRight = Math.min(width, (viewportEnd / duration) * width);
    const vpWidth = Math.max(8, vpRight - vpLeft);

    ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.fillRect(vpLeft, 0, vpWidth, height);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(vpLeft + 0.5, 0.5, vpWidth - 1, height - 1);

    // 2c. Render Playhead marker
    const playheadX = (currentTime / duration) * width;
    if (playheadX >= 0 && playheadX <= width) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(playheadX - 1, 0, 2, height);
    }

    ctx.restore();
  }, [duration, currentTime, viewportStart, viewportEnd, selection, width, height]);

  const handlePointerDown = (e: React.PointerEvent) => {
    if (duration <= 0) return;
    const rect = overlayCanvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
    const targetTime = (x / rect.width) * duration;

    const HANDLE_HIT_PX = 10;
    let activeDragMode: MiniDragMode = miniMapMode === 'select' ? 'select-create' : 'viewport-pan';
    let anchorTime = targetTime;

    if (selection && selection.end > selection.start) {
      const selLeft = (selection.start / duration) * rect.width;
      const selRight = (selection.end / duration) * rect.width;

      if (Math.abs(x - selLeft) <= HANDLE_HIT_PX) {
        activeDragMode = 'select-handle-start';
      } else if (Math.abs(x - selRight) <= HANDLE_HIT_PX) {
        activeDragMode = 'select-handle-end';
      }
    }

    if (e.shiftKey) {
      activeDragMode = 'select-create';
      if (selection && selection.end > selection.start) {
        const distToStart = Math.abs(targetTime - selection.start);
        const distToEnd = Math.abs(targetTime - selection.end);
        anchorTime = distToStart < distToEnd ? selection.end : selection.start;
      } else {
        anchorTime = currentTime;
      }
      if (onSelectRegion) {
        onSelectRegion({
          start: Math.min(anchorTime, targetTime),
          end: Math.max(anchorTime, targetTime)
        });
      }
    }

    setDragMode(activeDragMode);
    dragStartRef.current = {
      x,
      time: targetTime,
      anchorTime,
      initialSelection: selection ? { ...selection } : null
    };

    (e.target as HTMLElement).setPointerCapture(e.pointerId);

    // Initial move execution
    if (activeDragMode === 'viewport-pan') {
      const vpDuration = viewportEnd - viewportStart;
      const newStart = Math.max(0, Math.min(duration - vpDuration, targetTime - vpDuration / 2));
      onSeekViewport(newStart);
      if (onSeekPlayhead) {
        onSeekPlayhead(targetTime);
      }
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    const rect = overlayCanvasRef.current?.getBoundingClientRect();
    if (!rect || duration <= 0) return;

    const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
    const targetTime = Math.max(0, Math.min(duration, (x / rect.width) * duration));

    // Hover cursor feedback when not dragging
    if (dragMode === 'none') {
      if (selection && selection.end > selection.start) {
        const selLeft = (selection.start / duration) * rect.width;
        const selRight = (selection.end / duration) * rect.width;
        if (Math.abs(x - selLeft) <= 10 || Math.abs(x - selRight) <= 10) {
          setHoverCursor('col-resize');
          return;
        }
      }
      setHoverCursor(miniMapMode === 'select' ? 'crosshair' : 'pointer');
      return;
    }

    if (dragMode === 'viewport-pan') {
      const vpDuration = viewportEnd - viewportStart;
      const newStart = Math.max(0, Math.min(duration - vpDuration, targetTime - vpDuration / 2));
      onSeekViewport(newStart);
    } else if (dragMode === 'select-create') {
      const anchor = dragStartRef.current.anchorTime;
      const start = Math.min(anchor, targetTime);
      const end = Math.max(anchor, targetTime);
      if (end - start > 0.01 && onSelectRegion) {
        onSelectRegion({ start, end });
      }
    } else if (dragMode === 'select-handle-start') {
      if (selection && onSelectRegion) {
        const newStart = Math.min(selection.end - 0.01, Math.max(0, targetTime));
        onSelectRegion({ start: newStart, end: selection.end });
      }
    } else if (dragMode === 'select-handle-end') {
      if (selection && onSelectRegion) {
        const newEnd = Math.max(selection.start + 0.01, Math.min(duration, targetTime));
        onSelectRegion({ start: selection.start, end: newEnd });
      }
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    setDragMode('none');
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
      {/* MiniMap Mode Dock */}
      <div className="minimap-mode-dock">
        <button
          type="button"
          className={`minimap-mode-btn ${miniMapMode === 'viewport' ? 'active' : ''}`}
          onClick={(e) => {
            e.stopPropagation();
            setMiniMapMode('viewport');
          }}
          title="Viewport Pan: Click or drag on MiniMap to scroll timeline"
        >
          <Hand size={11} />
          <span>Nav</span>
        </button>
        <button
          type="button"
          className={`minimap-mode-btn ${miniMapMode === 'select' ? 'active' : ''}`}
          onClick={(e) => {
            e.stopPropagation();
            setMiniMapMode('select');
          }}
          title="Range Select: Drag on MiniMap to select full-track period"
        >
          <MousePointer size={11} />
          <span>Select</span>
        </button>
      </div>

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
          cursor: dragMode === 'select-handle-start' || dragMode === 'select-handle-end'
            ? 'col-resize'
            : dragMode === 'select-create'
            ? 'crosshair'
            : hoverCursor
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

