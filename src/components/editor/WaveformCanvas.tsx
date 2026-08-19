import React, { useRef, useEffect, useState } from 'react';
import { Hand, MousePointer } from 'lucide-react';
import type { AudioSelection } from '../../types/audio';
import type { AudioFileItem } from '../../types/storage';
import { getDecimatedPeaks } from '../../audio/BufferUtils';
import { EmptyStudioState } from './EmptyStudioState';

export interface WaveformCanvasProps {
  buffer: AudioBuffer | null;
  currentTime: number;
  selection: AudioSelection | null;
  zoom: number; // pixels per second
  scrollLeft: number;
  width: number;
  height: number;
  interactionMode?: 'select' | 'pan';
  onInteractionModeChange?: (mode: 'select' | 'pan') => void;
  onSeek: (time: number) => void;
  onSelectRegion: (selection: AudioSelection | null) => void;
  onZoomChange: (newZoom: number) => void;
  onScrollChange: (newScrollLeft: number) => void;
  onImportFiles?: (files: FileList | File[]) => void;
  onLoadFileToEditor?: (file: AudioFileItem) => void;
  onOpenRecord?: () => void;
  onOpenGenerator?: () => void;
  onOpenLibrary?: () => void;
  libraryFiles?: AudioFileItem[];
}

type DragMode = 'none' | 'create-selection' | 'drag-handle-start' | 'drag-handle-end' | 'scrub-playhead' | 'pan';

