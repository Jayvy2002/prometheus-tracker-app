import { clientFileHref } from './coachSituation';
import type { AiPlanDraft, AiProgramDayDraft, CoachIntervention, CoachInterventionKind, ProgramExercisePatch } from './types';

/** Where the coach opened this draft from — drives the back link, not the 360. */
export type DraftOpenFrom = 'today' | 'messages' | 'ask';

export type { CoachIntervention, CoachInterventionKind };

export interface CalorieDraft {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

export interface ProgramOutlineDraft {
  name: string;
  description: string;
  duration_weeks: number;
  days: AiProgramDayDraft[];
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function asNumber(value: unknown, fallback = 0): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

export function parseProgramDays(value: unknown): AiProgramDayDraft[] {
  if (!Array.isArray(value)) return [];
  return value.map((raw, index) => {
    const row = asRecord(raw) ?? {};
    const exercisesRaw = Array.isArray(row.exercises) ? row.exercises : [];
    return {
      weekday: Math.min(6, Math.max(0, Math.round(asNumber(row.weekday, index % 7)))),
      name: asString(row.name, ''),
      exercises: exercisesRaw.map(exRaw => {
        const ex = asRecord(exRaw) ?? {};
        return {
          name: asString(ex.name, ''),
          default_sets: Math.max(1, Math.round(asNumber(ex.default_sets, 3))),
          default_reps: Math.max(1, Math.round(asNumber(ex.default_reps, 10))),
          default_reps_min: ex.default_reps_min == null ? null : Math.max(1, Math.round(asNumber(ex.default_reps_min, 0))) || null,
          default_rir: ex.default_rir == null || ex.default_rir === '' ? null : asNumber(ex.default_rir, 0),
          default_rest_seconds: ex.default_rest_seconds == null ? 90 : Math.max(0, Math.round(asNumber(ex.default_rest_seconds, 90))),
        };
      }),
    };
  });
}

export function parseProgramPatch(payload: unknown): ProgramExercisePatch | null {
  const root = asRecord(payload);
  if (!root) return null;
  const src = asRecord(root.patch) ?? root;
  const exercise = asString(src.exercise || src.name, '');
  if (!exercise) return null;
  if (
    src.default_sets == null
    && src.default_reps == null
    && src.default_reps_min == null
    && src.default_rir == null
    && src.replace_with == null
  ) {
    return null;
  }
  return {
    exercise,
    exercise_id: asString(src.exercise_id, '') || null,
    program_day_id: asString(src.program_day_id, '') || null,
    weekday: src.weekday == null ? null : Math.min(6, Math.max(0, Math.round(asNumber(src.weekday, 0)))),
    default_sets: src.default_sets == null ? undefined : Math.max(1, Math.round(asNumber(src.default_sets, 3))),
    default_reps: src.default_reps == null ? undefined : Math.max(1, Math.round(asNumber(src.default_reps, 10))),
    default_reps_min: src.default_reps_min == null ? null : Math.max(1, Math.round(asNumber(src.default_reps_min, 0))) || null,
    default_rir: src.default_rir == null ? null : asNumber(src.default_rir, 0),
    default_rest_seconds: src.default_rest_seconds == null ? undefined : Math.max(0, Math.round(asNumber(src.default_rest_seconds, 90))),
    replace_with: asString(src.replace_with, '') || undefined,
  };
}

export function parseProgramOutline(payload: unknown): ProgramOutlineDraft | null {
  const root = asRecord(payload);
  if (!root) return null;
  const nested = asRecord(root.program);
  const src = nested ?? root;
  const days = parseProgramDays(src.days);
  const name = asString(src.name, '');
  if (!name && days.length === 0) return null;
  return {
    name,
    description: asString(src.description, ''),
    duration_weeks: Math.min(52, Math.max(1, Math.round(asNumber(src.duration_weeks, 8)))),
    days,
  };
}

export function parseTrackingDraft(payload: unknown): AiPlanDraft['tracking'] | null {
  const root = asRecord(payload);
  if (!root) return null;
  const src = asRecord(root.tracking) ?? root;
  if (
    typeof src.track_weight !== 'boolean'
    && typeof src.track_checkins !== 'boolean'
    && typeof src.track_nutrition !== 'boolean'
    && typeof src.track_workouts !== 'boolean'
  ) {
    return null;
  }
  return {
    track_weight: !!src.track_weight,
    track_checkins: !!src.track_checkins,
    track_nutrition: !!src.track_nutrition,
    track_workouts: !!src.track_workouts,
    workout_focus: asString(src.workout_focus, ''),
  };
}

export function parseOnboardingPlanDraft(payload: unknown): AiPlanDraft | null {
  const program = parseProgramOutline(payload);
  const tracking = parseTrackingDraft(payload);
  if (!program && !tracking) return null;
  return {
    program: program ?? {
      name: '',
      description: '',
      duration_weeks: 8,
      days: [],
    },
    tracking: tracking ?? {
      track_weight: true,
      track_checkins: true,
      track_nutrition: true,
      track_workouts: true,
      workout_focus: '',
    },
  };
}

export function parseCalorieDraft(payload: unknown): CalorieDraft | null {
  const root = asRecord(payload);
  if (!root) return null;
  const src = asRecord(root.nutrition) ?? root;
  const calories = src.calories ?? src.suggested_calories;
  if (calories == null && src.protein == null && src.carbs == null && src.fat == null) {
    return null;
  }
  return {
    calories: Math.round(asNumber(calories, 0)),
    protein: Math.round(asNumber(src.protein, 0)),
    carbs: Math.round(asNumber(src.carbs, 0)),
    fat: Math.round(asNumber(src.fat, 0)),
  };
}

export function isCompleteCalorieDraft(draft: CalorieDraft | null | undefined): boolean {
  if (!draft) return false;
  if (draft.calories < 800 || draft.calories > 8000) return false;
  if (draft.protein <= 0 || draft.carbs <= 0 || draft.fat <= 0) return false;
  const fromMacros = draft.protein * 4 + draft.carbs * 4 + draft.fat * 9;
  return Math.abs(fromMacros - draft.calories) <= draft.calories * 0.15;
}

export function parseTalkingPoints(payload: unknown, fallback = ''): string {
  const root = asRecord(payload);
  if (!root) return fallback;
  if (typeof root.notes === 'string' && root.notes.trim()) return root.notes;
  if (typeof root.body === 'string' && root.body.trim()) return root.body;
  if (Array.isArray(root.talking_points)) {
    return root.talking_points
      .map(p => (typeof p === 'string' ? p.trim() : ''))
      .filter(Boolean)
      .join('\n');
  }
  return fallback;
}

/** Client-file drafts only — app-wide cards (Ask Prometheus without a client) stay in Messages. */
export function isClientBoundDraft(row: Pick<CoachIntervention, 'kind' | 'client_id'>): boolean {
  return !!row.client_id;
}

export function parseDraftFrom(value: string | null | undefined): DraftOpenFrom | null {
  if (value === 'today' || value === 'messages' || value === 'ask') return value;
  return null;
}

export function withDraftFrom(href: string, from?: DraftOpenFrom | null): string {
  if (!from) return href;
  const join = href.includes('?') ? '&' : '?';
  return `${href}${join}from=${from}`;
}

export function interventionHref(
  row: Pick<CoachIntervention, 'kind' | 'client_id' | 'id'>,
  opts?: { from?: DraftOpenFrom | null },
): string {
  let href: string;
  if (row.kind === 'onboarding_plan' && row.client_id) {
    href = `/clients/${row.client_id}/setup?draft=${row.id}`;
  } else if (row.client_id) {
    href = `/clients/${row.client_id}/draft/${row.id}`;
  } else {
    href = `/inbox/${row.id}`;
  }
  return withDraftFrom(href, opts?.from);
}

/** Href to the draft editor, or null when there is nothing to open. */
export function openDraftHref(
  row: Pick<CoachIntervention, 'kind' | 'client_id' | 'id'> | null | undefined,
  opts?: { from?: DraftOpenFrom | null },
): string | null {
  if (!row?.id) return null;
  return interventionHref(row, opts);
}

export type DraftBackKind = DraftOpenFrom | 'client';

export function draftBackTarget(input: {
  from?: string | null;
  clientId: string | null;
}): { href: string; kind: DraftBackKind } {
  const from = parseDraftFrom(input.from);
  if (from === 'today') return { href: '/dashboard', kind: 'today' };
  if (from === 'messages') {
    return {
      href: input.clientId ? `/messages/${input.clientId}` : '/messages',
      kind: 'messages',
    };
  }
  if (from === 'ask') return { href: '/prometheus', kind: 'ask' };
  if (input.clientId) return { href: clientFileHref(input.clientId), kind: 'client' };
  return { href: '/messages', kind: 'messages' };
}

/** Always the draft editor — incomplete kcal still opens the 4 ISSN fields. */
export function coachingPassHref(
  row: Pick<CoachIntervention, 'kind' | 'client_id' | 'id' | 'payload'>,
  opts?: { from?: DraftOpenFrom | null },
): string {
  return interventionHref(row, opts);
}

const KINDS: CoachInterventionKind[] = [
  'onboarding_plan',
  'calorie_adjustment',
  'program_adjustment',
  'adherence_nutrition',
  'adherence_training',
  'keep_in_touch',
  'other',
  'ask_prometheus',
  'program_nl_edit',
];

export function isCoachInterventionKind(value: string): value is CoachInterventionKind {
  return KINDS.includes(value as CoachInterventionKind);
}

export function mapInterventionRow(raw: Record<string, unknown>): CoachIntervention | null {
  const kind = typeof raw.kind === 'string' ? raw.kind : '';
  if (!isCoachInterventionKind(kind)) return null;
  const payload = raw.payload && typeof raw.payload === 'object' && !Array.isArray(raw.payload)
    ? raw.payload as Record<string, unknown>
    : {};
  const status = raw.status === 'sent' || raw.status === 'dismissed' || raw.status === 'kept'
    ? raw.status
    : raw.status === 'approved' ? 'sent' : 'pending';
  return {
    id: String(raw.id ?? ''),
    coach_id: String(raw.coach_id ?? ''),
    client_id: typeof raw.client_id === 'string' ? raw.client_id : null,
    kind,
    title: typeof raw.title === 'string' ? raw.title : null,
    rationale: typeof raw.rationale === 'string' ? raw.rationale : '',
    payload,
    status,
    source: typeof raw.source === 'string' ? raw.source : 'second',
    created_at: String(raw.created_at ?? ''),
    updated_at: String(raw.updated_at ?? ''),
    resolved_at: typeof raw.resolved_at === 'string' ? raw.resolved_at : null,
  };
}

export function payloadSummary(row: CoachIntervention): string {
  if (row.payload?.drafting === true) return '';
  if (typeof row.payload?.error === 'string' && row.payload.error) return '';
  if (typeof row.payload?.observation === 'string' && row.payload.observation.trim()) {
    return row.payload.observation.split('\n')[0] ?? '';
  }
  if (row.kind === 'calorie_adjustment') {
    const cals = parseCalorieDraft(row.payload);
    if (!cals) return row.title || '';
    if (!isCompleteCalorieDraft(cals)) return row.title || '';
    return `${cals.calories} kcal · P${cals.protein} C${cals.carbs} F${cals.fat}`;
  }
  const outline = parseProgramOutline(row.payload);
  if (outline) {
    const lifts = outline.days.reduce((n, d) => n + d.exercises.length, 0);
    return `${outline.name || '—'} · ${outline.days.length}d · ${lifts} ex`;
  }
  const points = parseTalkingPoints(row.payload);
  if (points) return points.split('\n')[0] ?? '';
  return row.title || '';
}
