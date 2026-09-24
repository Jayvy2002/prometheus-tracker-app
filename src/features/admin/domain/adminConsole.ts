const ADMIN_ERROR_CODES = [
  'not_authorized',
  'confirmation_required',
  'review_note_required',
  'qualification_locked',
  'request_closed',
  'already_in_catalog',
  'name_taken',
  'name_required',
  'invalid_exercise',
  'invalid_action',
  'invalid_decision',
  'report_closed',
  'proof_missing',
  'not_found',
  'last_operator',
  'already_merged',
  'winner_merged',
  'request_changed',
] as const;

/** Civil YYYY-MM-DD stays on that calendar day in every timezone. */
export function formatCivilDate(value: string, language: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return value;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  const locale = language.toLowerCase().startsWith('en') ? 'en' : 'fr';
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(date);
}

export type AdminErrorCode = (typeof ADMIN_ERROR_CODES)[number] | 'generic';

/** A destructive or private action stays disabled until the operator confirms it. */
export function actionReady(confirm: boolean, note: string, noteRequired: boolean): boolean {
  if (!confirm) return false;
  if (noteRequired && note.trim().length === 0) return false;
  return true;
}

export function adminErrorKey(message: string): AdminErrorCode {
  const found = ADMIN_ERROR_CODES.find(code => message.includes(code));
  return found ?? 'generic';
}

export function shortOperatorId(userId: string): string {
  const compact = userId.replace(/-/g, '');
  return compact.slice(0, 8);
}

/** Every report action except acknowledge needs an operator note. */
export function reportNoteRequired(action: string): boolean {
  return action !== 'acknowledge';
}

const OPERATOR_USER_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isOperatorUserId(value: string): boolean {
  return OPERATOR_USER_ID.test(value.trim());
}
