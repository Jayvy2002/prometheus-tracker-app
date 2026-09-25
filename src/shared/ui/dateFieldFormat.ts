/**
 * Pure helpers behind DateField: a date is shown and typed in the order of the
 * APP language (FR jj/mm/aaaa, EN mm/dd/yyyy), never the phone's, and is always
 * exchanged as ISO `YYYY-MM-DD` — the contract of the former `<input type="date">`.
 *
 * The language rule mirrors `dateLocale` (src/lib/utils.ts): English only when
 * the language starts with « en », French otherwise. shared/ui stays a leaf, so
 * the rule is repeated here and a test keeps both in step.
 */

export type DateOrder = 'dmy' | 'mdy';

export type TypedDate =
  | { status: 'empty' }
  /** Not a full day / month / year yet (still typing, or garbage). */
  | { status: 'partial' }
  /** Full shape but the day does not exist (31/02, 13th month…). */
  | { status: 'impossible' }
  | { status: 'valid'; iso: string };

export type DateBoundsResult = 'ok' | 'beforeMin' | 'afterMax';

export function dateOrderFor(lang?: string): DateOrder {
  return (lang ?? 'fr').toLowerCase().startsWith('en') ? 'mdy' : 'dmy';
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function daysInMonth(year: number, month: number): number {
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  return [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
}

/** ISO string for a real calendar day, or null. Years 1000–9999 only (four digits). */
function isoFromParts(year: number, month: number, day: number): string | null {
  if (!Number.isInteger(year) || year < 1000 || year > 9999) return null;
  if (!Number.isInteger(month) || month < 1 || month > 12) return null;
  if (!Number.isInteger(day) || day < 1 || day > daysInMonth(year, month)) return null;
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

/** True only for a strict `YYYY-MM-DD` that names a real day. */
export function isIsoDate(value: string | null | undefined): value is string {
  if (!value) return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  return isoFromParts(Number(match[1]), Number(match[2]), Number(match[3])) === value;
}

/** ISO date → what the field shows in the app language (« 24/09/2026 » / « 09/24/2026 »); '' otherwise. */
export function formatIsoForInput(iso: string | null | undefined, lang?: string): string {
  if (!isIsoDate(iso)) return '';
  const [year, month, day] = iso.split('-');
  return dateOrderFor(lang) === 'mdy' ? `${month}/${day}/${year}` : `${day}/${month}/${year}`;
}

const SEP = String.raw`\s*[/.\-\s]\s*`;
const TYPED = new RegExp(String.raw`^(\d{1,2})${SEP}(\d{1,2})${SEP}(\d{4})$`);
const TYPED_ISO = new RegExp(String.raw`^(\d{4})${SEP}(\d{1,2})${SEP}(\d{1,2})$`);
const TYPED_DIGITS = /^(\d{2})(\d{2})(\d{4})$/;

/**
 * Reads what the person typed, in the app language's order. Tolerates `/`, `-`,
 * `.` and spaces as separators, one-digit day or month, eight digits in a row
 * (« 24092026 ») and a pasted ISO date (year first). The year always has four
 * digits: « 12/03/90 » stays partial rather than guessing the century.
 */
export function parseTypedDate(text: string, lang?: string): TypedDate {
  const trimmed = text.trim();
  if (trimmed === '') return { status: 'empty' };

  const iso = TYPED_ISO.exec(trimmed);
  if (iso) {
    const value = isoFromParts(Number(iso[1]), Number(iso[2]), Number(iso[3]));
    return value ? { status: 'valid', iso: value } : { status: 'impossible' };
  }

  const match = TYPED.exec(trimmed) ?? TYPED_DIGITS.exec(trimmed);
  if (!match) return { status: 'partial' };
  const first = Number(match[1]);
  const second = Number(match[2]);
  const year = Number(match[3]);
  const [month, day] = dateOrderFor(lang) === 'mdy' ? [first, second] : [second, first];
  const value = isoFromParts(year, month, day);
  return value ? { status: 'valid', iso: value } : { status: 'impossible' };
}

/** ISO dates compare as strings; a missing or malformed bound is no bound. */
export function checkDateBounds(iso: string, min?: string, max?: string): DateBoundsResult {
  if (isIsoDate(min) && iso < min) return 'beforeMin';
  if (isIsoDate(max) && iso > max) return 'afterMax';
  return 'ok';
}

/**
 * Typing helper for number pads without a « / » key (iOS): when one digit is
 * added at the end and completes the day or the month, the slash follows.
 * A separator typed right after an automatic slash is not doubled. Deleting,
 * pasting or editing in the middle is left untouched.
 */
export function withAutoSlash(previous: string, next: string): string {
  if (next.length !== previous.length + 1 || !next.startsWith(previous)) return next;
  if (/[/.\-\s]$/.test(next) && previous.endsWith('/')) return previous;
  if (!/\d$/.test(next)) return next;
  return /^\d{2}$/.test(next) || /^\d{1,2}\/\d{2}$/.test(next) ? `${next}/` : next;
}
