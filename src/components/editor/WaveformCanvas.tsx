import React, { useRef, useEffect, useState } from 'react';
import { Hand, MousePointer } from 'lucide-react';
import type { AudioSelection } from '../../types/audio';

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
}

type DragMode = 'none' | 'create-selection' | 'drag-handle-start' | 'drag-handle-end' | 'scrub-playhead' | 'pan';

export const WaveformCanvas: React.FC<WaveformCanvasProps> = ({
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
  onScrollChange
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
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

  // Render Waveform Canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !buffer || width <= 0 || height <= 0) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    const channels = buffer.numberOfChannels;
    const channelHeight = height / channels;
    const startTime = Math.max(0, scrollLeft / zoom);
    const endTime = Math.min(duration, (scrollLeft + width) / zoom);
    const sampleRate = buffer.sampleRate;

    // Render channels
    for (let c = 0; c < channels; c++) {
      const channelData = buffer.getChannelData(c);
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

      // Create Gradient for Waveform
      const gradient = ctx.createLinearGradient(0, topY, 0, topY + channelHeight);
      gradient.addColorStop(0, '#00f0ff');
      gradient.addColorStop(0.5, '#38bdf8');
      gradient.addColorStop(1, '#00f0ff');

      ctx.fillStyle = gradient;

      // Determine rendering mode: Sample lines (if deep zoom) vs Min/Max Peak Columns
      const samplesPerPixel = sampleRate / zoom;

      if (samplesPerPixel <= 1) {
        // Sample level rendering (individual connected sample dots)
        ctx.strokeStyle = '#00f0ff';
        ctx.lineWidth = 2;
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

        // Draw sample points
        ctx.fillStyle = '#ffffff';
        for (let s = startSample; s < endSample; s++) {
          const sampleTime = s / sampleRate;
          const x = sampleTime * zoom - scrollLeft;
          const y = midY - channelData[s] * (channelHeight / 2 - 4);
          ctx.beginPath();
          ctx.arc(x, y, 2.5, 0, Math.PI * 2);
          ctx.fill();
        }
      } else {
        // Min/Max peak column rendering
        for (let x = 0; x < width; x++) {
          const pixelTime = (scrollLeft + x) / zoom;
          if (pixelTime < 0 || pixelTime > duration) continue;

          const startSample = Math.floor(pixelTime * sampleRate);
          const endSample = Math.min(buffer.length, Math.floor((pixelTime + 1 / zoom) * sampleRate));

          if (startSample >= buffer.length) break;

          let min = 1.0;
          let max = -1.0;

          // Performance stride if many samples per pixel
          const stride = Math.max(1, Math.floor((endSample - startSample) / 32));
          for (let s = startSample; s < endSample; s += stride) {
            const val = channelData[s];
            if (val < min) min = val;
            if (val > max) max = val;
          }

          if (max < min) {
            min = 0;
            max = 0;
          }

          const yTop = midY - max * (channelHeight / 2 - 4);
          const yBottom = midY - min * (channelHeight / 2 - 4);
          const barHeight = Math.max(1.5, yBottom - yTop);

          ctx.fillRect(x, yTop, 1, barHeight);
        }
      }
    }

    // Render Selection Region Overlay
    if (selection && selection.end > selection.start) {
      const selStartX = selection.start * zoom - scrollLeft;
      const selEndX = selection.end * zoom - scrollLeft;
      const selWidth = selEndX - selStartX;

      // Selection Fill
      ctx.fillStyle = 'rgba(56, 189, 248, 0.2)';
      ctx.fillRect(selStartX, 0, selWidth, height);

      // Left Selection Border & Handle
      ctx.fillStyle = '#38bdf8';
      ctx.fillRect(selStartX - 1, 0, 2, height);
      // Left Handle Knob
      ctx.beginPath();
      ctx.arc(selStartX, 12, 6, 0, Math.PI * 2);
      ctx.arc(selStartX, height - 12, 6, 0, Math.PI * 2);
      ctx.fill();

      // Right Selection Border & Handle
      ctx.fillStyle = '#38bdf8';
      ctx.fillRect(selEndX - 1, 0, 2, height);
      // Right Handle Knob
      ctx.beginPath();
      ctx.arc(selEndX, 12, 6, 0, Math.PI * 2);
      ctx.arc(selEndX, height - 12, 6, 0, Math.PI * 2);
      ctx.fill();
    }

    // Render Playhead Line & Glowing Cursor
    const playheadX = currentTime * zoom - scrollLeft;
    if (playheadX >= -2 && playheadX <= width + 2) {
      // Glow
      ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
      ctx.fillRect(playheadX - 2, 0, 5, height);

      // Center Line
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(playheadX - 1, 0, 2, height);

      // Playhead Top Badge
      ctx.beginPath();
      ctx.moveTo(playheadX - 6, 0);
      ctx.lineTo(playheadX + 6, 0);
      ctx.lineTo(playheadX + 6, 8);
      ctx.lineTo(playheadX, 14);
      ctx.lineTo(playheadX - 6, 8);
      ctx.closePath();
      ctx.fillStyle = '#ffffff';
      ctx.fill();
    }
  }, [buffer, currentTime, selection, zoom, scrollLeft, width, height, duration]);

  const handlePointerDown = (e: React.PointerEvent) => {
    if (!buffer) return;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    const x = e.clientX - rect.left;
    const clickTime = (scrollLeft + x) / zoom;

    const HANDLE_HIT_PX = 20; // larger hit area for fingers & mouse
    let activeDragMode: DragMode = mode === 'pan' ? 'pan' : 'create-selection';

    if (selection && selection.end > selection.start) {
      const startX = selection.start * zoom - scrollLeft;
      const endX = selection.end * zoom - scrollLeft;

      if (Math.abs(x - startX) <= HANDLE_HIT_PX) {
        activeDragMode = 'drag-handle-start';
      } else if (Math.abs(x - endX) <= HANDLE_HIT_PX) {
        activeDragMode = 'drag-handle-end';
      }
    }

    // Middle click or Space/Alt creates pan directly
    if (e.button === 1 || e.altKey) {
      activeDragMode = 'pan';
    } else if (e.shiftKey) {
      activeDragMode = 'scrub-playhead';
      onSeek(clickTime);
    }

    setDragMode(activeDragMode);
    dragStartRef.current = {
      x,
      time: clickTime,
      startSelection: selection ? { ...selection } : null,
      scrollLeft
    };

    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (dragMode === 'none' || !buffer) return;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    const x = e.clientX - rect.left;
    const currentTimeAtPointer = Math.max(0, Math.min(duration, (scrollLeft + x) / zoom));

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
    const rect = containerRef.current?.getBoundingClientRect();
    if (rect) {
      const x = e.clientX - rect.left;
      const clickTime = Math.max(0, Math.min(duration, (scrollLeft + x) / zoom));
      // If moved less than 5 pixels, treat as single tap / click to position playhead
      if (Math.abs(x - dragStartRef.current.x) < 5) {
        onSeek(clickTime);
      }
    }

    setDragMode('none');
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // Ignored
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
      style={{
        cursor: dragMode === 'pan' ? 'grabbing' : mode === 'pan' ? 'grab' : 'crosshair'
      }}
    >
      {/* Floating Mode Dock for instant toggle between Scroll/Pan & Select */}
      <div className="touch-mode-dock">
        <button
          type="button"
          className={`touch-mode-btn ${mode === 'pan' ? 'active' : ''}`}
          onClick={(e) => {
            e.stopPropagation();
            handleModeChange('pan');
          }}
          title="Pan / Scroll Mode: Swipe to scroll waveform"
        >
          <Hand size={12} />
          <span>Pan</span>
        </button>
        <button
          type="button"
          className={`touch-mode-btn ${mode === 'select' ? 'active' : ''}`}
          onClick={(e) => {
            e.stopPropagation();
            handleModeChange('select');
          }}
          title="Select Mode: Drag to highlight audio region"
        >
          <MousePointer size={12} />
          <span>Select</span>
        </button>
      </div>

      <canvas
        ref={canvasRef}
        className="waveform-canvas"
      />
    </div>
  );
};
