/**
 * Comprehensive Audio Format Definitions & File Picker Filters
 * Ensures native OS file pickers grey out unsupported files on Windows, macOS, Linux, and Mobile.
 */

export const SUPPORTED_AUDIO_EXTENSIONS = [
  // Common & Lossless Formats
  '.wav',
  '.wave',
  '.mp3',
  '.aac',
  '.m4a',
  '.mp4',
  '.flac',
  '.ogg',
  '.oga',
  '.opus',
  '.webm',
  '.weba',
  // Studio & Broadcast Containers
  '.aiff',
  '.aif',
  '.aifc',
  '.caf',
  '.au',
  '.snd',
  // Specialized & Voice Formats
  '.m4r',
  '.amr',
  '.3gp',
  '.3gpp',
  '.mp2',
  '.mp1',
  '.wma',
  '.ac3',
  '.raw',
  '.pcm',
  // Project Archives
  '.zip'
] as const;

export const SUPPORTED_AUDIO_MIME_TYPES = [
  'audio/*',
  'audio/wav',
  'audio/x-wav',
  'audio/wave',
  'audio/mp3',
  'audio/mpeg',
  'audio/aac',
  'audio/mp4',
  'audio/x-m4a',
  'audio/m4a',
  'audio/flac',
  'audio/x-flac',
  'audio/ogg',
  'audio/x-ogg',
  'application/ogg',
  'audio/opus',
  'audio/webm',
  'video/webm',
  'audio/aiff',
  'audio/x-aiff',
  'audio/x-caf',
  'audio/caf',
  'audio/basic',
  'audio/au',
  'audio/x-au',
  'audio/amr',
  'audio/3gpp',
  'audio/x-mp2',
  'audio/mp2',
  'audio/x-m4r',
  'audio/x-ms-wma',
  'audio/wma',
  'audio/ac3',
  'audio/raw',
  'audio/x-raw',
  'application/zip',
  'application/x-zip-compressed',
  'multipart/x-zip'
] as const;

/**
 * Comma-separated accept string for <input type="file" accept={SUPPORTED_UPLOAD_ACCEPT} />
 * By specifying both explicit file extensions (.wav, .mp3, .flac, etc.) and audio MIME types,
 * the OS file chooser (macOS Finder, Windows Explorer, Linux GTK, Android/iOS Picker)
 * will grey out / disable all non-supported file formats.
 */
export const SUPPORTED_UPLOAD_ACCEPT: string = [
  ...SUPPORTED_AUDIO_EXTENSIONS,
  ...SUPPORTED_AUDIO_MIME_TYPES
].join(',');

/**
 * Formatted string listing popular supported formats for UI badges and tooltips.
 */
export const SUPPORTED_FORMATS_SUMMARY = 'WAV, MP3, AAC, FLAC, M4A, OGG, OPUS, AIFF, CAF, AU, AMR, MP2, WMA, PCM, .ZIP';

/**
 * Checks if a given file object is in the supported audio format list.
 */
export function isSupportedAudioFile(file: File): boolean {
  if (!file) return false;

  const fileName = (file.name || '').toLowerCase();
  
  // Check extension match
  const hasValidExt = SUPPORTED_AUDIO_EXTENSIONS.some((ext) => fileName.endsWith(ext));
  if (hasValidExt) return true;

  // Check MIME type match
  if (file.type) {
    const mime = file.type.toLowerCase();
    if (mime.startsWith('audio/')) return true;
    if (SUPPORTED_AUDIO_MIME_TYPES.some((m) => m === mime)) return true;
  }

  return false;
}

/**
 * Checks if a filename string has a supported audio extension.
 */
export function isSupportedAudioFileName(fileName: string): boolean {
  if (!fileName) return false;
  const lower = fileName.toLowerCase();
  return SUPPORTED_AUDIO_EXTENSIONS.some((ext) => lower.endsWith(ext));
}
