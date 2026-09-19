/** P3.1 — organisation des séances. Un seul moteur ; le calendrier n’invente pas de dates en mode ordre. */

export const SESSION_ORGANIZATIONS = ['fixed_days', 'in_order'] as const;

export type SessionOrganization = (typeof SESSION_ORGANIZATIONS)[number];

export function normalizeSessionOrganization(value: unknown): SessionOrganization {
  return value === 'in_order' ? 'in_order' : 'fixed_days';
}

export function isFixedDaysOrganization(value: unknown): boolean {
  return normalizeSessionOrganization(value) === 'fixed_days';
}

export function sessionOrderLetter(orderIndex: number): string {
  const n = Math.max(0, Math.floor(Number(orderIndex) || 0));
  if (n < 26) return String.fromCharCode(65 + n);
  return String(n + 1);
}
