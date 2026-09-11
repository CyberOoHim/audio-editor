import type { VoiceChangerSettings } from '../types/audio';

export interface VoicePreset {
  id: string;
  name: string;
  category: 'lofi' | 'spatial' | 'character';
  iconName: string;
  description: string;
  badge: string;
  settings: Partial<VoiceChangerSettings>;
}

export const DEFAULT_VOICE_SETTINGS: VoiceChangerSettings = {
  presetId: 'custom',
  pitchSemitones: 0,
  ringModFreq: 0,
  ringModMix: 0,
  robotTone: 0,

  // 1. Lo-Fi Suite
  bitDepth: 16,
  sampleRateKhz: 44,
  vinylCrackle: 0,
  tapeSaturation: 0,
  tapeFlutter: 0,
  bandpass: 'none',

  // 2. Spatial & Environment Suite
  environment: 'none',
  reverbMix: 0,
  reverbDecay: 1.5,
  reverbDamping: 6000,
  reverbPreDelay: 0.02,
  stereoWidth: 1.0,

  // Master
  outputGainDb: 0,
  mix: 1.0,
  scope: 'all'
};

export const VOICE_PRESETS: VoicePreset[] = [
  // --- 1. LO-FI PRESETS ---
  {
    id: 'vinyl-record',
    name: '1940s Vinyl Record',
    category: 'lofi',
    iconName: 'Disc',
    description: 'Analog shellac micro-crackle, surface dust, warm saturation and band-limited frequency warmth.',
    badge: 'Vintage',
    settings: {
      bitDepth: 12,
      sampleRateKhz: 22,
      vinylCrackle: 0.55,
      tapeSaturation: 0.4,
      tapeFlutter: 0.25,
      bandpass: 'am-radio',
      environment: 'none',
      reverbMix: 0.15,
      reverbDecay: 0.6,
      stereoWidth: 1.0
    }
  },
  {
    id: 'cassette-tape',
    name: '90s Cassette Tape',
    category: 'lofi',
    iconName: 'CassetteTape',
    description: 'Magnetic tape compression warmth with subtle capstan motor wow & flutter wobble.',
    badge: 'Analog',
    settings: {
      bitDepth: 16,
      sampleRateKhz: 44,
      vinylCrackle: 0,
      tapeSaturation: 0.5,
      tapeFlutter: 0.55,
      bandpass: 'none',
      environment: 'none',
      reverbMix: 0.1,
      reverbDecay: 0.5,
      stereoWidth: 1.1
    }
  },
  {
    id: 'chiptune-8bit',
    name: '8-Bit Chiptune Arcade',
    category: 'lofi',
    iconName: 'Gamepad2',
    description: 'Crushed 4-bit sample resolution and 8kHz downsampling for authentic retro console crunch.',
    badge: 'Digital',
    settings: {
      bitDepth: 4,
      sampleRateKhz: 8,
      vinylCrackle: 0,
      tapeSaturation: 0.1,
      tapeFlutter: 0,
      bandpass: 'none',
      environment: 'none',
      reverbMix: 0,
      stereoWidth: 1.0
    }
  },
  {
    id: 'walkie-talkie',
    name: 'Tactical Walkie-Talkie',
    category: 'lofi',
    iconName: 'Radio',
    description: 'Narrowband RF communication with steep bandpass filtering and resonant squelch.',
    badge: 'Radio',
    settings: {
      bitDepth: 10,
      sampleRateKhz: 16,
      vinylCrackle: 0.08,
      tapeSaturation: 0.35,
      tapeFlutter: 0,
      bandpass: 'walkie-talkie',
      environment: 'none',
      reverbMix: 0,
      stereoWidth: 1.0
    }
  },
  {
    id: 'megaphone-bullhorn',
    name: 'Drive-Thru / Megaphone',
    category: 'lofi',
    iconName: 'Megaphone',
    description: 'Horn acoustic resonance peak at 1.4kHz with gritty hard-drive amplifier distortion.',
    badge: 'Acoustic',
    settings: {
      bitDepth: 12,
      sampleRateKhz: 22,
      vinylCrackle: 0,
      tapeSaturation: 0.65,
      tapeFlutter: 0,
      bandpass: 'megaphone',
      environment: 'none',
      reverbMix: 0.1,
      reverbDecay: 0.4,
      stereoWidth: 1.0
    }
  },
  {
    id: 'am-shortwave',
    name: 'AM Shortwave Radio',
    category: 'lofi',
    iconName: 'Antenna',
    description: 'Distant broadcast transmission with muffled high end and heterodyne static presence.',
    badge: 'Broadcast',
    settings: {
      bitDepth: 12,
      sampleRateKhz: 16,
      vinylCrackle: 0.35,
      tapeSaturation: 0.3,
      tapeFlutter: 0.15,
      bandpass: 'am-radio',
      environment: 'none',
      reverbMix: 0,
      stereoWidth: 0.8
    }
  },

  // --- 2. SPATIAL & ENVIRONMENT PRESETS ---
  {
    id: 'gothic-cathedral',
    name: 'Gothic Cathedral',
    category: 'spatial',
    iconName: 'Church',
    description: 'Vast architectural stone vault reverberation with 4.0s diffuse decay and broad stereo staging.',
    badge: 'Vast Space',
    settings: {
      environment: 'cathedral',
      reverbMix: 0.65,
      reverbDecay: 4.2,
      reverbDamping: 5000,
      reverbPreDelay: 0.035,
      stereoWidth: 1.8,
      bandpass: 'none',
      tapeSaturation: 0,
      tapeFlutter: 0,
      vinylCrackle: 0,
      bitDepth: 16,
      sampleRateKhz: 44
    }
  },
  {
    id: 'tiled-bathroom',
    name: 'Tiled Bathroom',
    category: 'spatial',
    iconName: 'Bath',
    description: 'Dense, fast early reflections reflecting off glazed ceramic tiles with crisp slap-back.',
    badge: 'Reflective',
    settings: {
      environment: 'bathroom',
      reverbMix: 0.55,
      reverbDecay: 0.5,
      reverbDamping: 14000,
      reverbPreDelay: 0.008,
      stereoWidth: 1.4,
      bandpass: 'none',
      tapeSaturation: 0,
      bitDepth: 16,
      sampleRateKhz: 44
    }
  },
  {
    id: 'industrial-warehouse',
    name: 'Industrial Warehouse',
    category: 'spatial',
    iconName: 'Warehouse',
    description: 'Cavernous concrete enclosure with 45ms initial echo slap and hollow low-end presence.',
    badge: 'Industrial',
    settings: {
      environment: 'warehouse',
      reverbMix: 0.6,
      reverbDecay: 3.0,
      reverbDamping: 3800,
      reverbPreDelay: 0.045,
      stereoWidth: 1.6,
      bandpass: 'none'
    }
  },
  {
    id: 'concert-hall',
    name: 'Concert Hall',
    category: 'spatial',
    iconName: 'Music',
    description: 'Balanced symphonic auditorium with warm wood damping and 2.2s natural acoustic sustain.',
    badge: 'Auditorium',
    settings: {
      environment: 'hall',
      reverbMix: 0.45,
      reverbDecay: 2.2,
      reverbDamping: 7500,
      reverbPreDelay: 0.025,
      stereoWidth: 1.4,
      bandpass: 'none'
    }
  },
  {
    id: 'underwater-submerged',
    name: 'Underwater Submerged',
    category: 'spatial',
    iconName: 'Waves',
    description: 'Acoustic fluid dampening with 420Hz steep cutoff, dense hydro-reverb and bass pressure.',
    badge: 'Submerged',
    settings: {
      environment: 'underwater',
      bandpass: 'underwater',
      reverbMix: 0.6,
      reverbDecay: 1.6,
      reverbDamping: 900,
      pitchSemitones: -1,
      stereoWidth: 1.2,
      tapeFlutter: 0.2
    }
  },
  {
    id: 'behind-the-wall',
    name: 'Behind the Wall',
    category: 'spatial',
    iconName: 'Building',
    description: 'Sound transmitting through drywall/concrete: muffled treble with boomy resonant bass punch.',
    badge: 'Muffled',
    settings: {
      environment: 'behind-wall',
      bandpass: 'behind-wall',
      reverbMix: 0.4,
      reverbDecay: 0.9,
      reverbDamping: 600,
      stereoWidth: 0.9
    }
  },
  {
    id: 'cosmic-void',
    name: 'Cosmic Void Echo',
    category: 'spatial',
    iconName: 'Orbit',
    description: 'Endless deep-space ambient tail with wide 3D Haas stereo expansion.',
    badge: 'Ambient',
    settings: {
      environment: 'cosmic-void',
      reverbMix: 0.7,
      reverbDecay: 5.0,
      reverbDamping: 6500,
      reverbPreDelay: 0.06,
      stereoWidth: 2.0
    }
  },

  // --- 3. VOICE CHARACTER PRESETS ---
  {
    id: 'cyborg-robot',
    name: 'Cyborg Robot',
    category: 'character',
    iconName: 'Bot',
    description: 'Ring-modulated 65Hz carrier wave oscillator producing metallic, synthesized voice textures.',
    badge: 'Robotic',
    settings: {
      ringModFreq: 65,
      ringModMix: 0.85,
      robotTone: 0.8,
      bitDepth: 12,
      tapeSaturation: 0.35,
      environment: 'none',
      reverbMix: 0.15,
      reverbDecay: 0.6,
      stereoWidth: 1.3
    }
  },
  {
    id: 'deep-monster',
    name: 'Deep Voice / Titan',
    category: 'character',
    iconName: 'Skull',
    description: 'Deep pitch shift down 6 semitones with sub-harmonic resonance and cavernous room body.',
    badge: 'Pitch Down',
    settings: {
      pitchSemitones: -6,
      tapeSaturation: 0.3,
      environment: 'warehouse',
      reverbMix: 0.3,
      reverbDecay: 1.8,
      stereoWidth: 1.3
    }
  },
  {
    id: 'helium-chipmunk',
    name: 'Helium Chipmunk',
    category: 'character',
    iconName: 'Smile',
    description: 'Bright pitch shift up 8 semitones with lively acoustic presence.',
    badge: 'Pitch Up',
    settings: {
      pitchSemitones: 8,
      tapeSaturation: 0.1,
      environment: 'bathroom',
      reverbMix: 0.2,
      reverbDecay: 0.4,
      stereoWidth: 1.2
    }
  },
  {
    id: 'vintage-telephone',
    name: 'Telephone Operator',
    category: 'character',
    iconName: 'PhoneCall',
    description: 'Classic 1960s telephone line with band-limited audio, light grit, and dry acoustic intimacy.',
    badge: 'POTS Line',
    settings: {
      bandpass: 'telephone',
      bitDepth: 12,
      sampleRateKhz: 22,
      tapeSaturation: 0.25,
      vinylCrackle: 0.06,
      environment: 'none',
      reverbMix: 0,
      stereoWidth: 0.7
    }
  }
];
