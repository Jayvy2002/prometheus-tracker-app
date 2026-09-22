import { supabase } from '../../../lib/supabase';
import type { ImportMapping } from '../domain/columns';
import { sha256Hex } from '../domain/hashSource';

export type CoachImportRowView = {
  row_no: number;
  status: 'ready' | 'ignored' | 'error' | 'applied';
  error_code: string | null;
  planned: Record<string, unknown> | null;
};

export type CoachImportView = {
  import_id: string;
  status: 'previewed' | 'committed' | 'failed' | 'cancelled';
  kind: 'workout' | 'body_weight';
  filename: string;
  file_sha256: string;
  ready_count: number;
  ignored_count: number;
  error_count: number;
  applied_count: number;
  issues: string[];
  potential_duplicates: Array<{ workout_id: string; name: string; date: string }>;
  rows: CoachImportRowView[];
  row_count: number;
  row_offset: number;
  row_limit: number;
  errors_only: boolean;
};

export function asCoachImportView(value: unknown): CoachImportView {
  const row = (value && typeof value === 'object') ? value as Record<string, unknown> : {};
  return {
    import_id: String(row.import_id ?? ''),
    status: (row.status as CoachImportView['status']) ?? 'previewed',
    kind: (row.kind as CoachImportView['kind']) ?? 'workout',
    filename: String(row.filename ?? ''),
    file_sha256: String(row.file_sha256 ?? ''),
    ready_count: Number(row.ready_count ?? 0),
    ignored_count: Number(row.ignored_count ?? 0),
    error_count: Number(row.error_count ?? 0),
    applied_count: Number(row.applied_count ?? 0),
    issues: Array.isArray(row.issues) ? row.issues.map(String) : [],
    potential_duplicates: Array.isArray(row.potential_duplicates)
      ? row.potential_duplicates as CoachImportView['potential_duplicates']
      : [],
    rows: Array.isArray(row.rows) ? row.rows as CoachImportRowView[] : [],
    row_count: Number(row.row_count ?? 0),
    row_offset: Number(row.row_offset ?? 0),
    row_limit: Number(row.row_limit ?? 50),
    errors_only: row.errors_only === true,
  };
}

export async function previewCoachImport(input: {
  subjectUserId: string;
  filename: string;
  sourceText: string;
  mapping: ImportMapping;
  idempotencyKey: string;
}): Promise<{ data: CoachImportView | null; error: string | null }> {
  const { data, error } = await supabase.rpc('preview_coach_import', {
    p_subject_user_id: input.subjectUserId,
    p_filename: input.filename,
    p_source_text: input.sourceText,
    p_mapping: input.mapping,
    p_idempotency_key: input.idempotencyKey,
  });
  if (error) return { data: null, error: error.message };
  return { data: asCoachImportView(data), error: null };
}

export async function commitCoachImport(input: {
  importId: string;
  sourceText: string;
  mapping: ImportMapping;
}): Promise<{ data: CoachImportView | null; error: string | null }> {
  const fileSha = await sha256Hex(input.sourceText);
  const { data, error } = await supabase.rpc('commit_coach_import', {
    p_import_id: input.importId,
    p_file_sha256: fileSha,
    p_mapping: input.mapping,
  });
  if (error) return { data: null, error: error.message };
  return { data: asCoachImportView(data), error: null };
}

export async function cancelCoachImport(
  importId: string,
): Promise<{ data: CoachImportView | null; error: string | null }> {
  const { data, error } = await supabase.rpc('cancel_coach_import', {
    p_import_id: importId,
  });
  if (error) return { data: null, error: error.message };
  return { data: asCoachImportView(data), error: null };
}

export async function getCoachImport(
  importId: string,
  page?: { offset?: number; limit?: number; errorsOnly?: boolean },
): Promise<{ data: CoachImportView | null; error: string | null }> {
  const { data, error } = await supabase.rpc('get_coach_import', {
    p_import_id: importId,
    p_offset: page?.offset ?? 0,
    p_limit: page?.limit ?? 50,
    p_errors_only: page?.errorsOnly ?? false,
  });
  if (error) return { data: null, error: error.message };
  return { data: asCoachImportView(data), error: null };
}
