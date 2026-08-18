import React, { useState } from 'react';
import { Download, Radio, Loader2 } from 'lucide-react';
import { Modal } from '../common/Modal';
import type { ExportFormat, ExportSettings, AudioSelection } from '../../types/audio';

export interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  selection: AudioSelection | null;
  currentFileName: string;
  onExport: (settings: ExportSettings, destination: 'download' | 'library') => Promise<void>;
}

export const ExportModal: React.FC<ExportModalProps> = ({
  isOpen,
  onClose,
  selection,
  currentFileName,
  onExport
}) => {
  const hasSelection = selection && selection.end > selection.start;

  const [format, setFormat] = useState<ExportFormat>('wav');
  const [wavBitDepth, setWavBitDepth] = useState<16 | 24 | 32>(16);
  const [mp3Bitrate, setMp3Bitrate] = useState<128 | 192 | 256 | 320>(192);
  const [sampleRate, setSampleRate] = useState<number>(44100);
  const [channels, setChannels] = useState<1 | 2>(2);
  const [exportScope, setExportScope] = useState<'all' | 'selection'>(hasSelection ? 'selection' : 'all');
  const [fileName, setFileName] = useState(currentFileName || 'exported_audio');
  const [isExporting, setIsExporting] = useState(false);
  const [progress, setProgress] = useState(0);

  const handleRunExport = async (destination: 'download' | 'library') => {
    setIsExporting(true);
    setProgress(0);

    const settings: ExportSettings = {
      format,
      wavBitDepth,
      mp3Bitrate,
      sampleRate,
      channels,
      exportScope,
      fileName
    };

    try {
      await onExport(settings, destination);
      onClose();
    } catch (err) {
      console.error(err);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Export & Convert Audio"
      maxWidth="500px"
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose} disabled={isExporting}>
            Cancel
          </button>
          <button
            className="btn btn-secondary"
            onClick={() => handleRunExport('library')}
            disabled={isExporting}
          >
            <Radio size={14} /> Save to Library
          </button>
          <button
            className="btn btn-primary"
            onClick={() => handleRunExport('download')}
            disabled={isExporting}
          >
            {isExporting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
            {isExporting ? `Exporting (${Math.round(progress * 100)}%)...` : 'Download File'}
          </button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* File Name */}
        <div className="form-group">
          <label className="form-label">File Name</label>
          <input
            type="text"
            className="form-input"
            value={fileName}
            onChange={(e) => setFileName(e.target.value)}
            placeholder="audio_export"
          />
        </div>

        {/* Format Selector */}
        <div className="form-group">
          <label className="form-label">Audio Format</label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
            {(['wav', 'mp3', 'flac', 'ogg'] as ExportFormat[]).map((fmt) => (
              <button
                key={fmt}
                className={`btn btn-sm ${format === fmt ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setFormat(fmt)}
                style={{ textTransform: 'uppercase', fontWeight: 600 }}
              >
                {fmt}
              </button>
            ))}
          </div>
        </div>

        {/* Format Specific Settings */}
        {format === 'wav' && (
          <div className="form-group">
            <label className="form-label">WAV Bit Depth</label>
            <div style={{ display: 'flex', gap: 6 }}>
              {([16, 24, 32] as const).map((bits) => (
                <button
                  key={bits}
                  className={`btn btn-sm ${wavBitDepth === bits ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ flex: 1 }}
                  onClick={() => setWavBitDepth(bits)}
                >
                  {bits}-bit {bits === 32 ? 'Float' : 'PCM'}
                </button>
              ))}
            </div>
          </div>
        )}

        {format === 'mp3' && (
          <div className="form-group">
            <label className="form-label">MP3 Bitrate (Quality)</label>
            <div style={{ display: 'flex', gap: 6 }}>
              {([128, 192, 256, 320] as const).map((br) => (
                <button
                  key={br}
                  className={`btn btn-sm ${mp3Bitrate === br ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ flex: 1 }}
                  onClick={() => setMp3Bitrate(br)}
                >
                  {br} kbps
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Channels & Sample Rate */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div className="form-group">
            <label className="form-label">Channels</label>
            <div style={{ display: 'flex', gap: 4 }}>
              <button
                className={`btn btn-sm ${channels === 2 ? 'btn-primary' : 'btn-secondary'}`}
                style={{ flex: 1 }}
                onClick={() => setChannels(2)}
              >
                Stereo
              </button>
              <button
                className={`btn btn-sm ${channels === 1 ? 'btn-primary' : 'btn-secondary'}`}
                style={{ flex: 1 }}
                onClick={() => setChannels(1)}
              >
                Mono
              </button>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Sample Rate</label>
            <select
              className="form-input"
              value={sampleRate}
              onChange={(e) => setSampleRate(parseInt(e.target.value, 10))}
            >
              <option value={44100}>44.1 kHz (CD)</option>
              <option value={48000}>48.0 kHz (Studio)</option>
              <option value={96000}>96.0 kHz (Hi-Res)</option>
            </select>
          </div>
        </div>

        {/* Export Scope */}
        <div className="form-group">
          <label className="form-label">Export Scope</label>
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              className={`btn btn-sm ${exportScope === 'selection' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ flex: 1 }}
              disabled={!hasSelection}
              onClick={() => setExportScope('selection')}
            >
              {hasSelection ? 'Selected Region Only' : 'No Region Selected'}
            </button>
            <button
              className={`btn btn-sm ${exportScope === 'all' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ flex: 1 }}
              onClick={() => setExportScope('all')}
            >
              Entire Track
            </button>
          </div>
        </div>

        {/* Exporting Progress */}
        {isExporting && (
          <div style={{
            height: 6,
            backgroundColor: 'var(--bg-input)',
            borderRadius: 3,
            overflow: 'hidden',
            marginTop: 4
          }}>
            <div
              style={{
                width: `${Math.round(progress * 100)}%`,
                height: '100%',
                background: 'linear-gradient(90deg, #38bdf8, #00f0ff)',
                transition: 'width 0.1s linear'
              }}
            />
          </div>
        )}
      </div>
    </Modal>
  );
};
