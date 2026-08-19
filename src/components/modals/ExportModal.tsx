import React, { useState, useMemo, useEffect } from 'react';
import { Download, Radio, Loader2, Check, Info, RotateCw } from 'lucide-react';
import { Modal } from '../common/Modal';
import { useToast } from '../common/Toast';
import type { ExportFormat, ExportSettings, AudioSelection } from '../../types/audio';
import { generateDefaultExportFileName } from '../../audio/filenameUtils';

export interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  selection: AudioSelection | null;
  currentFileName: string;
  isEdited?: boolean;
  onExport: (
    settings: ExportSettings,
    destination: 'download' | 'library',
    onProgress?: (progress: number) => void
  ) => Promise<void>;
}

type FormatCategory = 'all' | 'popular' | 'lossless' | 'web' | 'mobile';

interface FormatOption {
  id: ExportFormat;
  label: string;
  ext: string;
  category: 'popular' | 'lossless' | 'web' | 'mobile';
  lossless: boolean;
  desc: string;
  details: string;
}

const AVAILABLE_FORMATS: FormatOption[] = [
  {
    id: 'wav',
    label: 'WAV',
    ext: '.wav',
    category: 'popular',
    lossless: true,
    desc: 'Uncompressed PCM',
    details: 'Universal studio standard lossless audio container with high fidelity.'
  },
  {
    id: 'mp3',
    label: 'MP3',
    ext: '.mp3',
    category: 'popular',
    lossless: false,
    desc: 'MPEG Layer III',
    details: 'LAME-encoded compressed audio compatible with virtually every player.'
  },
  {
    id: 'flac',
    label: 'FLAC',
    ext: '.flac',
    category: 'popular',
    lossless: true,
    desc: 'Free Lossless Audio',
    details: 'Open-source lossless compressed audio offering bit-perfect reduction.'
  },
  {
    id: 'aac',
    label: 'AAC',
    ext: '.aac',
    category: 'popular',
    lossless: false,
    desc: 'Advanced Audio Coding',
    details: 'Modern high-efficiency compression standard used across Apple and streaming.'
  },
  {
    id: 'm4a',
    label: 'M4A',
    ext: '.m4a',
    category: 'popular',
    lossless: false,
    desc: 'Apple MPEG-4 Audio',
    details: 'Standard Apple audio container delivering high quality with compact size.'
  },
  {
    id: 'aiff',
    label: 'AIFF',
    ext: '.aiff',
    category: 'lossless',
    lossless: true,
    desc: 'Audio Interchange',
    details: 'Apple lossless uncompressed PCM format used in Logic Pro, Pro Tools & DAWs.'
  },
  {
    id: 'caf',
    label: 'CAF',
    ext: '.caf',
    category: 'lossless',
    lossless: true,
    desc: 'Apple Core Audio',
    details: '64-bit Core Audio file format supporting long multi-channel recordings.'
  },
  {
    id: 'ogg',
    label: 'OGG',
    ext: '.ogg',
    category: 'web',
    lossless: false,
    desc: 'Ogg Vorbis / Opus',
    details: 'Open container format optimal for game audio and web applications.'
  },
  {
    id: 'opus',
    label: 'OPUS',
    ext: '.opus',
    category: 'web',
    lossless: false,
    desc: 'IETF Opus Audio',
    details: 'Cutting-edge codec with ultra-low latency and superior quality at lower bitrates.'
  },
  {
    id: 'webm',
    label: 'WEBM',
    ext: '.webm',
    category: 'web',
    lossless: false,
    desc: 'WebM Audio',
    details: 'Open royalty-free media container tailored for modern HTML5 web playback.'
  },
  {
    id: 'au',
    label: 'AU / SND',
    ext: '.au',
    category: 'lossless',
    lossless: true,
    desc: 'Sun / NeXT Audio',
    details: 'Standard Unix / telecom audio format widely used in scientific signal processing.'
  },
  {
    id: 'raw',
    label: 'RAW PCM',
    ext: '.raw',
    category: 'lossless',
    lossless: true,
    desc: 'Headerless Audio',
    details: 'Pure uncompressed sample data for embedded systems, microcontrollers & DSP analysis.'
  },
  {
    id: 'm4r',
    label: 'M4R',
    ext: '.m4r',
    category: 'mobile',
    lossless: false,
    desc: 'iPhone Ringtone',
    details: 'Standard Apple iPhone ringtone and alert tone format ready for iOS sync.'
  },
  {
    id: 'wma',
    label: 'WMA',
    ext: '.wma',
    category: 'web',
    lossless: false,
    desc: 'Windows Media',
    details: 'Microsoft Windows Media Audio standard for PC playback and legacy systems.'
  },
  {
    id: 'amr',
    label: 'AMR',
    ext: '.amr',
    category: 'mobile',
    lossless: false,
    desc: 'Adaptive Multi-Rate',
    details: 'Optimized voice and telephony codec specialized for speech recording.'
  },
  {
    id: 'mp2',
    label: 'MP2',
    ext: '.mp2',
    category: 'web',
    lossless: false,
    desc: 'MPEG-1 Layer II',
    details: 'Standard broadcast and DAB digital radio audio compression format.'
  }
];

