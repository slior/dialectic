const PAD_WIDTH = 2;
const RADIX_BASE = 36;
const RANDOM_SUFFIX_LENGTH = 6;
const RANDOM_SUFFIX_START = 2;

/**
 * Formats a date to YYYYMMDD-hhmm format for use in trace names.
 * 
 * @param date - The date to format.
 * @returns Formatted timestamp string in YYYYMMDD-hhmm format.
 */
export function formatTimestampForTraceName(date: Date): string {
  const pad = (n: number): string => n.toString().padStart(PAD_WIDTH, '0');
  const yyyy = date.getFullYear();
  const MM = pad(date.getMonth() + 1);
  const dd = pad(date.getDate());
  const hh = pad(date.getHours());
  const mm = pad(date.getMinutes());
  return `${yyyy}${MM}${dd}-${hh}${mm}`;
}

export function generateDebateId(now: Date = new Date()): string {
  const pad = (n: number): string => n.toString().padStart(PAD_WIDTH, '0');
  const yyyy = now.getFullYear();
  const MM = pad(now.getMonth() + 1);
  const dd = pad(now.getDate());
  const hh = pad(now.getHours());
  const mm = pad(now.getMinutes());
  const ss = pad(now.getSeconds());
  const rand = Math.random().toString(RADIX_BASE).slice(RANDOM_SUFFIX_START, RANDOM_SUFFIX_LENGTH);
  return `deb-${yyyy}${MM}${dd}-${hh}${mm}${ss}-${rand}`;
}
