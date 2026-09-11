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

export interface AudioHistoryRegionPatch {
  startSample: number;
  channels: Float32Array[];
}

export interface AudioHistoryEntry {
  id: string;
  description: string;
  timestamp: number;
  buffer: AudioBuffer;
  regionPatch?: AudioHistoryRegionPatch;
  selectionBefore?: AudioSelection | null;
  selectionAfter?: AudioSelection | null;
}

export type ExportFormat =
  | 'wav'
  | 'mp3'
  | 'aac'
  | 'm4a'
  | 'flac'
  | 'ogg'
  | 'opus'
  | 'webm'
  | 'aiff'
  | 'caf'
  | 'au'
  | 'raw'
  | 'm4r'
  | 'wma'
  | 'amr'
  | 'mp2';

export interface ExportSettings {
  format: ExportFormat;
  wavBitDepth: 16 | 24 | 32;
  mp3Bitrate: 64 | 96 | 128 | 160 | 192 | 256 | 320;
  aacBitrate?: 64 | 96 | 128 | 160 | 192 | 256 | 320;
  flacBitDepth?: 16 | 24;
  aiffBitDepth?: 16 | 24 | 32;
  auBitDepth?: 8 | 16 | 24 | 32;
  rawBitDepth?: 8 | 16 | 24 | 32;
  rawEndian?: 'little' | 'big';
  sampleRate: number; // 8000, 16000, 22050, 32000, 44100, 48000, 88200, 96000, 192000
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

export type VoiceChangerEnvironment =
  | 'none'
  | 'cathedral'
  | 'bathroom'
  | 'warehouse'
  | 'hall'
  | 'underwater'
  | 'behind-wall'
  | 'cosmic-void';

export type VoiceChangerBandpass =
  | 'none'
  | 'telephone'
  | 'walkie-talkie'
  | 'megaphone'
  | 'am-radio'
  | 'underwater'
  | 'behind-wall';

export interface VoiceChangerSettings {
  presetId?: string;
  // Pitch & Character
  pitchSemitones: number; // -12 to +12
  ringModFreq: number;    // 0 = off, 20 to 300 Hz
  ringModMix: number;     // 0 to 1
  robotTone: number;      // 0 to 1

  // 1. Lo-Fi Suite
  bitDepth: number;       // 4 to 16 (16 = bypass)
  sampleRateKhz: number;  // 4, 8, 11, 16, 22, 44 (44 = bypass)
  vinylCrackle: number;   // 0 to 1
  tapeSaturation: number; // 0 to 1
  tapeFlutter: number;    // 0 to 1 (wow/flutter)
  bandpass: VoiceChangerBandpass;

  // 2. Spatial & Environment Suite
  environment: VoiceChangerEnvironment;
  reverbMix: number;      // 0 to 1
  reverbDecay: number;    // 0.2 to 5.0s
  reverbDamping: number;  // 500 to 16000 Hz
  reverbPreDelay: number; // 0 to 0.1s
  stereoWidth: number;    // 0 to 2 (1 = normal, 2 = 3D Haas expand)

  // Master
  outputGainDb: number;   // -12 to +12 dB
  mix: number;            // 0 to 1 (dry / wet)
  scope: 'all' | 'selection';
}
