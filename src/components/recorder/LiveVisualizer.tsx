import React, { useRef, useEffect } from 'react';

export interface LiveVisualizerProps {
  analyser: AnalyserNode | null;
  mode?: 'oscilloscope' | 'frequency';
  width?: number;
  height?: number;
  active?: boolean;
}

export const LiveVisualizer: React.FC<LiveVisualizerProps> = ({
  analyser,
  mode = 'oscilloscope',
  width = 460,
  height = 120,
  active = true
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !analyser || !active) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 1.25);
    const targetW = Math.round(width * dpr);
    const targetH = Math.round(height * dpr);

    if (canvas.width !== targetW || canvas.height !== targetH) {
      canvas.width = targetW;
      canvas.height = targetH;
    }

    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;

    let animId: number | null = null;
    let lastDraw = 0;
    const minDrawInterval = 1000 / 24;
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const freqGradient = ctx.createLinearGradient(0, height, 0, 0);
    freqGradient.addColorStop(0, '#0284c7');
    freqGradient.addColorStop(1, '#00f0ff');

    const drawFrame = (timestamp: number) => {
      lastDraw = timestamp;
      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, width, height);

      ctx.fillStyle = '#080a0f';
      ctx.fillRect(0, 0, width, height);

      ctx.fillStyle = '#1e293b';
      ctx.fillRect(0, height / 2, width, 1);

      if (mode === 'oscilloscope') {
        analyser.getByteTimeDomainData(dataArray);

        ctx.lineWidth = 2;
        ctx.strokeStyle = '#00f0ff';
        ctx.beginPath();

        const sliceWidth = width / bufferLength;
        let x = 0;

        for (let i = 0; i < bufferLength; i++) {
          const v = dataArray[i] / 128.0;
          const y = (v * height) / 2;

          if (i === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }

          x += sliceWidth;
        }

        ctx.lineTo(width, height / 2);
        ctx.stroke();
      } else {
        analyser.getByteFrequencyData(dataArray);

        ctx.fillStyle = freqGradient;
        const barWidth = (width / bufferLength) * 2.5;
        let x = 0;

        for (let i = 0; i < bufferLength; i++) {
          const barHeight = (dataArray[i] / 255) * height;
          ctx.fillRect(x, height - barHeight, Math.max(1, barWidth - 1), barHeight);

          x += barWidth;
          if (x >= width) break;
        }
      }

      ctx.restore();
    };

    const loop = (timestamp: number) => {
      if (document.hidden) {
        animId = null;
        return;
      }
      if (timestamp - lastDraw >= minDrawInterval) {
        drawFrame(timestamp);
      }
      animId = requestAnimationFrame(loop);
    };

    const onVisibility = () => {
      if (!document.hidden && animId === null) {
        animId = requestAnimationFrame(loop);
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    animId = requestAnimationFrame(loop);

    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      if (animId !== null) {
        cancelAnimationFrame(animId);
      }
    };
  }, [analyser, mode, width, height, active]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        width: `${width}px`,
        height: `${height}px`,
        borderRadius: 8,
        border: '1px solid var(--border-subtle)',
        display: 'block'
      }}
    />
  );
};
