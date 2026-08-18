/**
 * Filename utilities for generating standard, mobile-compatible export names.
 * Format: [process_tag]_[source_file_name]_[taipei_time_code]
 * Example: edited_PodcastEpisode_20260818_202530
 */

/**
 * Returns a 15-character date/time code in the Asia/Taipei timezone (UTC+8).
 * Format: YYYYMMDD_HHmmss (e.g. "20260818_202700")
 */
export function getTaipeiDateTimeCode(date: Date = new Date()): string {
  try {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Taipei',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });

    const parts = formatter.formatToParts(date);
    const getPart = (type: string) => parts.find((p) => p.type === type)?.value || '00';

    const year = getPart('year');
    const month = getPart('month');
    const day = getPart('day');
    const hour = getPart('hour');
    const minute = getPart('minute');
    const second = getPart('second');

    return `${year}${month}${day}_${hour}${minute}${second}`;
  } catch {
    // Fallback if Intl timeZone is unsupported
    const d = new Date(date.getTime() + 8 * 3600 * 1000); // UTC+8
    const Y = d.getUTCFullYear();
    const M = String(d.getUTCMonth() + 1).padStart(2, '0');
    const D = String(d.getUTCDate()).padStart(2, '0');
    const h = String(d.getUTCHours()).padStart(2, '0');
    const m = String(d.getUTCMinutes()).padStart(2, '0');
    const s = String(d.getUTCSeconds()).padStart(2, '0');
    return `${Y}${M}${D}_${h}${m}${s}`;
  }
}

/**
 * Sanitizes a filename by stripping existing file extensions and replacing
 * illegal/special characters and spaces with safe underscores.
 */
export function sanitizeFileName(name: string): string {
  if (!name || !name.trim()) return 'audio';

  // Strip known file extensions if present at the end
  let base = name.trim().replace(/\.[a-zA-Z0-9]{2,5}$/, '');

  // Strip any existing process prefix if user is re-exporting
  base = base.replace(/^(edited|conv|rec|gen)_+/i, '');

  // Strip trailing timestamps if re-exporting (e.g. _20260818_120000)
  base = base.replace(/_\d{8}_\d{6}$/, '');

  // Replace illegal filesystem characters and consecutive spaces with underscores
  base = base.replace(/[/\\?%*:|"<>#~;,\s]+/g, '_');

  // Trim leading/trailing underscores or hyphens
  base = base.replace(/^_+|_+$/g, '');

  return base || 'audio';
}

export interface GenerateFileNameOptions {
  sourceFileName: string;
  isEdited: boolean;
  date?: Date;
  /** Maximum total character length of the base filename (default 48 for mobile compatibility) */
  maxTotalLength?: number;
}

/**
 * Generates standard default export filename:
 * [process_tag]_[source_name]_[taipei_timestamp]
 *
 * Enforces length limit suitable for mobile file dialogs and share sheets.
 */
export function generateDefaultExportFileName(options: GenerateFileNameOptions): string {
  const { sourceFileName, isEdited, date = new Date(), maxTotalLength = 48 } = options;

  const processTag = isEdited ? 'edited' : 'conv';
  const timeCode = getTaipeiDateTimeCode(date); // e.g. "20260818_202530" (15 chars)

  const cleanSource = sanitizeFileName(sourceFileName);

  // Length breakdown: processTag (4-6 chars) + "_" (1) + sourceName (?) + "_" (1) + timeCode (15)
  // Total overhead = processTag.length + 1 + 1 + timeCode.length = ~23 chars
  const fixedOverhead = processTag.length + 1 + 1 + timeCode.length;
  const maxSourceLength = Math.max(8, maxTotalLength - fixedOverhead);

  let truncatedSource = cleanSource;
  if (truncatedSource.length > maxSourceLength) {
    truncatedSource = truncatedSource.substring(0, maxSourceLength).replace(/_+$/, '');
  }

  return `${processTag}_${truncatedSource}_${timeCode}`;
}
