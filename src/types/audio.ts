export interface AudioSelection {
  start: number; // in seconds
  end: number;   // in seconds
}

export type PlayState = 'idle' | 'playing' | 'paused' | 'recording';

export type TimeFormat = 'hms' | 'seconds' | 'samples' | 'smpte';

export type FadeCurve = 'linear' | 'logarithmic' | 'exponential' | 's-curve';
export type FadeType = 'in' | 'out';
export type FadePosition = 'start' | 'end' | 'selection' | 'playhead';

export interface FadeSettings {
  type: FadeType;
  durationSec: number;
  curve: FadeCurve;
  position: FadePosition;
}

export interface NormalizeSettings {
  targetDb: number; // dBFS (-30 to 0)
  scope: 'all' | 'selection';
}

export type SignalType = 'sine' | 'square' | 'sawtooth' | 'triangle' | 'white-noise' | 'pink-noise';

export interface SignalGeneratorSettings {
  type: SignalType;
  frequency: number; // Hz
  gainDb: number;    // dBFS (-60 to 0)
  durationSec: number;
  channels: 1 | 2;
  placement: 'playhead' | 'start' | 'end' | 'replace-selection' | 'new-file';
}

export interface EQSettings {
  enabled: boolean;
  lowGain: number;   // dB (-24 to +24)
  midGain: number;   // dB (-24 to +24)
  highGain: number;  // dB (-24 to +24)
  lowFreq: number;   // Hz default 100
  midFreq: number;   // Hz default 1000
  highFreq: number;  // Hz default 8000
}

export interface FilterSettings {
  highpassEnabled: boolean;
  highpassFreq: number; // Hz (20 to 1000)
  lowpassEnabled: boolean;
  lowpassFreq: number;  // Hz (1000 to 20000)
}

export interface CompressorSettings {
  enabled: boolean;
  threshold: number; // dB (-60 to 0)
  knee: number;      // dB (0 to 40)
  ratio: number;     // 1 to 20
  attack: number;    // sec (0 to 1)
  release: number;   // sec (0 to 1)
}

export interface AudioHistoryEntry {
  id: string;
  description: string;
  timestamp: number;
  buffer: AudioBuffer;
}

export type ExportFormat = 'wav' | 'mp3' | 'aac' | 'm4a' | 'flac' | 'ogg' | 'opus' | 'webm';

export interface ExportSettings {
  format: ExportFormat;
  wavBitDepth: 16 | 24 | 32;
  mp3Bitrate: 128 | 192 | 256 | 320;
  aacBitrate?: 128 | 192 | 256 | 320;
  flacBitDepth?: 16 | 24;
  sampleRate: number; // 44100, 48000, 96000
  channels: 1 | 2;
  exportScope: 'all' | 'selection';
  fileName: string;
}

export interface RecordingState {
  isRecording: boolean;
  isPaused: boolean;
  duration: number;
  stream: MediaStream | null;
  audioContext: AudioContext | null;
  analyserNode: AnalyserNode | null;
  peakL: number;
  peakR: number;
}