export const WaveformCanvas: React.FC<WaveformCanvasProps> = React.memo(({
  buffer,
  currentTime,
  selection,
  zoom,
  scrollLeft,
  width,
  height,
  interactionMode = 'select',
  onInteractionModeChange,
  onSeek,
  onSelectRegion,
  onZoomChange,
  onScrollChange,
  onImportFiles,
  onLoadFileToEditor,
  onOpenRecord,
  onOpenGenerator,
  onOpenLibrary,
  libraryFiles = []
}) => {
  const waveformCanvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [mode, setMode] = useState<'select' | 'pan'>(interactionMode);

  useEffect(() => {
    setMode(interactionMode);
  }, [interactionMode]);

  const handleModeChange = (newMode: 'select' | 'pan') => {
    setMode(newMode);
    if (onInteractionModeChange) {
      onInteractionModeChange(newMode);
    }
  };

  const [dragMode, setDragMode] = useState<DragMode>('none');
  const dragStartRef = useRef<{ x: number; time: number; startSelection: AudioSelection | null; scrollLeft: number }>({
    x: 0,
    time: 0,
    startSelection: null,
    scrollLeft: 0
  });

  // Touch Pinch gesture state
  const touchStateRef = useRef<{
    initialPinchDistance: number | null;
    initialZoom: number;
    initialScrollLeft: number;
  }>({
    initialPinchDistance: null,
    initialZoom: zoom,
    initialScrollLeft: scrollLeft
  });

  const duration = buffer ? buffer.duration : 0;

  // 1. Layer 1: Render Waveform Canvas ONLY when buffer, zoom, scrollLeft, width, or height change
  useEffect(() => {
    const canvas = waveformCanvasRef.current;
    if (!canvas || !buffer || width <= 0 || height <= 0) return;

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

    const channels = buffer.numberOfChannels;
    const channelHeight = height / channels;
    const startTime = Math.max(0, scrollLeft / zoom);
    const endTime = Math.min(duration, (scrollLeft + width) / zoom);
    const sampleRate = buffer.sampleRate;
    const samplesPerPixel = sampleRate / zoom;

    // Precomputed decimated peak pyramid for instant fast rendering without raw sample scans
    const decimated = getDecimatedPeaks(buffer, 8192);
    const bucketSize = decimated.bucketSize;
    const totalBuckets = decimated.totalBuckets;

    // Render channels
    for (let c = 0; c < channels; c++) {
      const channelData = buffer.getChannelData(c);
      const decMins = decimated.mins[c];
      const decMaxs = decimated.maxs[c];
      const topY = c * channelHeight;
      const midY = topY + channelHeight / 2;

      // Channel background & center line
      ctx.fillStyle = '#0b0f17';
      ctx.fillRect(0, topY, width, channelHeight);

      ctx.fillStyle = '#1e293b';
      ctx.fillRect(0, midY, width, 1);

      // Channel divider
      if (c > 0) {
        ctx.fillStyle = '#26334d';
        ctx.fillRect(0, topY, width, 1);
      }

      // Channel tag label (L/R)
      ctx.font = '10px "JetBrains Mono", monospace';
      ctx.fillStyle = '#475569';
      ctx.fillText(channels === 1 ? 'MONO' : c === 0 ? 'LEFT' : 'RIGHT', 8, topY + 14);

      if (samplesPerPixel <= 1) {
        // Sample-level rendering (individual connected dots when zoomed in deeply)
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 1.5;
        ctx.beginPath();

        const startSample = Math.max(0, Math.floor(startTime * sampleRate));
        const endSample = Math.min(buffer.length, Math.ceil(endTime * sampleRate));

        for (let s = startSample; s < endSample; s++) {
          const sampleTime = s / sampleRate;
          const x = sampleTime * zoom - scrollLeft;
          const y = midY - channelData[s] * (channelHeight / 2 - 4);

          if (s === startSample) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
        }
        ctx.stroke();

        // Draw sample points in a single batched path
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        for (let s = startSample; s < endSample; s++) {
          const sampleTime = s / sampleRate;
          const x = sampleTime * zoom - scrollLeft;
          const y = midY - channelData[s] * (channelHeight / 2 - 4);
          ctx.rect(x - 1.5, y - 1.5, 3, 3);
        }
        ctx.fill();
      } else {
        // Ultra-fast batched peak rendering with 2px column step (1 single draw call per channel)
        ctx.fillStyle = '#38bdf8';
        ctx.beginPath();

        const step = 2; // 2px step saves 50% loop cycles and calculations
        const barWidth = 1.5;

        for (let x = 0; x < width; x += step) {
          const pixelTime = (scrollLeft + x) / zoom;
          if (pixelTime < 0 || pixelTime > duration) continue;

          const startSample = pixelTime * sampleRate;
          const endSample = (pixelTime + step / zoom) * sampleRate;
          const startBucket = Math.floor(startSample / bucketSize);
          const endBucket = Math.max(startBucket + 1, Math.min(totalBuckets, Math.ceil(endSample / bucketSize)));

          let min = 1.0;
          let max = -1.0;

          for (let b = startBucket; b < endBucket; b++) {
            const bMin = decMins[b];
            const bMax = decMaxs[b];
            if (bMin < min) min = bMin;
            if (bMax > max) max = bMax;
          }

          if (max < min) {
            min = 0;
            max = 0;
          }

          const yTop = midY - max * (channelHeight / 2 - 4);
          const yBottom = midY - min * (channelHeight / 2 - 4);
          const barHeight = Math.max(1.5, yBottom - yTop);

          ctx.rect(x, yTop, barWidth, barHeight);
        }

        ctx.fill();
      }
    }

    ctx.restore();
  }, [buffer, zoom, scrollLeft, width, height, duration]);

  // 2. Layer 2: Render Overlay (Selection & Playhead) on separate canvas (takes <0.01ms)
  useEffect(() => {
    const canvas = overlayCanvasRef.current;
    if (!canvas || width <= 0 || height <= 0) return;

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

    // Render Selection Region Overlay with differentiated visuals based on mode
    if (selection && selection.end > selection.start) {
      const selStartX = selection.start * zoom - scrollLeft;
      const selEndX = selection.end * zoom - scrollLeft;
      const selWidth = selEndX - selStartX;

      if (mode === 'select') {
        // SELECT MODE: Primary, vibrant, with glowing purple/cyan boundaries & interactive knobs
        ctx.fillStyle = 'rgba(139, 92, 246, 0.22)';
        ctx.fillRect(selStartX, 0, selWidth, height);

        // Left Selection Border & Handle
        ctx.fillStyle = '#a855f7';
        ctx.fillRect(selStartX - 1, 0, 2, height);
        // Left Handle Knobs (outer circle + inner white core)
        ctx.beginPath();
        ctx.arc(selStartX, 14, 6, 0, Math.PI * 2);
        ctx.arc(selStartX, height - 14, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(selStartX, 14, 2.5, 0, Math.PI * 2);
        ctx.arc(selStartX, height - 14, 2.5, 0, Math.PI * 2);
        ctx.fill();

        // Right Selection Border & Handle
        ctx.fillStyle = '#a855f7';
        ctx.fillRect(selEndX - 1, 0, 2, height);
        // Right Handle Knobs (outer circle + inner white core)
        ctx.beginPath();
        ctx.arc(selEndX, 14, 6, 0, Math.PI * 2);
        ctx.arc(selEndX, height - 14, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(selEndX, 14, 2.5, 0, Math.PI * 2);
        ctx.arc(selEndX, height - 14, 2.5, 0, Math.PI * 2);
        ctx.fill();

        // Selection Duration pill badge
        if (selWidth >= 60) {
          const selDur = selection.end - selection.start;
          const durText = `${selDur >= 10 ? selDur.toFixed(2) : selDur.toFixed(3)}s`;
          ctx.font = '10px "JetBrains Mono", monospace';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'top';
          const textMetrics = ctx.measureText(durText);
          const badgeW = textMetrics.width + 12;
          const badgeX = selStartX + selWidth / 2 - badgeW / 2;
          ctx.fillStyle = 'rgba(11, 15, 23, 0.85)';
          ctx.fillRect(badgeX, 4, badgeW, 14);
          ctx.fillStyle = '#e9d5ff';
          ctx.fillText(durText, selStartX + selWidth / 2, 5);
        }
      } else {
        // PAN MODE: Selection is secondary / passive reference (subtle tint, 1px border, no grab knobs)
        ctx.fillStyle = 'rgba(56, 189, 248, 0.12)';
        ctx.fillRect(selStartX, 0, selWidth, height);

        ctx.fillStyle = 'rgba(56, 189, 248, 0.5)';
        ctx.fillRect(selStartX - 1, 0, 1, height);
        ctx.fillRect(selEndX, 0, 1, height);
      }
    }

    // Render Playhead Line
    const playheadX = currentTime * zoom - scrollLeft;
    if (playheadX >= -2 && playheadX <= width + 2) {
      // Center Line
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(Math.round(playheadX) - 1, 0, 2, height);

      // Playhead Top Badge
      ctx.beginPath();
      ctx.moveTo(playheadX - 5, 0);
      ctx.lineTo(playheadX + 5, 0);
      ctx.lineTo(playheadX, 8);
      ctx.closePath();
      ctx.fill();
    }

    ctx.restore();
  }, [currentTime, selection, zoom, scrollLeft, width, height, mode]);

  // Auto-scroll animation frame ref & state
  const autoScrollAnimRef = useRef<number | null>(null);
  const scrollSpeedRef = useRef<number>(0);
  const latestPointerXRef = useRef<number>(0);
  const currentScrollLeftRef = useRef<number>(scrollLeft);
  const currentSelectionRef = useRef<AudioSelection | null>(selection);
  const dragModeRef = useRef<DragMode>('none');
  const [hoverCursor, setHoverCursor] = useState<string>('default');

  useEffect(() => {
    currentScrollLeftRef.current = scrollLeft;
  }, [scrollLeft]);

  useEffect(() => {
    currentSelectionRef.current = selection;
  }, [selection]);

  useEffect(() => {
    dragModeRef.current = dragMode;
  }, [dragMode]);

  const stopAutoScroll = () => {
    if (autoScrollAnimRef.current !== null) {
      cancelAnimationFrame(autoScrollAnimRef.current);
      autoScrollAnimRef.current = null;
    }
    scrollSpeedRef.current = 0;
  };

  const startAutoScroll = (speed: number) => {
    scrollSpeedRef.current = speed;
    if (autoScrollAnimRef.current === null) {
      const loop = () => {
        const curScroll = currentScrollLeftRef.current;
        const maxScroll = Math.max(0, duration * zoom - width);
        const spd = scrollSpeedRef.current;
        const newScroll = Math.max(0, Math.min(maxScroll, curScroll + spd));

        if (newScroll !== curScroll) {
          currentScrollLeftRef.current = newScroll;
          onScrollChange(newScroll);

          // Update selection or scrub under the pointer
          const x = latestPointerXRef.current;
          const currentTimeAtPointer = Math.max(0, Math.min(duration, (newScroll + x) / zoom));
          const curDragMode = dragModeRef.current;

          if (curDragMode === 'create-selection') {
            const startTime = Math.min(dragStartRef.current.time, currentTimeAtPointer);
            const endTime = Math.max(dragStartRef.current.time, currentTimeAtPointer);
            if (endTime - startTime > 0.005) {
              onSelectRegion({ start: startTime, end: endTime });
            }
          } else if (curDragMode === 'drag-handle-start') {
            const curSel = currentSelectionRef.current;
            if (curSel) {
              const newStart = Math.min(curSel.end - 0.005, Math.max(0, currentTimeAtPointer));
              onSelectRegion({ start: newStart, end: curSel.end });
            }
          } else if (curDragMode === 'drag-handle-end') {
            const curSel = currentSelectionRef.current;
            if (curSel) {
              const newEnd = Math.max(curSel.start + 0.005, Math.min(duration, currentTimeAtPointer));
              onSelectRegion({ start: curSel.start, end: newEnd });
            }
          } else if (curDragMode === 'scrub-playhead') {
            onSeek(currentTimeAtPointer);
          }
        }

        if (scrollSpeedRef.current !== 0) {
          autoScrollAnimRef.current = requestAnimationFrame(loop);
        } else {
          autoScrollAnimRef.current = null;
        }
      };
      autoScrollAnimRef.current = requestAnimationFrame(loop);
    }
  };

  useEffect(() => {
    return () => stopAutoScroll();
  }, []);

  const handlePointerDown = (e: React.PointerEvent) => {
    if (!buffer) return;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    const x = e.clientX - rect.left;
    const clickTime = (scrollLeft + x) / zoom;

    const HANDLE_HIT_PX = 20; // larger hit area for touch fingers & mouse
    let activeDragMode: DragMode = 'none';
    let anchorTime = clickTime;

    if (mode === 'pan') {
      // PAN MODE: Always Pan directly. Selection handles never hijack Pan mode.
      activeDragMode = 'pan';
    } else {
      // SELECT MODE: Selection creation or adjusting handles
      let hitHandle = false;

      if (selection && selection.end > selection.start) {
        const startX = selection.start * zoom - scrollLeft;
        const endX = selection.end * zoom - scrollLeft;

        if (Math.abs(x - startX) <= HANDLE_HIT_PX) {
          activeDragMode = 'drag-handle-start';
          hitHandle = true;
        } else if (Math.abs(x - endX) <= HANDLE_HIT_PX) {
          activeDragMode = 'drag-handle-end';
          hitHandle = true;
        }
      }

      if (!hitHandle && e.shiftKey) {
        // Shift + Click / Shift + Drag to extend or create selection!
        if (selection && selection.end > selection.start) {
          const distToStart = Math.abs(clickTime - selection.start);
          const distToEnd = Math.abs(clickTime - selection.end);
          anchorTime = distToStart < distToEnd ? selection.end : selection.start;
        } else {
          anchorTime = currentTime;
        }
        const newStart = Math.min(anchorTime, clickTime);
        const newEnd = Math.max(anchorTime, clickTime);
        onSelectRegion({ start: newStart, end: newEnd });
        activeDragMode = 'create-selection';
      } else if (!hitHandle) {
        activeDragMode = 'create-selection';
      }

      // Middle click or Alt key forces temporary pan even in select mode
      if (e.button === 1 || e.altKey) {
        activeDragMode = 'pan';
      }
    }

    setDragMode(activeDragMode);
    latestPointerXRef.current = x;
    dragStartRef.current = {
      x,
      time: anchorTime,
      startSelection: selection ? { ...selection } : null,
      scrollLeft
    };

    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect || !buffer) return;

    const x = e.clientX - rect.left;
    latestPointerXRef.current = x;

    // Hover cursor feedback when not dragging
    if (dragMode === 'none') {
      if (mode === 'pan') {
        setHoverCursor('grab');
        return;
      }

      // Select mode hover feedback
      if (selection && selection.end > selection.start) {
        const startX = selection.start * zoom - scrollLeft;
        const endX = selection.end * zoom - scrollLeft;
        if (Math.abs(x - startX) <= 15 || Math.abs(x - endX) <= 15) {
          setHoverCursor('col-resize');
          return;
        }
      }
      setHoverCursor('crosshair');
      return;
    }

    const currentTimeAtPointer = Math.max(0, Math.min(duration, (scrollLeft + x) / zoom));

    // Handle Edge Auto-scrolling when dragging selection or handles
    if (['create-selection', 'drag-handle-start', 'drag-handle-end', 'scrub-playhead'].includes(dragMode)) {
      const EDGE_ZONE = 45;
      const MAX_SPEED = 22;
      const MIN_SPEED = 3;

      if (x < EDGE_ZONE) {
        const dist = Math.max(1, EDGE_ZONE - x);
        const spd = -Math.min(MAX_SPEED, MIN_SPEED + dist * 0.4);
        startAutoScroll(spd);
      } else if (x > width - EDGE_ZONE) {
        const dist = Math.max(1, x - (width - EDGE_ZONE));
        const spd = Math.min(MAX_SPEED, MIN_SPEED + dist * 0.4);
        startAutoScroll(spd);
      } else {
        stopAutoScroll();
      }
    }

    if (dragMode === 'pan') {
      const deltaX = x - dragStartRef.current.x;
      const maxScroll = Math.max(0, duration * zoom - width);
      const newScroll = Math.max(0, Math.min(maxScroll, dragStartRef.current.scrollLeft - deltaX));
      onScrollChange(newScroll);
    } else if (dragMode === 'create-selection') {
      const startTime = Math.min(dragStartRef.current.time, currentTimeAtPointer);
      const endTime = Math.max(dragStartRef.current.time, currentTimeAtPointer);
      if (endTime - startTime > 0.005) {
        onSelectRegion({ start: startTime, end: endTime });
      }
    } else if (dragMode === 'drag-handle-start') {
      if (selection) {
        const newStart = Math.min(selection.end - 0.005, Math.max(0, currentTimeAtPointer));
        onSelectRegion({ start: newStart, end: selection.end });
      }
    } else if (dragMode === 'drag-handle-end') {
      if (selection) {
        const newEnd = Math.max(selection.start + 0.005, Math.min(duration, currentTimeAtPointer));
        onSelectRegion({ start: selection.start, end: newEnd });
      }
    } else if (dragMode === 'scrub-playhead') {
      onSeek(currentTimeAtPointer);
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    stopAutoScroll();
    const rect = containerRef.current?.getBoundingClientRect();
    if (rect && buffer) {
      const x = e.clientX - rect.left;
      const clickTime = Math.max(0, Math.min(duration, (scrollLeft + x) / zoom));
      const dist = Math.abs(x - dragStartRef.current.x);

      // Single tap / click without drag positions playhead
      if (dist < 5 && !e.shiftKey) {
        if (mode === 'select' && dragMode === 'create-selection') {
          onSeek(clickTime);
        } else if (mode === 'pan' && dragMode === 'pan') {
          onSeek(clickTime);
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
    if (!buffer || duration <= 0) return;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left;
    const clickTime = Math.max(0, Math.min(duration, (scrollLeft + x) / zoom));

    if (mode === 'select') {
      // Double click in Select mode selects all audio
      onSelectRegion({ start: 0, end: duration });
    } else {
      // Double click in Pan mode centers clicked point and seeks playhead
      onSeek(clickTime);
      const newScroll = Math.max(0, Math.min(duration * zoom - width, clickTime * zoom - width / 2));
      onScrollChange(newScroll);
    }
  };

  // Wheel Zoom & Scroll
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();

    if (e.ctrlKey || e.metaKey) {
      const zoomFactor = e.deltaY < 0 ? 1.15 : 0.87;
      const rect = containerRef.current?.getBoundingClientRect();
      const mouseX = rect ? e.clientX - rect.left : width / 2;
      const timeUnderMouse = (scrollLeft + mouseX) / zoom;

      const newZoom = Math.max(10, Math.min(5000, zoom * zoomFactor));
      const newScrollLeft = Math.max(0, timeUnderMouse * newZoom - mouseX);

      onZoomChange(newZoom);
      onScrollChange(newScrollLeft);
    } else {
      const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      const maxScroll = Math.max(0, duration * zoom - width);
      const newScrollLeft = Math.max(0, Math.min(maxScroll, scrollLeft + delta));
      onScrollChange(newScrollLeft);
    }
  };

  // Multi-Touch Pinch-to-Zoom Gesture Listener
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
      touchStateRef.current = {
        initialPinchDistance: dist,
        initialZoom: zoom,
        initialScrollLeft: scrollLeft
      };
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && touchStateRef.current.initialPinchDistance) {
      e.preventDefault();
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const currentDist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
      const scale = currentDist / touchStateRef.current.initialPinchDistance;

      const midX = (t1.clientX + t2.clientX) / 2;
      const rect = containerRef.current?.getBoundingClientRect();
      const relativeMidX = rect ? midX - rect.left : width / 2;
      const timeUnderCenter = (touchStateRef.current.initialScrollLeft + relativeMidX) / touchStateRef.current.initialZoom;

      const newZoom = Math.max(10, Math.min(5000, touchStateRef.current.initialZoom * scale));
      const newScrollLeft = Math.max(0, timeUnderCenter * newZoom - relativeMidX);

      onZoomChange(newZoom);
      onScrollChange(newScrollLeft);
    }
  };

  const handleTouchEnd = () => {
    touchStateRef.current.initialPinchDistance = null;
  };

  return (
    <div
      ref={containerRef}
      className="canvas-container"
      onWheel={handleWheel}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onDoubleClick={handleDoubleClick}
      style={{
        cursor: !buffer
          ? 'default'
          : dragMode === 'pan'
          ? 'grabbing'
          : dragMode === 'drag-handle-start' || dragMode === 'drag-handle-end'
          ? 'col-resize'
          : dragMode === 'create-selection'
          ? 'crosshair'
          : hoverCursor,
        position: 'relative'
      }}
    >
      {buffer ? (
        <>
          {/* Floating Mode Dock for instant toggle between Scroll/Pan & Select */}
          <div className="touch-mode-dock">
            <button
              type="button"
              className={`touch-mode-btn pan-btn ${mode === 'pan' ? 'active' : ''}`}
              onClick={(e) => {
                e.stopPropagation();
                handleModeChange('pan');
              }}
              title="Pan / Scroll Mode (V): Drag anywhere to scroll waveform"
            >
              <Hand size={12} />
              <span>Pan</span>
              <span className="hotkey-badge">V</span>
            </button>
            <button
              type="button"
              className={`touch-mode-btn select-btn ${mode === 'select' ? 'active' : ''}`}
              onClick={(e) => {
                e.stopPropagation();
                handleModeChange('select');
              }}
              title="Select Mode (S): Drag to highlight audio region, drag handles to resize, double-click to select all"
            >
              <MousePointer size={12} />
              <span>Select</span>
              <span className="hotkey-badge">S</span>
            </button>
          </div>

          {/* Layer 1: Base Static Waveform Canvas */}
          <canvas
            ref={waveformCanvasRef}
            className="waveform-canvas"
            style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }}
          />

          {/* Layer 2: Fast Overlay Canvas (Playhead & Selection) */}
          <canvas
            ref={overlayCanvasRef}
            className="waveform-canvas-overlay"
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              pointerEvents: 'none'
            }}
          />
        </>
      ) : (
        <EmptyStudioState
          onImportFiles={onImportFiles || (() => {})}
          onLoadFileToEditor={onLoadFileToEditor || (() => {})}
          onOpenRecord={onOpenRecord}
          onOpenGenerator={onOpenGenerator}
          onOpenLibrary={onOpenLibrary}
          libraryFiles={libraryFiles}
        />
      )}
    </div>
  );
});
WaveformCanvas.displayName = 'WaveformCanvas';
