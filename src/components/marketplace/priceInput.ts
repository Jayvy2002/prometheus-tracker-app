/**
 * « Mon profil coach » — the indicative rate is stored in exact cents and typed
 * the way the language writes it: « 120 », « 120,50 » (fr) or « 120.50 » (en).
 * Parsing is done on the digits (no float rounding), a comma or a dot is
 * accepted in both languages, and anything else is refused, never guessed.
 */

export type PriceParse =
  | { ok: true; cents: number | null }
  | { ok: false };

/** Cents → what the field shows: no decimals for a round amount. */
export function formatPriceInput(cents: number | null | undefined, language: string): string {
  if (cents == null || !Number.isFinite(cents) || cents <= 0) return '';
  const whole = Math.floor(cents / 100);
  const rest = Math.round(cents % 100);
  if (rest === 0) return String(whole);
  const separator = language.toLowerCase().startsWith('fr') ? ',' : '.';
  return `${whole}${separator}${String(rest).padStart(2, '0')}`;
}

/** Typed text → exact cents. Empty or zero = no listed rate (null). */
export function parsePriceInput(raw: string): PriceParse {
  const text = raw.replace(/[\s\u00a0\u202f]/g, '');
  if (text === '') return { ok: true, cents: null };
  const match = /^(\d{1,7})(?:[.,](\d{0,2}))?$/.exec(text);
  if (!match) return { ok: false };
  const whole = Number(match[1]);
  const fraction = Number((match[2] ?? '').padEnd(2, '0'));
  const cents = whole * 100 + fraction;
  return { ok: true, cents: cents > 0 ? cents : null };
}
