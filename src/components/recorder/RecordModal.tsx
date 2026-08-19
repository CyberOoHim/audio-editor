import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Mic, Square, Pause, Play, Trash2, Check, Radio, Volume2, Sparkles, AlertTriangle } from 'lucide-react';
import { Modal } from '../common/Modal';
import { Slider } from '../common/Slider';
import { StudioRecorder, type RecorderMetrics } from '../../audio/Recorder';
import * as BufferUtils from '../../audio/BufferUtils';
import { LiveVisualizer } from './LiveVisualizer';
import { VuMeter } from './VuMeter';
import { useToast } from '../common/Toast';

export interface RecordModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaveRecording: (buffer: AudioBuffer, fileName: string, action: 'editor' | 'library') => void;
}

const MIC_GAIN_STORAGE_KEY = 'audio_editor_mic_gain_boost_db';
const TOP_UP_GAIN_STORAGE_KEY = 'audio_editor_top_up_gain_boost_db';

const isAppleDevice = typeof navigator !== 'undefined' && (
  /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
);

const getInitialGainBoost = (key: string, defaultVal: number = 0): number => {
  try {
    const saved = localStorage.getItem(key);
    if (saved !== null) {
      const val = parseFloat(saved);
      if (!isNaN(val) && val >= 0 && val <= 36) {
        return val;
      }
    }
  } catch {}
  return defaultVal;
};

