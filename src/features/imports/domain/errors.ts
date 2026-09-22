const IMPORT_ERROR_KEYS = [
  'file_empty',
  'file_too_large',
  'too_many_rows',
  'too_many_columns',
  'cell_too_long',
  'header_missing',
  'malformed_csv',
  'unresolved_ambiguity',
  'duplicate_mapping',
  'duplicate_header',
  'column_out_of_range',
  'date_required',
  'exercise_required',
  'body_weight_required',
  'weight_role_conflict',
  'invalid_mapping',
  'invalid_date',
  'invalid_number',
  'invalid_unit',
  'formula_rejected',
  'rir_rpe_conflict',
  'already_exists',
  'already_imported',
  'potential_duplicate',
  'duplicates_changed',
  'preview_quota',
  'file_changed',
  'mapping_changed',
  'import_conflict',
  'nothing_to_import',
  'not_your_client',
  'coach_capability_required',
  'coach_account_closed',
  'not_authenticated',
  'invalid_filename',
  'invalid_idempotency_key',
  'invalid_subject',
  'not_found',
] as const;

export type ImportErrorCode = (typeof IMPORT_ERROR_KEYS)[number];

export function importErrorI18nKey(code: string | null | undefined): string {
  if (code && (IMPORT_ERROR_KEYS as readonly string[]).includes(code)) {
    return `coaching.importCsv.errors.${code}`;
  }
  return 'coaching.importCsv.errors.generic';
}
