import React, { useState, useEffect, useRef } from 'react';
import { Mic, Square, Pause, Play, Trash2, Check, Radio } from 'lucide-react';
import { Modal } from '../common/Modal';
import { StudioRecorder, type RecorderMetrics } from '../../audio/Recorder';
import { LiveVisualizer } from './LiveVisualizer';
import { VuMeter } from './VuMeter';
import { useToast } from '../common/Toast';

export interface RecordModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaveRecording: (buffer: AudioBuffer, fileName: string, action: 'editor' | 'library') => void;
}

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

  useEffect(() => {
    if (isOpen) {
      recorderRef.current = new StudioRecorder();
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
  }, [isOpen]);

  const handleStartRecord = async () => {
    try {
      if (recorderRef.current) {
        await recorderRef.current.start();
        setIsRecording(true);
        setIsPaused(false);
        setRecordedBuffer(null);
      }
    } catch (err) {
      console.error(err);
      showToast('Microphone access denied or not available.', 'error');
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
      showToast(`Recording captured (${buffer.duration.toFixed(1)}s)`, 'success');
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
          fontSize: 32,
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
                fontSize: 10,
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
                fontSize: 10,
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 4 }}>
          {!isRecording && !recordedBuffer && (
            <button className="btn btn-primary btn-lg" onClick={handleStartRecord}>
              <Mic size={18} /> Start Studio Recording
            </button>
          )}

          {isRecording && (
            <>
              <button
                className="btn btn-secondary btn-lg"
                onClick={handlePauseResume}
              >
                {isPaused ? <Play size={18} /> : <Pause size={18} />}
                {isPaused ? 'Resume' : 'Pause'}
              </button>

              <button
                className="btn btn-danger btn-lg"
                onClick={handleStopRecord}
              >
                <Square size={18} /> Stop Recording
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
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  className="btn btn-primary btn-lg"
                  style={{ flex: 1 }}
                  onClick={() => handleFinish('editor')}
                >
                  <Check size={16} /> Load into Editor
                </button>
                <button
                  className="btn btn-secondary btn-lg"
                  style={{ flex: 1 }}
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