const BITRATES: Array<64 | 96 | 128 | 160 | 192 | 256 | 320> = [64, 96, 128, 160, 192, 256, 320];

const SAMPLE_RATES = [
  { value: 8000, label: '8.0 kHz', desc: 'Telephony / Voice' },
  { value: 16000, label: '16.0 kHz', desc: 'Speech Recognition' },
  { value: 22050, label: '22.05 kHz', desc: 'AM Radio / Lo-Fi' },
  { value: 32000, label: '32.0 kHz', desc: 'Broadcast FM' },
  { value: 44100, label: '44.1 kHz', desc: 'CD Audio (Standard)' },
  { value: 48000, label: '48.0 kHz', desc: 'Studio & Video (Pro)' },
  { value: 88200, label: '88.2 kHz', desc: 'Hi-Res Audio 2x' },
  { value: 96000, label: '96.0 kHz', desc: 'Hi-Res Studio Master' },
  { value: 192000, label: '192.0 kHz', desc: 'Mastering Grade Ultra' }
];

export const ExportModal: React.FC<ExportModalProps> = ({
  isOpen,
  onClose,
  selection,
  currentFileName,
  isEdited = false,
  onExport
}) => {
  const { showToast } = useToast();
  const hasSelection = selection && selection.end > selection.start;

  const [categoryFilter, setCategoryFilter] = useState<FormatCategory>('all');
  const [format, setFormat] = useState<ExportFormat>('wav');
  const [wavBitDepth, setWavBitDepth] = useState<16 | 24 | 32>(16);
  const [aiffBitDepth, setAiffBitDepth] = useState<16 | 24 | 32>(24);
  const [auBitDepth, setAuBitDepth] = useState<8 | 16 | 24 | 32>(16);
  const [rawBitDepth, setRawBitDepth] = useState<8 | 16 | 24 | 32>(16);
  const [rawEndian, setRawEndian] = useState<'little' | 'big'>('little');
  const [flacBitDepth, setFlacBitDepth] = useState<16 | 24>(24);
  const [bitrate, setBitrate] = useState<64 | 96 | 128 | 160 | 192 | 256 | 320>(192);
  const [sampleRate, setSampleRate] = useState<number>(44100);
  const [channels, setChannels] = useState<1 | 2>(2);
  const [exportScope, setExportScope] = useState<'all' | 'selection'>(hasSelection ? 'selection' : 'all');
  const [fileName, setFileName] = useState<string>(() =>
    generateDefaultExportFileName({ sourceFileName: currentFileName, isEdited })
  );
  const [isExporting, setIsExporting] = useState(false);
  const [progress, setProgress] = useState(0);

  // Re-generate default export filename and reset progress when modal opens
  useEffect(() => {
    if (isOpen) {
      setFileName(generateDefaultExportFileName({ sourceFileName: currentFileName, isEdited }));
      setIsExporting(false);
      setProgress(0);
    }
  }, [isOpen, currentFileName, isEdited]);

  const handleRegenerateFileName = () => {
    const newName = generateDefaultExportFileName({ sourceFileName: currentFileName, isEdited });
    setFileName(newName);
    showToast('Filename updated', 'info');
  };

  const selectedFormatOption = useMemo(
    () => AVAILABLE_FORMATS.find((f) => f.id === format) || AVAILABLE_FORMATS[0],
    [format]
  );

  const filteredFormats = useMemo(() => {
    if (categoryFilter === 'all') return AVAILABLE_FORMATS;
    if (categoryFilter === 'popular') {
      return AVAILABLE_FORMATS.filter((f) => f.category === 'popular');
    }
    if (categoryFilter === 'lossless') {
      return AVAILABLE_FORMATS.filter((f) => f.lossless || f.category === 'lossless');
    }
    if (categoryFilter === 'web') {
      return AVAILABLE_FORMATS.filter((f) => f.category === 'web' || f.category === 'popular');
    }
    if (categoryFilter === 'mobile') {
      return AVAILABLE_FORMATS.filter((f) => f.category === 'mobile');
    }
    return AVAILABLE_FORMATS;
  }, [categoryFilter]);

  const handleRunExport = async (destination: 'download' | 'library') => {
    setIsExporting(true);
    setProgress(0);

    const settings: ExportSettings = {
      format,
      wavBitDepth,
      mp3Bitrate: bitrate,
      aacBitrate: bitrate,
      flacBitDepth,
      aiffBitDepth,
      auBitDepth,
      rawBitDepth,
      rawEndian,
      sampleRate,
      channels,
      exportScope,
      fileName
    };

    try {
      await onExport(settings, destination, (p) => setProgress(p));
      onClose();
    } catch (err: any) {
      console.error(err);
      showToast(err?.message || 'Export failed', 'error');
    } finally {
      setIsExporting(false);
    }
  };

  const isBitrateFormat = [
    'mp3',
    'aac',
    'm4a',
    'ogg',
    'opus',
    'webm',
    'm4r',
    'wma',
    'amr',
    'mp2'
  ].includes(format);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Export & Convert Audio"
      maxWidth="620px"
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
            {isExporting ? <Loader2 size={14} className="animate-spin" /> : <Radio size={14} />}
            {isExporting ? 'Saving...' : 'Save to Library'}
          </button>
          <button
            className="btn btn-primary"
            onClick={() => handleRunExport('download')}
            disabled={isExporting}
          >
            {isExporting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
            {isExporting ? `Exporting (${Math.round(progress * 100)}%)...` : `Download ${selectedFormatOption.label}`}
          </button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* File Name input with extension indicator */}
        <div className="form-group">
          <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Export File Name</span>
            <span style={{ color: 'var(--accent-cyan)', fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)' }}>
              Final: {fileName.trim() || 'audio'}{selectedFormatOption.ext}
            </span>
          </label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input
              type="text"
              className="form-input"
              value={fileName}
              onChange={(e) => setFileName(e.target.value)}
              placeholder="audio_export"
              style={{ flex: 1 }}
            />
            <button
              type="button"
              className="btn btn-secondary btn-icon-sm"
              onClick={handleRegenerateFileName}
              title="Reset to default filename with current Taipei timestamp"
              style={{ flexShrink: 0, padding: '7px 8px' }}
            >
              <RotateCw size={13} />
            </button>
            <div
              style={{
                padding: '7px 10px',
                background: 'var(--bg-surface)',
                border: '1px solid var(--border-medium)',
                borderRadius: 4,
                fontFamily: 'var(--font-mono)',
                fontSize: 'var(--font-sm)',
                fontWeight: 600,
                color: 'var(--accent-cyan)',
                flexShrink: 0
              }}
            >
              {selectedFormatOption.ext}
            </div>
          </div>
        </div>

        {/* Format Categories & Filter Pills */}
        <div className="form-group">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <label className="form-label" style={{ marginBottom: 0 }}>Select Audio Format</label>
            {/* Filter Pills */}
            <div style={{ display: 'flex', gap: 4 }}>
              {[
                { id: 'all', label: 'All (16)' },
                { id: 'popular', label: 'Popular' },
                { id: 'lossless', label: 'Lossless & Studio' },
                { id: 'web', label: 'Compressed / Web' },
                { id: 'mobile', label: 'Mobile & Voice' }
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setCategoryFilter(tab.id as FormatCategory)}
                  style={{
                    padding: '2px 7px',
                    fontSize: 'calc(10px * var(--ui-font-scale, 1))',
                    borderRadius: 10,
                    border: '1px solid',
                    borderColor: categoryFilter === tab.id ? 'var(--accent-cyan)' : 'var(--border-subtle)',
                    background: categoryFilter === tab.id ? 'var(--accent-cyan-dim)' : 'transparent',
                    color: categoryFilter === tab.id ? 'var(--accent-cyan)' : 'var(--text-muted)',
                    cursor: 'pointer',
                    fontWeight: categoryFilter === tab.id ? 600 : 400,
                    transition: 'all 0.15s ease'
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Grid of Audio Formats */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(88px, 1fr))',
              gap: 6,
              maxHeight: '190px',
              overflowY: 'auto',
              padding: '2px 1px'
            }}
          >
            {filteredFormats.map((fmt) => {
              const isSelected = format === fmt.id;
              return (
                <button
                  key={fmt.id}
                  type="button"
                  className={`btn btn-sm ${isSelected ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => setFormat(fmt.id)}
                  title={fmt.details}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 1,
                    padding: '7px 4px',
                    position: 'relative',
                    textAlign: 'center',
                    borderColor: isSelected ? 'var(--accent-cyan)' : undefined,
                    boxShadow: isSelected ? '0 0 8px rgba(0, 240, 255, 0.25)' : undefined
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                    <span style={{ fontWeight: 700, fontSize: 'calc(11px * var(--ui-font-scale, 1))' }}>
                      {fmt.label}
                    </span>
                    {isSelected && <Check size={10} color="var(--accent-cyan)" />}
                  </div>
                  <span
                    style={{
                      fontSize: 'calc(9px * var(--ui-font-scale, 1))',
                      color: isSelected ? '#ffffff' : 'var(--text-muted)',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      maxWidth: '100%'
                    }}
                  >
                    {fmt.desc}
                  </span>
                  {fmt.lossless && (
                    <span
                      style={{
                        position: 'absolute',
                        top: 2,
                        right: 3,
                        fontSize: '7px',
                        fontWeight: 700,
                        color: isSelected ? '#67e8f9' : '#10b981',
                        letterSpacing: '0.3px',
                        textTransform: 'uppercase'
                      }}
                    >
                      HQ
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Selected Format Info Banner */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '8px 10px',
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 6,
            fontSize: 'var(--font-xs)'
          }}
        >
          <Info size={14} color="var(--accent-cyan)" style={{ flexShrink: 0 }} />
          <div style={{ flex: 1, color: 'var(--text-secondary)' }}>
            <strong style={{ color: 'var(--text-primary)' }}>{selectedFormatOption.label}</strong> ({selectedFormatOption.ext}): {selectedFormatOption.details}
          </div>
          {selectedFormatOption.lossless ? (
            <span
              style={{
                fontSize: '9px',
                fontWeight: 700,
                padding: '2px 6px',
                borderRadius: 4,
                background: 'rgba(16, 185, 129, 0.2)',
                color: '#10b981',
                textTransform: 'uppercase',
                flexShrink: 0
              }}
            >
              Lossless
            </span>
          ) : (
            <span
              style={{
                fontSize: '9px',
                fontWeight: 700,
                padding: '2px 6px',
                borderRadius: 4,
                background: 'rgba(56, 189, 248, 0.15)',
                color: '#38bdf8',
                textTransform: 'uppercase',
                flexShrink: 0
              }}
            >
              Compressed
            </span>
          )}
        </div>

        {/* Format Specific Configuration Settings */}
        {/* 1. WAV Bit Depth */}
        {format === 'wav' && (
          <div className="form-group">
            <label className="form-label">WAV Bit Depth (Resolution)</label>
            <div style={{ display: 'flex', gap: 6 }}>
              {([16, 24, 32] as const).map((bits) => (
                <button
                  key={bits}
                  type="button"
                  className={`btn btn-sm ${wavBitDepth === bits ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ flex: 1 }}
                  onClick={() => setWavBitDepth(bits)}
                >
                  {bits}-bit {bits === 32 ? 'Float (Master)' : bits === 24 ? 'PCM (Studio)' : 'PCM (CD)'}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 2. AIFF Bit Depth */}
        {format === 'aiff' && (
          <div className="form-group">
            <label className="form-label">AIFF Bit Depth (Lossless Audio)</label>
            <div style={{ display: 'flex', gap: 6 }}>
              {([16, 24, 32] as const).map((bits) => (
                <button
                  key={bits}
                  type="button"
                  className={`btn btn-sm ${aiffBitDepth === bits ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ flex: 1 }}
                  onClick={() => setAiffBitDepth(bits)}
                >
                  {bits}-bit {bits === 32 ? 'Float' : bits === 24 ? 'Studio Pro' : 'Standard'}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 3. FLAC Bit Depth */}
        {format === 'flac' && (
          <div className="form-group">
            <label className="form-label">FLAC Lossless Resolution</label>
            <div style={{ display: 'flex', gap: 6 }}>
              {([16, 24] as const).map((bits) => (
                <button
                  key={bits}
                  type="button"
                  className={`btn btn-sm ${flacBitDepth === bits ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ flex: 1 }}
                  onClick={() => setFlacBitDepth(bits)}
                >
                  {bits}-bit {bits === 24 ? 'Studio Master' : 'CD Lossless'}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 4. AU / SND Bit Depth */}
        {format === 'au' && (
          <div className="form-group">
            <label className="form-label">Sun / NeXT AU Bit Depth</label>
            <div style={{ display: 'flex', gap: 6 }}>
              {([8, 16, 24, 32] as const).map((bits) => (
                <button
                  key={bits}
                  type="button"
                  className={`btn btn-sm ${auBitDepth === bits ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ flex: 1 }}
                  onClick={() => setAuBitDepth(bits)}
                >
                  {bits}-bit {bits === 32 ? 'Float' : 'Linear PCM'}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 5. RAW PCM Settings */}
        {format === 'raw' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 8 }}>
            <div className="form-group">
              <label className="form-label">Raw Sample Precision</label>
              <div style={{ display: 'flex', gap: 4 }}>
                {([8, 16, 24, 32] as const).map((bits) => (
                  <button
                    key={bits}
                    type="button"
                    className={`btn btn-sm ${rawBitDepth === bits ? 'btn-primary' : 'btn-secondary'}`}
                    style={{ flex: 1, padding: '4px 2px' }}
                    onClick={() => setRawBitDepth(bits)}
                  >
                    {bits}-bit {bits === 32 ? 'Float' : ''}
                  </button>
                ))}
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Endianness / Byte Order</label>
              <div style={{ display: 'flex', gap: 4 }}>
                <button
                  type="button"
                  className={`btn btn-sm ${rawEndian === 'little' ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ flex: 1 }}
                  onClick={() => setRawEndian('little')}
                  title="x86, ARM, PC, Standard"
                >
                  Little (LE)
                </button>
                <button
                  type="button"
                  className={`btn btn-sm ${rawEndian === 'big' ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ flex: 1 }}
                  onClick={() => setRawEndian('big')}
                  title="Network, RISC, Motorala"
                >
                  Big (BE)
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 6. Compressed Bitrate Selector for all lossy/bitrate formats */}
        {isBitrateFormat && (
          <div className="form-group">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <label className="form-label" style={{ marginBottom: 4 }}>
                {selectedFormatOption.label} Target Bitrate (Quality)
              </label>
              <span style={{ fontSize: 'var(--font-xs)', color: 'var(--accent-cyan)', fontFamily: 'var(--font-mono)' }}>
                {bitrate} kbps {bitrate >= 256 ? '(Audiophile)' : bitrate >= 192 ? '(High)' : '(Standard)'}
              </span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(65px, 1fr))', gap: 4 }}>
              {BITRATES.map((br) => (
                <button
                  key={br}
                  type="button"
                  className={`btn btn-sm ${bitrate === br ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ padding: '5px 2px', fontSize: 'calc(10px * var(--ui-font-scale, 1))' }}
                  onClick={() => setBitrate(br)}
                >
                  {br} kbps
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Channels & Sample Rate Row */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.3fr', gap: 10 }}>
          {/* Channels */}
          <div className="form-group">
            <label className="form-label">Channels</label>
            <div style={{ display: 'flex', gap: 4 }}>
              <button
                type="button"
                className={`btn btn-sm ${channels === 2 ? 'btn-primary' : 'btn-secondary'}`}
                style={{ flex: 1 }}
                onClick={() => setChannels(2)}
              >
                Stereo (2ch)
              </button>
              <button
                type="button"
                className={`btn btn-sm ${channels === 1 ? 'btn-primary' : 'btn-secondary'}`}
                style={{ flex: 1 }}
                onClick={() => setChannels(1)}
              >
                Mono (1ch)
              </button>
            </div>
          </div>

          {/* Sample Rate */}
          <div className="form-group">
            <label className="form-label">Sample Rate</label>
            <select
              className="form-input"
              value={sampleRate}
              onChange={(e) => setSampleRate(parseInt(e.target.value, 10))}
              style={{ fontSize: 'var(--font-sm)' }}
            >
              {SAMPLE_RATES.map((sr) => (
                <option key={sr.value} value={sr.value}>
                  {sr.label} — {sr.desc}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Export Scope */}
        <div className="form-group">
          <label className="form-label">Export Scope</label>
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              type="button"
              className={`btn btn-sm ${exportScope === 'selection' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ flex: 1 }}
              disabled={!hasSelection}
              onClick={() => setExportScope('selection')}
            >
              {hasSelection
                ? `Selected Region (${selection.start.toFixed(2)}s – ${selection.end.toFixed(2)}s)`
                : 'No Region Selected'}
            </button>
            <button
              type="button"
              className={`btn btn-sm ${exportScope === 'all' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ flex: 1 }}
              onClick={() => setExportScope('all')}
            >
              Entire Audio Track
            </button>
          </div>
        </div>

        {/* Exporting Progress bar & status */}
        {isExporting && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 4 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--font-xs)', color: 'var(--text-muted)' }}>
              <span>Exporting {selectedFormatOption.label}...</span>
              <span className="mono" style={{ color: 'var(--accent-cyan)' }}>{Math.round(progress * 100)}%</span>
            </div>
            <div
              style={{
                height: 6,
                backgroundColor: 'var(--bg-input)',
                borderRadius: 3,
                overflow: 'hidden'
              }}
            >
              <div
                style={{
                  width: `${Math.round(progress * 100)}%`,
                  height: '100%',
                  background: 'linear-gradient(90deg, #38bdf8, #00f0ff)',
                  transition: 'width 0.1s linear'
                }}
              />
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
};
