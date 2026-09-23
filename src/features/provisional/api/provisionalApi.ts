import { supabase } from '../../../lib/supabase';
import type { ImportMapping } from '../../imports/domain/columns';
import { asCoachImportView, type CoachImportView } from '../../imports/api/coachImportApi';
import { provisionalErrorCode, provisionalErrorI18nKey } from '../domain/errors';

export { provisionalErrorCode, provisionalErrorI18nKey };

export type ProvisionalStatus = 'preparing' | 'invited' | 'attached' | 'revoked';

export type ProvisionalDossier = {
  id: string;
  display_name: string;
  status: ProvisionalStatus;
  created_at: string;
  attached_at: string | null;
  workout_count: number;
  weight_count: number;
  invite_email: string | null;
  invite_expires_at: string | null;
};

export type ProvisionalSetPreview = {
  order: number;
  weight_kg: number | null;
  reps: number | null;
  rir: number | null;
  set_type: string;
};

export type ProvisionalExercisePreview = {
  name: string;
  notes: string;
  sets: ProvisionalSetPreview[];
};

export type ProvisionalSessionPreview = {
  date: string;
  name: string;
  exercises: string[];
  details: ProvisionalExercisePreview[];
};

export type ProvisionalWeightPreview = {
  measured_at: string;
  weight_kg: number | null;
  notes: string;
};

export type ProvisionalCollisions = {
  files: string[];
  session_dates: string[];
  weight_dates: string[];
};

export type ProvisionalClaimPreview = {
  ok: boolean;
  already_attached: boolean;
  dossier_id: string | null;
  display_name: string;
  coach_name: string;
  workout_count: number;
  weight_count: number;
  skipped_weight_count: number;
  coaching_status: string | null;
  sessions: ProvisionalSessionPreview[];
  weight_dates: string[];
  weights: ProvisionalWeightPreview[];
  revision: string | null;
  collisions: ProvisionalCollisions;
};

function asDossier(value: unknown): ProvisionalDossier | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  const id = String(row.id ?? '');
  if (!id) return null;
  const status = String(row.status ?? 'preparing');
  return {
    id,
    display_name: String(row.display_name ?? ''),
    status: (status === 'invited' || status === 'attached' || status === 'revoked' ? status : 'preparing'),
    created_at: String(row.created_at ?? ''),
    attached_at: row.attached_at ? String(row.attached_at) : null,
    workout_count: Number(row.workout_count ?? 0),
    weight_count: Number(row.weight_count ?? 0),
    invite_email: row.invite_email ? String(row.invite_email) : null,
    invite_expires_at: row.invite_expires_at ? String(row.invite_expires_at) : null,
  };
}

function asClaim(value: unknown): ProvisionalClaimPreview {
  const row = (value && typeof value === 'object') ? value as Record<string, unknown> : {};
  const sessions = Array.isArray(row.sessions) ? row.sessions : [];
  const dates = Array.isArray(row.weight_dates) ? row.weight_dates.map(String) : [];
  return {
    ok: row.ok !== false,
    already_attached: row.already_attached === true,
    dossier_id: row.dossier_id ? String(row.dossier_id) : null,
    display_name: String(row.display_name ?? ''),
    coach_name: String(row.coach_name ?? ''),
    workout_count: Number(row.workout_count ?? 0),
    weight_count: Number(row.weight_count ?? 0),
    skipped_weight_count: Number(row.skipped_weight_count ?? 0),
    coaching_status: row.coaching_status ? String(row.coaching_status) : null,
    sessions: sessions.map((item) => {
      const session = (item && typeof item === 'object') ? item as Record<string, unknown> : {};
      const details = Array.isArray(session.details) ? session.details : [];
      return {
        date: String(session.date ?? ''),
        name: String(session.name ?? ''),
        exercises: Array.isArray(session.exercises) ? session.exercises.map(String) : [],
        details: details.map((entry) => {
          const exercise = (entry && typeof entry === 'object') ? entry as Record<string, unknown> : {};
          const sets = Array.isArray(exercise.sets) ? exercise.sets : [];
          return {
            name: String(exercise.name ?? ''),
            notes: String(exercise.notes ?? ''),
            sets: sets.map((set) => {
              const row = (set && typeof set === 'object') ? set as Record<string, unknown> : {};
              return {
                order: Number(row.order ?? 0),
                weight_kg: row.weight_kg == null ? null : Number(row.weight_kg),
                reps: row.reps == null ? null : Number(row.reps),
                rir: row.rir == null ? null : Number(row.rir),
                set_type: String(row.set_type ?? 'working'),
              };
            }),
          };
        }),
      };
    }),
    weight_dates: dates,
    weights: (Array.isArray(row.weights) ? row.weights : []).map((item) => {
      const weight = (item && typeof item === 'object') ? item as Record<string, unknown> : {};
      return {
        measured_at: String(weight.measured_at ?? ''),
        weight_kg: weight.weight_kg == null ? null : Number(weight.weight_kg),
        notes: String(weight.notes ?? ''),
      };
    }),
    revision: row.revision ? String(row.revision) : null,
    collisions: {
      files: Array.isArray((row.collisions as Record<string, unknown> | undefined)?.files)
        ? ((row.collisions as Record<string, unknown>).files as unknown[]).map(String)
        : [],
      session_dates: Array.isArray((row.collisions as Record<string, unknown> | undefined)?.session_dates)
        ? ((row.collisions as Record<string, unknown>).session_dates as unknown[]).map(String)
        : [],
      weight_dates: Array.isArray((row.collisions as Record<string, unknown> | undefined)?.weight_dates)
        ? ((row.collisions as Record<string, unknown>).weight_dates as unknown[]).map(String)
        : [],
    },
  };
}

