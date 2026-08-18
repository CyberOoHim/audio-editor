import React, { useRef, useEffect } from 'react';

export interface LiveVisualizerProps {
  analyser: AnalyserNode | null;
  mode?: 'oscilloscope' | 'frequency';
  width?: number;
  height?: number;
}

export const LiveVisualizer: React.FC<LiveVisualizerProps> = ({
  analyser,
  mode = 'oscilloscope',
  width = 460,
  height = 120
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !analyser) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.scale(dpr, dpr);

    let animId: number;
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const draw = () => {
      animId = requestAnimationFrame(draw);

      ctx.clearRect(0, 0, width, height);

      // Background
      ctx.fillStyle = '#080a0f';
      ctx.fillRect(0, 0, width, height);

      // Center line
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

        const barWidth = (width / bufferLength) * 2.5;
        let x = 0;

        for (let i = 0; i < bufferLength; i++) {
          const barHeight = (dataArray[i] / 255) * height;

          const gradient = ctx.createLinearGradient(0, height, 0, height - barHeight);
          gradient.addColorStop(0, '#0284c7');
          gradient.addColorStop(1, '#00f0ff');

          ctx.fillStyle = gradient;
          ctx.fillRect(x, height - barHeight, barWidth - 1, barHeight);

          x += barWidth;
          if (x >= width) break;
        }
      }
    };

    draw();

    return () => {
      cancelAnimationFrame(animId);
    };
  }, [analyser, mode, width, height]);

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
