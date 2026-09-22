const CLAIM_ERRORS = [
  'invite_invalid',
  'invite_revoked',
  'invite_expired',
  'invite_consumed',
  'invite_email_mismatch',
  'confirmation_required',
  'not_authenticated',
  'invalid_email',
  'invalid_name',
  'not_found',
  'dossier_attached',
  'dossier_closed',
  'coach_capability_required',
  'coach_account_closed',
] as const;

export function provisionalErrorCode(message: string | null | undefined): string {
  if (!message) return 'generic';
  return CLAIM_ERRORS.find((code) => message === code) ?? 'generic';
}

export function provisionalErrorI18nKey(message: string | null | undefined): string {
  const code = provisionalErrorCode(message);
  if (code === 'generic') return 'coaching.provisional.errors.generic';
  if (code === 'dossier_closed' || code === 'dossier_attached') {
    return `coaching.importCsv.errors.${code}`;
  }
  return `coaching.provisional.errors.${code}`;
}