export async function listProvisionalDossiers(page?: {
  before?: string | null;
  beforeId?: string | null;
  limit?: number;
}): Promise<{ data: ProvisionalDossier[]; error: string | null }> {
  const { data, error } = await supabase.rpc('list_provisional_dossiers', {
    p_before: page?.before ?? null,
    p_before_id: page?.beforeId ?? null,
    p_limit: page?.limit ?? 50,
  });
  if (error) return { data: [], error: error.message };
  const rows = Array.isArray(data) ? data : [];
  return { data: rows.map(asDossier).filter((row): row is ProvisionalDossier => row !== null), error: null };
}

export async function createProvisionalDossier(
  displayName: string,
): Promise<{ data: ProvisionalDossier | null; error: string | null }> {
  const { data, error } = await supabase.rpc('create_provisional_dossier', {
    p_display_name: displayName,
  });
  if (error) return { data: null, error: error.message };
  return { data: asDossier(data), error: null };
}

export async function inviteProvisionalDossier(
  dossierId: string,
  email: string,
): Promise<{ token: string | null; email: string | null; error: string | null }> {
  const { data, error } = await supabase.rpc('invite_provisional_dossier', {
    p_dossier: dossierId,
    p_email: email,
  });
  if (error) return { token: null, email: null, error: error.message };
  const row = (data && typeof data === 'object') ? data as Record<string, unknown> : {};
  return {
    token: row.token ? String(row.token) : null,
    email: row.email ? String(row.email) : null,
    error: null,
  };
}

export async function revokeProvisionalInvite(dossierId: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('revoke_provisional_invite', { p_dossier: dossierId });
  return { error: error?.message ?? null };
}

export async function revokeProvisionalDossier(dossierId: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('revoke_provisional_dossier', { p_dossier: dossierId });
  return { error: error?.message ?? null };
}

export async function deleteProvisionalDossier(dossierId: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('delete_provisional_dossier', { p_dossier: dossierId });
  return { error: error?.message ?? null };
}

export async function previewProvisionalClaim(
  token: string,
): Promise<{ data: ProvisionalClaimPreview | null; error: string | null }> {
  const { data, error } = await supabase.rpc('preview_provisional_claim', { p_token: token });
  if (error) return { data: null, error: error.message };
  return { data: asClaim(data), error: null };
}

export async function confirmProvisionalClaim(input: {
  token: string;
  acceptData: boolean;
  acceptCoaching: boolean;
  revision: string | null;
  acknowledgeCollisions: boolean;
}): Promise<{ data: ProvisionalClaimPreview | null; error: string | null }> {
  const { data, error } = await supabase.rpc('confirm_provisional_claim', {
    p_token: input.token,
    p_accept_data: input.acceptData,
    p_accept_coaching: input.acceptCoaching,
    p_revision: input.revision,
    p_acknowledge_collisions: input.acknowledgeCollisions,
  });
  if (error) return { data: null, error: error.message };
  return { data: asClaim(data), error: null };
}

export async function previewProvisionalImport(input: {
  dossierId: string;
  filename: string;
  sourceText: string;
  mapping: ImportMapping;
  idempotencyKey: string;
}): Promise<{ data: CoachImportView | null; error: string | null }> {
  const { data, error } = await supabase.rpc('preview_provisional_import', {
    p_dossier: input.dossierId,
    p_filename: input.filename,
    p_source_text: input.sourceText,
    p_mapping: input.mapping,
    p_idempotency_key: input.idempotencyKey,
  });
  if (error) return { data: null, error: error.message };
  return { data: asCoachImportView(data), error: null };
}
