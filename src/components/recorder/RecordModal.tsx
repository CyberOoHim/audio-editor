import React, { useState, useEffect, useRef } from 'react';
import { Mic, Square, Pause, Play, Trash2, Check, Radio, Volume2 } from 'lucide-react';
import { Modal } from '../common/Modal';
import { Slider } from '../common/Slider';
import { StudioRecorder, type RecorderMetrics } from '../../audio/Recorder';
import { LiveVisualizer } from './LiveVisualizer';
import { VuMeter } from './VuMeter';
import { useToast } from '../common/Toast';

export interface RecordModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaveRecording: (buffer: AudioBuffer, fileName: string, action: 'editor' | 'library') => void;
}

const MIC_GAIN_STORAGE_KEY = 'audio_editor_mic_gain_boost_db';

const isAppleDevice = typeof navigator !== 'undefined' && (
  /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
);

const getInitialGainBoost = (): number => {
  try {
    const saved = localStorage.getItem(MIC_GAIN_STORAGE_KEY);
    if (saved !== null) {
      const val = parseFloat(saved);
      if (!isNaN(val) && val >= 0 && val <= 36) {
        return val;
      }
    }
  } catch {}
  return 0;
};

export const RecordModal: React.FC<RecordModalProps> = ({
  isOpen,
  onClose,
  onSaveRecording
}) => {
  const { showToast } = useToast();
  const recorderRef = useRef<StudioRecorder | null>(null);

  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [duration, setDuration] = useState(0);
  const [metrics, setMetrics] = useState<RecorderMetrics>({ duration: 0, peakL: 0, peakR: 0, rmsL: 0, rmsR: 0 });
  const [visMode, setVisMode] = useState<'oscilloscope' | 'frequency'>('oscilloscope');
  const [recordedBuffer, setRecordedBuffer] = useState<AudioBuffer | null>(null);
  const [trackTitle, setTrackTitle] = useState('');
  const [gainBoost, setGainBoost] = useState<number>(() => getInitialGainBoost());
  const gainBoostRef = useRef(gainBoost);
  gainBoostRef.current = gainBoost;

  useEffect(() => {
    if (isOpen) {
      recorderRef.current = new StudioRecorder(gainBoostRef.current);
      recorderRef.current.onMetrics((m) => {
        setMetrics(m);
        setDuration(m.duration);
      });
      setTrackTitle(`Microphone Take ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`);
      setRecordedBuffer(null);
    } else {
      if (recorderRef.current) {
        recorderRef.current.cancel();
        recorderRef.current = null;
      }
      setIsRecording(false);
      setIsPaused(false);
      setDuration(0);
      setRecordedBuffer(null);
    }

    return () => {
      if (recorderRef.current) {
        recorderRef.current.cancel();
        recorderRef.current = null;
      }
    };
  }, [isOpen]);

  const handleGainBoostChange = (val: number) => {
    const rounded = Math.round(val * 10) / 10;
    const clamped = Math.max(0, Math.min(30, rounded));
    setGainBoost(clamped);
    try {
      localStorage.setItem(MIC_GAIN_STORAGE_KEY, clamped.toString());
    } catch {}
    if (recorderRef.current) {
      recorderRef.current.setGain(clamped);
    }
  };

  const handleStartRecord = async () => {
    try {
      if (recorderRef.current) {
        await recorderRef.current.start(gainBoost);
        setIsRecording(true);
        setIsPaused(false);
        setRecordedBuffer(null);
      }
    } catch (err) {
      console.error(err);
      showToast('Microphone access denied', 'error');
    }
  };

  const handlePauseResume = () => {
    if (!recorderRef.current) return;
    if (isPaused) {
      recorderRef.current.resume();
      setIsPaused(false);
    } else {
      recorderRef.current.pause();
      setIsPaused(true);
    }
  };

  const handleStopRecord = () => {
    if (!recorderRef.current) return;
    const buffer = recorderRef.current.stop();
    setIsRecording(false);
    setIsPaused(false);
    if (buffer) {
      setRecordedBuffer(buffer);
      showToast(`Recording ready (${buffer.duration.toFixed(1)}s)`, 'success');
    }
  };

  const handleDiscard = () => {
    if (recorderRef.current) {
      recorderRef.current.cancel();
    }
    setIsRecording(false);
    setIsPaused(false);
    setDuration(0);
    setRecordedBuffer(null);
  };

  const handleFinish = (action: 'editor' | 'library') => {
    if (!recordedBuffer) return;
    onSaveRecording(recordedBuffer, trackTitle.trim() || 'New Recording', action);
    onClose();
  };

  const formatTimer = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    const ms = Math.floor((sec % 1) * 100);
    return `${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}.${ms < 10 ? '0' : ''}${ms}`;
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Studio Microphone Recording"
      maxWidth="500px"
    >
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
        {/* Timer Display */}
        <div style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 'calc(32px * var(--ui-font-scale, 1))',
          fontWeight: 700,
          color: isRecording ? (isPaused ? 'var(--accent-amber)' : 'var(--accent-rose)') : 'var(--text-primary)',
          letterSpacing: '0.05em',
          display: 'flex',
          alignItems: 'center',
          gap: 10
        }}>
          {isRecording && !isPaused && (
            <span style={{
              width: 12,
              height: 12,
              borderRadius: '50%',
              backgroundColor: 'var(--accent-rose)',
              boxShadow: '0 0 10px var(--accent-rose)',
              animation: 'pulse 1s infinite alternate'
            }} />
          )}
          {formatTimer(recordedBuffer ? recordedBuffer.duration : duration)}
        </div>

        {/* Live Visualizer */}
        <div style={{ width: '100%', position: 'relative' }}>
          <LiveVisualizer
            analyser={recorderRef.current?.getAnalyser() || null}
            mode={visMode}
            width={460}
            height={110}
          />
          <div style={{ position: 'absolute', top: 6, right: 6, display: 'flex', gap: 4 }}>
            <button
              className="btn btn-ghost btn-sm"
              style={{
                fontSize: 'var(--font-xs)',
                padding: '2px 6px',
                height: 22,
                backgroundColor: visMode === 'oscilloscope' ? 'var(--accent-cyan-dim)' : 'rgba(0,0,0,0.4)',
                color: visMode === 'oscilloscope' ? 'var(--accent-cyan)' : 'var(--text-muted)'
              }}
              onClick={() => setVisMode('oscilloscope')}
            >
              Wave
            </button>
            <button
              className="btn btn-ghost btn-sm"
              style={{
                fontSize: 'var(--font-xs)',
                padding: '2px 6px',
                height: 22,
                backgroundColor: visMode === 'frequency' ? 'var(--accent-cyan-dim)' : 'rgba(0,0,0,0.4)',
                color: visMode === 'frequency' ? 'var(--accent-cyan)' : 'var(--text-muted)'
              }}
              onClick={() => setVisMode('frequency')}
            >
              FFT
            </button>
          </div>
        </div>

        {/* Stereo VU Meter */}
        <VuMeter peakL={metrics.peakL} peakR={metrics.peakR} />

        {/* Mic Gain Boost Control */}
        <div
          className="form-group"
          style={{
            width: '100%',
            backgroundColor: 'var(--bg-surface)',
            padding: '10px 12px',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border-medium)',
            display: 'flex',
            flexDirection: 'column',
            gap: 8
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <Volume2 size={15} color="var(--accent-cyan)" />
              <span style={{ fontWeight: 600, fontSize: 'calc(12px * var(--ui-font-scale, 1))', color: 'var(--text-primary)' }}>
                Mic Gain Boost
              </span>
              {isAppleDevice && (
                <span
                  style={{
                    fontSize: 'calc(10px * var(--ui-font-scale, 1))',
                    backgroundColor: 'rgba(56, 189, 248, 0.15)',
                    color: 'var(--accent-cyan)',
                    padding: '1px 5px',
                    borderRadius: 'var(--radius-sm)',
                    fontWeight: 600,
                    border: '1px solid rgba(56, 189, 248, 0.3)'
                  }}
                  title="iOS microphones record quietly in browsers; gain boost compensates for this"
                >
                  iOS / iPadOS
                </span>
              )}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span className="mono" style={{ color: 'var(--accent-cyan)', fontWeight: 700, fontSize: 'calc(13px * var(--ui-font-scale, 1))' }}>
                {gainBoost > 0 ? `+${gainBoost.toFixed(1)}` : gainBoost.toFixed(1)} dB
              </span>
              <span style={{ fontSize: 'calc(11px * var(--ui-font-scale, 1))', color: 'var(--text-muted)' }}>
                ({Math.pow(10, gainBoost / 20).toFixed(1)}×)
              </span>
            </div>
          </div>

          <Slider
            value={gainBoost}
            min={0}
            max={30}
            step={0.5}
            unit="dB"
            onChange={handleGainBoostChange}
          />

          {/* Quick Presets */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 'calc(10.5px * var(--ui-font-scale, 1))', color: 'var(--text-muted)', marginRight: 2 }}>
              Presets:
            </span>
            {[
              { label: '0 dB (1×)', value: 0 },
              { label: '+6 dB (2×)', value: 6 },
              { label: '+12 dB (4×)', value: 12 },
              { label: '+18 dB (8×)', value: 18 },
              { label: '+24 dB (16×)', value: 24 }
            ].map((p) => (
              <button
                key={p.value}
                type="button"
                className={`btn btn-sm ${Math.abs(gainBoost - p.value) < 0.1 ? 'btn-primary' : 'btn-secondary'}`}
                style={{
                  height: 22,
                  padding: '0 6px',
                  fontSize: 'calc(10.5px * var(--ui-font-scale, 1))'
                }}
                onClick={() => handleGainBoostChange(p.value)}
              >
                {p.label}
              </button>
            ))}
          </div>

          {gainBoost > 0 && (
            <div
              style={{
                fontSize: 'calc(10.5px * var(--ui-font-scale, 1))',
                color: 'var(--text-muted)',
                display: 'flex',
                alignItems: 'center',
                gap: 4
              }}
            >
              <span>ℹ️ Real-time boost applied directly to recording & live visualizer.</span>
            </div>
          )}
        </div>

        {/* Concise Recording Limit Hint */}
        <div
          style={{
            fontSize: 'calc(10.5px * var(--ui-font-scale, 1))',
            color: 'var(--text-muted)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 4
          }}
        >
          <span style={{ color: 'var(--accent-cyan)', fontWeight: 600 }}>⚡</span>
          <span>In-memory 32-bit Float PCM • No hard recording time limit (RAM-governed)</span>
        </div>

        {/* Track Title Input */}
        <div className="form-group" style={{ width: '100%' }}>
          <label className="form-label">Recording Track Title</label>
          <input
            type="text"
            className="form-input"
            value={trackTitle}
            onChange={(e) => setTrackTitle(e.target.value)}
            placeholder="e.g. Vocal Take 1"
          />
        </div>

        {/* Recording Action Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4, flexWrap: 'wrap', width: '100%' }}>
          {!isRecording && !recordedBuffer && (
            <button className="btn btn-primary btn-lg" style={{ width: '100%' }} onClick={handleStartRecord}>
              <Mic size={18} /> Start Recording
            </button>
          )}

          {isRecording && (
            <>
              <button
                className="btn btn-secondary"
                style={{ flex: 1, minWidth: 100 }}
                onClick={handlePauseResume}
              >
                {isPaused ? <Play size={16} /> : <Pause size={16} />}
                {isPaused ? 'Resume' : 'Pause'}
              </button>

              <button
                className="btn btn-danger"
                style={{ flex: 1, minWidth: 130 }}
                onClick={handleStopRecord}
              >
                <Square size={16} /> Stop Recording
              </button>

              <button
                className="btn btn-ghost btn-sm"
                onClick={handleDiscard}
                title="Discard take"
              >
                <Trash2 size={16} /> Discard
              </button>
            </>
          )}

          {recordedBuffer && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%' }}>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button
                  className="btn btn-primary btn-lg"
                  style={{ flex: 1, minWidth: 140 }}
                  onClick={() => handleFinish('editor')}
                >
                  <Check size={16} /> Load into Editor
                </button>
                <button
                  className="btn btn-secondary btn-lg"
                  style={{ flex: 1, minWidth: 140 }}
                  onClick={() => handleFinish('library')}
                >
                  <Radio size={16} /> Save to Library
                </button>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={handleDiscard}>
                <Trash2 size={14} /> Discard & Record Again
              </button>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
};
