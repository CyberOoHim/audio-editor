import React, { useRef, useEffect, useState, useCallback } from 'react';
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
  mode?: 'viewport' | 'select';
  onModeChange?: (mode: 'viewport' | 'select') => void;
  onSeekViewport: (startTime: number) => void;
  onSeekPlayhead?: (time: number) => void;
  onSelectRegion?: (selection: AudioSelection | null) => void;
  width: number;
  height?: number;
}

type MiniDragMode =
  | 'none'
  | 'viewport-pan'
  | 'select-create'
  | 'select-handle-start'
  | 'select-handle-end';

export const MiniMap: React.FC<MiniMapProps> = React.memo(({
  buffer,
  duration,
  currentTime,
  viewportStart,
  viewportEnd,
  selection = null,
  mode: controlledMode,
  onModeChange,
  onSeekViewport,
  onSeekPlayhead,
  onSelectRegion,
  width,
  height = 38
}) => {
  const baseCanvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);

  const [internalMode, setInternalMode] = useState<'viewport' | 'select'>('viewport');
  const miniMapMode = controlledMode !== undefined ? controlledMode : internalMode;

  const handleSetMode = useCallback((newMode: 'viewport' | 'select') => {
    setInternalMode(newMode);
    if (onModeChange) {
      onModeChange(newMode);
    }
  }, [onModeChange]);

  const [dragMode, setDragMode] = useState<MiniDragMode>('none');
  const [hoverCursor, setHoverCursor] = useState<string>('pointer');

  const dragStartRef = useRef<{
    x: number;
    time: number;
    anchorTime: number;
    grabTimeOffset: number;
    initialSelection: AudioSelection | null;
  }>({
    x: 0,
    time: 0,
    anchorTime: 0,
    grabTimeOffset: 0,
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

  // 2. Draw overlay (Selection, Viewport indicator & Playhead) efficiently with differentiated visual styles based on active mode
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

    const isSelectMode = miniMapMode === 'select';

    // 2a. Render Selection Region on Overview Map
    if (selection && selection.end > selection.start) {
      const selLeft = Math.max(0, (selection.start / duration) * width);
      const selRight = Math.min(width, (selection.end / duration) * width);
      const selWidth = Math.max(2, selRight - selLeft);

      if (isSelectMode) {
        // SELECT MODE: Selection is PRIMARY & VIBRANT (Purple/Indigo theme matching Select button)
        ctx.fillStyle = 'rgba(139, 92, 246, 0.28)';
        ctx.fillRect(selLeft, 0, selWidth, height);

        // Vivid selection boundary lines
        ctx.fillStyle = '#a855f7';
        ctx.fillRect(selLeft - 1, 0, 2, height);
        ctx.fillRect(selRight - 1, 0, 2, height);

        // Interactive Handle Knobs (outer circle + inner bright core)
        ctx.fillStyle = '#a855f7';
        ctx.beginPath();
        ctx.arc(selLeft, 6, 3.5, 0, Math.PI * 2);
        ctx.arc(selLeft, height - 6, 3.5, 0, Math.PI * 2);
        ctx.arc(selRight, 6, 3.5, 0, Math.PI * 2);
        ctx.arc(selRight, height - 6, 3.5, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(selLeft, 6, 1.5, 0, Math.PI * 2);
        ctx.arc(selLeft, height - 6, 1.5, 0, Math.PI * 2);
        ctx.arc(selRight, 6, 1.5, 0, Math.PI * 2);
        ctx.arc(selRight, height - 6, 1.5, 0, Math.PI * 2);
        ctx.fill();

        // Duration Badge if selection is wide enough
        if (selWidth >= 44) {
          const selDur = selection.end - selection.start;
          const durText = `${selDur >= 10 ? selDur.toFixed(1) : selDur.toFixed(2)}s`;
          ctx.font = '9px "JetBrains Mono", monospace';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'top';
          const textMetrics = ctx.measureText(durText);
          const badgeW = textMetrics.width + 8;
          const badgeX = selLeft + selWidth / 2 - badgeW / 2;
          ctx.fillStyle = 'rgba(11, 15, 23, 0.8)';
          ctx.fillRect(badgeX, 2, badgeW, 12);
          ctx.fillStyle = '#e9d5ff';
          ctx.fillText(durText, selLeft + selWidth / 2, 3);
        }
      } else {
        // NAV MODE: Selection is SECONDARY & PASSIVE (Clean reference tint without interactive knobs)
        ctx.fillStyle = 'rgba(56, 189, 248, 0.14)';
        ctx.fillRect(selLeft, 0, selWidth, height);

        ctx.fillStyle = 'rgba(56, 189, 248, 0.45)';
        ctx.fillRect(selLeft, 0, 1, height);
        ctx.fillRect(selRight - 1, 0, 1, height);
      }
    }

    // 2b. Render Viewport Window Highlight (Glass lens)
    const vpLeft = Math.max(0, (viewportStart / duration) * width);
    const vpRight = Math.min(width, (viewportEnd / duration) * width);
    const vpWidth = Math.max(8, vpRight - vpLeft);

    if (!isSelectMode) {
      // NAV MODE: Viewport Lens is PRIMARY & ACTIVE (Cyan theme matching Nav button)
      ctx.fillStyle = 'rgba(0, 240, 255, 0.16)';
      ctx.fillRect(vpLeft, 0, vpWidth, height);

      // Glowing Cyan Border
      ctx.strokeStyle = '#00f0ff';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(vpLeft + 0.5, 0.5, vpWidth - 1, height - 1);

      // Edge grab bars
      ctx.fillStyle = '#00f0ff';
      ctx.fillRect(vpLeft, 0, 2, height);
      ctx.fillRect(vpRight - 2, 0, 2, height);

      // Center Grip Lines (affordance for draggable lens)
      if (vpWidth >= 22) {
        const midX = Math.round(vpLeft + vpWidth / 2);
        const midY = height / 2;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
        ctx.fillRect(midX - 3, midY - 4, 1.5, 8);
        ctx.fillRect(midX, midY - 4, 1.5, 8);
        ctx.fillRect(midX + 3, midY - 4, 1.5, 8);
      }
    } else {
      // SELECT MODE: Viewport Lens is SECONDARY & PASSIVE (Subtle background border)
      ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
      ctx.fillRect(vpLeft, 0, vpWidth, height);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
      ctx.lineWidth = 1;
      ctx.strokeRect(vpLeft + 0.5, 0.5, vpWidth - 1, height - 1);
    }

    // 2c. Render Playhead marker
    const playheadX = (currentTime / duration) * width;
    if (playheadX >= 0 && playheadX <= width) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(Math.round(playheadX) - 1, 0, 2, height);

      // Playhead Top Diamond
      ctx.beginPath();
      ctx.moveTo(playheadX - 3.5, 0);
      ctx.lineTo(playheadX + 3.5, 0);
      ctx.lineTo(playheadX, 4);
      ctx.closePath();
      ctx.fill();
    }

    ctx.restore();
  }, [duration, currentTime, viewportStart, viewportEnd, selection, miniMapMode, width, height]);

  const handlePointerDown = (e: React.PointerEvent) => {
    if (duration <= 0) return;
    const rect = overlayCanvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
    const targetTime = (x / rect.width) * duration;

    const vpLeft = (viewportStart / duration) * rect.width;
    const vpRight = (viewportEnd / duration) * rect.width;
    const vpDuration = viewportEnd - viewportStart;

    let activeDragMode: MiniDragMode = 'none';
    let anchorTime = targetTime;
    let grabOffset = 0;

    if (miniMapMode === 'viewport') {
      // NAV MODE BEHAVIOR:
      // Dragging viewport lens or clicking to jump/pan viewport.
      if (e.shiftKey) {
        // Shift + Drag in Nav mode allows quick range selection without switching modes
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
      } else if (x >= vpLeft && x <= vpRight) {
        activeDragMode = 'viewport-pan';
        grabOffset = targetTime - viewportStart;
      } else {
        activeDragMode = 'viewport-pan';
        grabOffset = vpDuration / 2;
        const newStart = Math.max(0, Math.min(duration - vpDuration, targetTime - vpDuration / 2));
        onSeekViewport(newStart);
        if (onSeekPlayhead) {
          onSeekPlayhead(targetTime);
        }
      }
    } else {
      // SELECT MODE BEHAVIOR:
      // Range selection creation or adjusting start/end handles.
      const HANDLE_HIT_PX = 10;
      let hitHandle = false;

      if (selection && selection.end > selection.start) {
        const selLeft = (selection.start / duration) * rect.width;
        const selRight = (selection.end / duration) * rect.width;

        if (Math.abs(x - selLeft) <= HANDLE_HIT_PX) {
          activeDragMode = 'select-handle-start';
          hitHandle = true;
        } else if (Math.abs(x - selRight) <= HANDLE_HIT_PX) {
          activeDragMode = 'select-handle-end';
          hitHandle = true;
        }
      }

      if (!hitHandle && e.shiftKey) {
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
      } else if (!hitHandle) {
        activeDragMode = 'select-create';
        anchorTime = targetTime;
      }
    }

    setDragMode(activeDragMode);
    dragStartRef.current = {
      x,
      time: targetTime,
      anchorTime,
      grabTimeOffset: grabOffset,
      initialSelection: selection ? { ...selection } : null
    };

    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    const rect = overlayCanvasRef.current?.getBoundingClientRect();
    if (!rect || duration <= 0) return;

    const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
    const targetTime = Math.max(0, Math.min(duration, (x / rect.width) * duration));

    // Hover cursor feedback when not dragging
    if (dragMode === 'none') {
      if (miniMapMode === 'viewport') {
        const vpLeft = (viewportStart / duration) * rect.width;
        const vpRight = (viewportEnd / duration) * rect.width;
        if (x >= vpLeft && x <= vpRight) {
          setHoverCursor('grab');
        } else {
          setHoverCursor('pointer');
        }
      } else {
        if (selection && selection.end > selection.start) {
          const selLeft = (selection.start / duration) * rect.width;
          const selRight = (selection.end / duration) * rect.width;
          if (Math.abs(x - selLeft) <= 10 || Math.abs(x - selRight) <= 10) {
            setHoverCursor('col-resize');
            return;
          }
        }
        setHoverCursor('crosshair');
      }
      return;
    }

    if (dragMode === 'viewport-pan') {
      const vpDuration = viewportEnd - viewportStart;
      const grabOffset = dragStartRef.current.grabTimeOffset;
      const newStart = Math.max(0, Math.min(duration - vpDuration, targetTime - grabOffset));
      onSeekViewport(newStart);
    } else if (dragMode === 'select-create') {
      const anchor = dragStartRef.current.anchorTime;
      const start = Math.min(anchor, targetTime);
      const end = Math.max(anchor, targetTime);
      if (end - start > 0.005 && onSelectRegion) {
        onSelectRegion({ start, end });
      }
    } else if (dragMode === 'select-handle-start') {
      if (selection && onSelectRegion) {
        const newStart = Math.min(selection.end - 0.005, Math.max(0, targetTime));
        onSelectRegion({ start: newStart, end: selection.end });
      }
    } else if (dragMode === 'select-handle-end') {
      if (selection && onSelectRegion) {
        const newEnd = Math.max(selection.start + 0.005, Math.min(duration, targetTime));
        onSelectRegion({ start: selection.start, end: newEnd });
      }
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    const rect = overlayCanvasRef.current?.getBoundingClientRect();
    if (rect && duration > 0) {
      const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
      const targetTime = Math.max(0, Math.min(duration, (x / rect.width) * duration));
      const dist = Math.abs(x - dragStartRef.current.x);

      // Single click in Select mode without drag positions the playhead
      if (dragMode === 'select-create' && dist < 4 && !e.shiftKey) {
        if (onSeekPlayhead) {
          onSeekPlayhead(targetTime);
        }
      }
    }

    setDragMode('none');
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // Ignored
    }
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    if (duration <= 0) return;
    const rect = overlayCanvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
    const targetTime = (x / rect.width) * duration;

    if (miniMapMode === 'select') {
      // Double click in Select mode selects the whole audio file
      if (onSelectRegion) {
        onSelectRegion({ start: 0, end: duration });
      }
    } else {
      // Double click in Nav mode jumps playhead and centers viewport
      const vpDuration = viewportEnd - viewportStart;
      const newStart = Math.max(0, Math.min(duration - vpDuration, targetTime - vpDuration / 2));
      onSeekViewport(newStart);
      if (onSeekPlayhead) {
        onSeekPlayhead(targetTime);
      }
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
          className={`minimap-mode-btn nav-btn ${miniMapMode === 'viewport' ? 'active' : ''}`}
          onClick={(e) => {
            e.stopPropagation();
            handleSetMode('viewport');
          }}
          title="Viewport Navigation: Drag viewport lens to pan timeline, click to jump (Shift+Drag to select)"
        >
          <Hand size={11} />
          <span>Nav</span>
        </button>
        <button
          type="button"
          className={`minimap-mode-btn select-btn ${miniMapMode === 'select' ? 'active' : ''}`}
          onClick={(e) => {
            e.stopPropagation();
            handleSetMode('select');
          }}
          title="Range Select: Drag to highlight audio region, drag handles to resize, double-click to select all"
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
          cursor:
            dragMode === 'select-handle-start' || dragMode === 'select-handle-end'
              ? 'col-resize'
              : dragMode === 'select-create'
              ? 'crosshair'
              : dragMode === 'viewport-pan'
              ? 'grabbing'
              : hoverCursor
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onDoubleClick={handleDoubleClick}
      />
    </div>
  );
});
MiniMap.displayName = 'MiniMap';

