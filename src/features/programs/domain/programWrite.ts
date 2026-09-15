export const PROGRAM_STALE = 'stale';

export function isProgramStaleError(message: string | null | undefined): boolean {
  if (!message) return false;
  return message.includes(PROGRAM_STALE);
}

export function mapProgramWriteError(
  message: string | null | undefined,
  copy: { stale: string; fallback: string },
): string {
  if (isProgramStaleError(message)) return copy.stale;
  return copy.fallback;
}

/** YYYY-MM-DD in local calendar — avoids UTC midnight shifting the day. */
export function assignStartLabel(isoDate: string, locale: string): string {
  const parts = isoDate.split('-').map(Number);
  const year = parts[0];
  const month = parts[1];
  const day = parts[2];
  if (!year || !month || !day) return isoDate;
  return new Date(year, month - 1, day).toLocaleDateString(locale);
}
