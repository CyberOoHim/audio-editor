import React, { useState, useEffect } from 'react';
import { Radio, Activity, Sparkles } from 'lucide-react';
import { Modal } from '../common/Modal';
import { Slider } from '../common/Slider';
import type { AudioSelection, SignalType, SignalGeneratorSettings } from '../../types/audio';

export interface GeneratorModalProps {
  isOpen: boolean;
  onClose: () => void;
  selection: AudioSelection | null;
  currentTime: number;
  onGenerateSignal: (settings: SignalGeneratorSettings) => void;
}

export const GeneratorModal: React.FC<GeneratorModalProps> = ({
  isOpen,
  onClose,
  selection,
  currentTime,
  onGenerateSignal
}) => {
  const hasSelection = Boolean(selection && selection.end > selection.start);
  const selectionDuration = hasSelection ? selection!.end - selection!.start : 0;

  const [type, setType] = useState<SignalType>('sine');
  const [frequency, setFrequency] = useState<number>(440);
  const [gainDb, setGainDb] = useState<number>(-12.0);
  const [duration, setDuration] = useState<number>(hasSelection ? Math.max(0.1, selectionDuration) : 2.0);
  const [channels, setChannels] = useState<1 | 2>(2);
  const [placement, setPlacement] = useState<SignalGeneratorSettings['placement']>(
    hasSelection ? 'replace-selection' : 'playhead'
  );

  useEffect(() => {
    if (isOpen) {
      if (hasSelection && selectionDuration > 0) {
        setDuration(Math.round(selectionDuration * 100) / 100);
        setPlacement('replace-selection');
      } else {
        setPlacement('playhead');
      }
    }
  }, [isOpen, hasSelection, selectionDuration]);

  const freqPresets = [
    { label: '440 Hz (A4)', freq: 440, desc: 'Concert Pitch' },
    { label: '1,000 Hz (1kHz)', freq: 1000, desc: 'Calibration Reference' },
    { label: '100 Hz', freq: 100, desc: 'Sub Bass' },
    { label: '432 Hz', freq: 432, desc: 'Verdi A' },
    { label: '60 Hz', freq: 60, desc: 'AC Hum Check' },
    { label: '10,000 Hz (10kHz)', freq: 10000, desc: 'Treble Tone' }
  ];

  const handleApply = () => {
    onGenerateSignal({
      type,
      frequency,
      gainDb,
      durationSec: duration,
      channels,
      placement
    });
    onClose();
  };

  const isNoise = type === 'white-noise' || type === 'pink-noise';

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Signal & Tone Generator"
      maxWidth="500px"
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={handleApply}>
            <Radio size={15} /> Generate {isNoise ? type.replace('-', ' ') : `${frequency}Hz ${type}`} ({duration}s)
          </button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Waveform Selector */}
        <div className="form-group">
          <label className="form-label">Signal Type / Waveform</label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
            {[
              { id: 'sine', label: 'Sine Tone', desc: 'Pure Fundamental' },
              { id: 'triangle', label: 'Triangle', desc: 'Warm Harmonics' },
              { id: 'square', label: 'Square', desc: 'Rich / Digital' },
              { id: 'sawtooth', label: 'Sawtooth', desc: 'Bright / Harsh' },
              { id: 'pink-noise', label: 'Pink Noise', desc: '1/f Acoustic Test' },
              { id: 'white-noise', label: 'White Noise', desc: 'Equal Spectrum' }
            ].map((sig) => (
              <button
                key={sig.id}
                type="button"
                className={`btn ${type === sig.id ? 'btn-primary' : 'btn-secondary'}`}
                style={{
                  height: 'auto',
                  padding: '8px 6px',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  textAlign: 'center'
                }}
                onClick={() => setType(sig.id as SignalType)}
              >
                <span style={{ fontWeight: 600, fontSize: 11 }}>{sig.label}</span>
                <span style={{ fontSize: 9, opacity: 0.75 }}>{sig.desc}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Frequency Control (Hidden for Noise) */}
        {!isNoise && (
          <div className="form-group">
            <div className="form-label">
              <span>Oscillator Frequency</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <input
                  type="number"
                  min="20"
                  max="20000"
                  step="1"
                  value={frequency}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    if (!isNaN(val)) setFrequency(Math.max(20, Math.min(20000, val)));
                  }}
                  className="form-input mono"
                  style={{ width: 75, height: 26, padding: '2px 6px', fontSize: 12, textAlign: 'right' }}
                />
                <span className="mono" style={{ color: 'var(--accent-cyan)', fontSize: 12 }}>Hz</span>
              </div>
            </div>

            <Slider
              value={frequency}
              min={20}
              max={5000}
              step={1}
              unit="Hz"
              onChange={(val) => setFrequency(Math.round(val))}
            />

            {/* Presets */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 4 }}>
              {freqPresets.map((p) => (
                <button
                  key={p.freq}
                  type="button"
                  className={`btn btn-sm ${frequency === p.freq ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ height: 24, padding: '0 8px', fontSize: 11 }}
                  onClick={() => setFrequency(p.freq)}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Amplitude / Gain dBFS */}
        <div className="form-group">
          <div className="form-label">
            <span>Amplitude (Gain)</span>
            <span className="mono" style={{ color: 'var(--accent-cyan)' }}>{gainDb} dBFS</span>
          </div>
          <Slider
            value={gainDb}
            min={-48}
            max={0}
            step={0.5}
            unit="dBFS"
            onChange={(val) => setGainDb(Math.round(val * 10) / 10)}
          />
        </div>

        {/* Duration Control */}
        <div className="form-group">
          <div className="form-label">
            <span>Duration</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input
                type="number"
                min="0.1"
                max="60"
                step="0.1"
                value={duration}
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  if (!isNaN(val) && val > 0) setDuration(Math.min(60, val));
                }}
                className="form-input mono"
                style={{ width: 70, height: 26, padding: '2px 6px', fontSize: 12, textAlign: 'right' }}
              />
              <span className="mono" style={{ color: 'var(--accent-cyan)', fontSize: 12 }}>sec</span>
            </div>
          </div>
          <Slider
            value={duration}
            min={0.1}
            max={10.0}
            step={0.1}
            unit="sec"
            onChange={(val) => setDuration(Math.round(val * 10) / 10)}
          />
        </div>

        {/* Channels Mode */}
        <div className="form-group">
          <label className="form-label">Channel Format</label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            <button
              type="button"
              className={`btn btn-sm ${channels === 2 ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setChannels(2)}
            >
              Stereo (2 Channels)
            </button>
            <button
              type="button"
              className={`btn btn-sm ${channels === 1 ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setChannels(1)}
            >
              Mono (1 Channel)
            </button>
          </div>
        </div>

        {/* Target Placement */}
        <div className="form-group">
          <label className="form-label">Insertion Target</label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6 }}>
            <button
              type="button"
              className={`btn btn-sm ${placement === 'playhead' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setPlacement('playhead')}
            >
              At Playhead ({currentTime.toFixed(2)}s)
            </button>
            <button
              type="button"
              className={`btn btn-sm ${placement === 'start' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setPlacement('start')}
            >
              At Beginning
            </button>
            <button
              type="button"
              className={`btn btn-sm ${placement === 'end' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setPlacement('end')}
            >
              At End
            </button>
            {hasSelection ? (
              <button
                type="button"
                className={`btn btn-sm ${placement === 'replace-selection' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setPlacement('replace-selection')}
              >
                <Sparkles size={11} /> Replace Selection
              </button>
            ) : (
              <button
                type="button"
                className={`btn btn-sm ${placement === 'new-file' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setPlacement('new-file')}
              >
                <Activity size={11} /> New Track
              </button>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
};