const getBoostedBuffer = (buffer: AudioBuffer, gainDb: number): AudioBuffer => {
  if (Math.abs(gainDb) < 0.01) return buffer;
  const OfflineCtxClass = window.OfflineAudioContext || (window as unknown as { webkitOfflineAudioContext: typeof OfflineAudioContext }).webkitOfflineAudioContext;
  const ctx = new OfflineCtxClass(buffer.numberOfChannels, buffer.length, buffer.sampleRate);
  return BufferUtils.applyGain(ctx, buffer, gainDb);
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
  
  // 1. Live Mic Input Gain Boost (applied during recording)
  const [gainBoost, setGainBoost] = useState<number>(() => getInitialGainBoost(MIC_GAIN_STORAGE_KEY, 0));
  const gainBoostRef = useRef(gainBoost);
  gainBoostRef.current = gainBoost;

  // 2. Post-Recording Top-Up Gain Boost (applied to buffer before save / load into workspace)
  const [topUpGain, setTopUpGain] = useState<number>(() => getInitialGainBoost(TOP_UP_GAIN_STORAGE_KEY, 0));

  // Audio Preview Player
  const [isPlayingPreview, setIsPlayingPreview] = useState(false);
  const previewSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const previewGainNodeRef = useRef<GainNode | null>(null);
  const previewCtxRef = useRef<AudioContext | null>(null);

  const stopPreview = useCallback(() => {
    if (previewSourceRef.current) {
      try {
        previewSourceRef.current.stop();
        previewSourceRef.current.disconnect();
      } catch {}
      previewSourceRef.current = null;
    }
    if (previewGainNodeRef.current) {
      try {
        previewGainNodeRef.current.disconnect();
      } catch {}
      previewGainNodeRef.current = null;
    }
    if (previewCtxRef.current && previewCtxRef.current.state !== 'closed') {
      try {
        previewCtxRef.current.close().catch(() => {});
      } catch {}
      previewCtxRef.current = null;
    }
    setIsPlayingPreview(false);
  }, []);

  // Compute peak of recorded buffer
  const bufferPeak = useMemo(() => {
    if (!recordedBuffer || recordedBuffer.length === 0) return 0;
    let peak = 0;
    for (let c = 0; c < recordedBuffer.numberOfChannels; c++) {
      const data = recordedBuffer.getChannelData(c);
      for (let i = 0; i < data.length; i++) {
        const abs = Math.abs(data[i]);
        if (abs > peak) peak = abs;
      }
    }
    return peak;
  }, [recordedBuffer]);

  const peakDb = bufferPeak > 0.00001 ? 20 * Math.log10(bufferPeak) : -100;
  const projectedPeakDb = peakDb + topUpGain;
  const autoNormalizeGain = Math.max(0, Math.min(30, Math.round(-peakDb * 10) / 10));

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
      stopPreview();
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
      stopPreview();
      if (recorderRef.current) {
        recorderRef.current.cancel();
        recorderRef.current = null;
      }
    };
  }, [isOpen, stopPreview]);

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

  const handleTopUpGainChange = (val: number) => {
    const rounded = Math.round(val * 10) / 10;
    const clamped = Math.max(0, Math.min(30, rounded));
    setTopUpGain(clamped);
    try {
      localStorage.setItem(TOP_UP_GAIN_STORAGE_KEY, clamped.toString());
    } catch {}
    if (previewGainNodeRef.current && previewCtxRef.current) {
      const linear = Math.pow(10, clamped / 20);
      previewGainNodeRef.current.gain.setValueAtTime(linear, previewCtxRef.current.currentTime);
    }
  };

  const handleTogglePreview = () => {
    if (isPlayingPreview) {
      stopPreview();
      return;
    }
    if (!recordedBuffer) return;

    try {
      const AudioCtxClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AudioCtxClass();
      previewCtxRef.current = ctx;

      const source = ctx.createBufferSource();
      source.buffer = recordedBuffer;

      const gainNode = ctx.createGain();
      const linear = Math.pow(10, topUpGain / 20);
      gainNode.gain.setValueAtTime(linear, ctx.currentTime);

      source.connect(gainNode);
      gainNode.connect(ctx.destination);

      previewSourceRef.current = source;
      previewGainNodeRef.current = gainNode;

      source.onended = () => {
        setIsPlayingPreview(false);
        stopPreview();
      };

      source.start(0);
      setIsPlayingPreview(true);
    } catch (err) {
      console.error('Preview playback failed', err);
      stopPreview();
    }
  };

  const handleStartRecord = async () => {
    stopPreview();
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
    stopPreview();
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
    stopPreview();
    const finalBuffer = getBoostedBuffer(recordedBuffer, topUpGain);
    onSaveRecording(finalBuffer, trackTitle.trim() || 'New Recording', action);
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

        {/* 1. Live Mic Input Gain Boost (Visible during Setup & Active Recording) */}
        {!recordedBuffer && (
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
                  Live Mic Gain Boost
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
                    title="iOS microphones record quietly in browsers; live gain boost compensates for this"
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

            {/* Quick Live Presets */}
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
                <span>ℹ️ Real-time hardware boost applied during recording & live visualizer.</span>
              </div>
            )}
          </div>
        )}

        {/* 2. Post-Recording Top-Up Gain Boost (Visible after Recording is Done, before Save / Load) */}
        {recordedBuffer && (
          <div
            className="form-group"
            style={{
              width: '100%',
              backgroundColor: 'var(--bg-surface)',
              padding: '12px 14px',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--accent-cyan-glow, var(--border-medium))',
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
              boxShadow: '0 2px 8px rgba(0,0,0,0.15)'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Volume2 size={16} color="var(--accent-cyan)" />
                <span style={{ fontWeight: 700, fontSize: 'calc(13px * var(--ui-font-scale, 1))', color: 'var(--text-primary)' }}>
                  Pre-Save Top-Up Gain Boost
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span className="mono" style={{ color: 'var(--accent-cyan)', fontWeight: 700, fontSize: 'calc(14px * var(--ui-font-scale, 1))' }}>
                  {topUpGain > 0 ? `+${topUpGain.toFixed(1)}` : topUpGain.toFixed(1)} dB
                </span>
                <span style={{ fontSize: 'calc(11px * var(--ui-font-scale, 1))', color: 'var(--text-muted)' }}>
                  ({Math.pow(10, topUpGain / 20).toFixed(1)}×)
                </span>
              </div>
            </div>

            {/* Peak Level Information */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                fontSize: 'calc(11px * var(--ui-font-scale, 1))',
                backgroundColor: 'var(--bg-panel)',
                padding: '4px 8px',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border-subtle)'
              }}
            >
              <span style={{ color: 'var(--text-secondary)' }}>
                Take Peak: <strong className="mono" style={{ color: 'var(--text-primary)' }}>{peakDb > -90 ? `${peakDb.toFixed(1)} dBFS` : '-∞ dBFS'}</strong>
              </span>
              <span style={{ color: 'var(--text-secondary)' }}>
                → Output: <strong className="mono" style={{ color: projectedPeakDb > 0.1 ? 'var(--accent-amber)' : 'var(--accent-cyan)' }}>
                  {projectedPeakDb > -90 ? `${projectedPeakDb.toFixed(1)} dBFS` : '-∞ dBFS'}
                </strong>
              </span>
            </div>

            {projectedPeakDb > 0.1 && (
              <div
                style={{
                  fontSize: 'calc(10.5px * var(--ui-font-scale, 1))',
                  color: 'var(--accent-amber)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4
                }}
              >
                <AlertTriangle size={12} />
                <span>Output exceeds 0 dBFS; samples will be safely peak-limited to avoid distortion.</span>
              </div>
            )}

            <Slider
              value={topUpGain}
              min={0}
              max={30}
              step={0.5}
              unit="dB"
              onChange={handleTopUpGainChange}
            />

            {/* Quick Top-Up Presets */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 'calc(10.5px * var(--ui-font-scale, 1))', color: 'var(--text-muted)', marginRight: 2 }}>
                Presets:
              </span>
              {[
                { label: '0 dB (1×)', value: 0 },
                { label: '+3 dB (1.4×)', value: 3 },
                { label: '+6 dB (2×)', value: 6 },
                { label: '+12 dB (4×)', value: 12 },
                { label: '+18 dB (8×)', value: 18 }
              ].map((p) => (
                <button
                  key={p.value}
                  type="button"
                  className={`btn btn-sm ${Math.abs(topUpGain - p.value) < 0.1 ? 'btn-primary' : 'btn-secondary'}`}
                  style={{
                    height: 22,
                    padding: '0 6px',
                    fontSize: 'calc(10.5px * var(--ui-font-scale, 1))'
                  }}
                  onClick={() => handleTopUpGainChange(p.value)}
                >
                  {p.label}
                </button>
              ))}

              {autoNormalizeGain > 0 && peakDb > -90 && peakDb < -0.5 && (
                <button
                  type="button"
                  className="btn btn-sm btn-secondary"
                  style={{
                    height: 22,
                    padding: '0 7px',
                    fontSize: 'calc(10.5px * var(--ui-font-scale, 1))',
                    borderColor: 'var(--accent-cyan-glow)',
                    color: 'var(--accent-cyan)'
                  }}
                  title="Automatically adjust gain so peak reaches 0 dBFS"
                  onClick={() => handleTopUpGainChange(autoNormalizeGain)}
                >
                  <Sparkles size={11} /> Auto Peak (+{autoNormalizeGain} dB)
                </button>
              )}
            </div>

            {/* Audio Preview Control Button */}
            <div style={{ marginTop: 2 }}>
              <button
                type="button"
                className={`btn btn-sm ${isPlayingPreview ? 'btn-danger' : 'btn-secondary'}`}
                style={{ width: '100%', height: 28, fontSize: 'calc(12px * var(--ui-font-scale, 1))' }}
                onClick={handleTogglePreview}
              >
                {isPlayingPreview ? <Square size={13} /> : <Play size={13} />}
                {isPlayingPreview ? 'Stop Audio Preview' : 'Preview Recording with Boost'}
              </button>
            </div>
          </div>
        )}

        {/* Concise Recording Limit Hint (Visible when not yet finished) */}
        {!recordedBuffer && (
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
        )}

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
