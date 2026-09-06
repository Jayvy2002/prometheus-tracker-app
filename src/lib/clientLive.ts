import type { CoachMessage, UserProfile } from './types';

export function mergeMessageRealtime(
  current: CoachMessage[],
  event: 'INSERT' | 'UPDATE' | 'DELETE' | string,
  row: CoachMessage | null,
): CoachMessage[] {
  if (!row) return current;
  if (event === 'DELETE') return current.filter(m => m.id !== row.id);
  const index = current.findIndex(m => m.id === row.id);
  if (index < 0) {
    return [row, ...current].sort((a, b) => b.created_at.localeCompare(a.created_at));
  }
  const next = [...current];
  next[index] = row;
  return next.sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export function liveMessageState(
  current: CoachMessage[],
  event: string,
  row: CoachMessage | null,
  viewerId: string,
): {
  sentMessages: CoachMessage[];
  unreadMessageCount: number;
  latestCoachMessage: CoachMessage | null;
} {
  const sentMessages = mergeMessageRealtime(current, event, row);
  const unread = sentMessages.filter(m => m.sender_id !== viewerId && !m.read_at);
  return {
    sentMessages,
    unreadMessageCount: unread.length,
    latestCoachMessage: unread[0] ?? null,
  };
}

/** Any postgres_changes on the client's assignment row means refetch the assigned program. */
export function shouldRefreshClientAssignment(
  event: string,
  row: Record<string, unknown> | null | undefined,
  clientId: string,
): boolean {
  if (event === 'DELETE') {
    if (!row) return true;
    const id = String(row.client_id ?? '');
    return !id || id === clientId;
  }
  if (!row) return false;
  return String(row.client_id ?? '') === clientId;
}

function asPositiveInt(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.round(value);
  if (typeof value === 'string' && value.trim()) {
    const n = Number(value);
    return Number.isFinite(n) ? Math.round(n) : null;
  }
  return null;
}

export type LiveNutritionTargets = Pick<
  UserProfile,
  'daily_calorie_target' | 'protein_target' | 'carbs_target' | 'fat_target'
>;

/** Pull ISSN/coach-confirmed macros from a user_profiles Realtime row. No invented columns. */
export function nutritionTargetsFromProfileRow(raw: Record<string, unknown> | null | undefined): LiveNutritionTargets | null {
  if (!raw) return null;
  const calories = asPositiveInt(raw.daily_calorie_target);
  const protein = asPositiveInt(raw.protein_target);
  const carbs = asPositiveInt(raw.carbs_target);
  const fat = asPositiveInt(raw.fat_target);
  if (calories == null || protein == null || carbs == null || fat == null) return null;
  return {
    daily_calorie_target: calories,
    protein_target: protein,
    carbs_target: carbs,
    fat_target: fat,
  };
}

/** program_days / program_day_exercises have no client_id — RLS scopes the payload. */
export function shouldRefreshClientProgramContent(event: string): boolean {
  return event === 'INSERT' || event === 'UPDATE' || event === 'DELETE';
}

export function shouldRefreshProgressPhotos(
  event: string,
  row: Record<string, unknown> | null | undefined,
  userId: string,
): boolean {
  if (event === 'DELETE') {
    if (!row) return true;
    const id = String(row.user_id ?? '');
    return !id || id === userId;
  }
  if (!row) return false;
  return String(row.user_id ?? '') === userId;
}

export function applyNutritionTargets(
  profile: UserProfile | null,
  userId: string,
  targets: LiveNutritionTargets,
): UserProfile | null {
  if (!profile || profile.id !== userId) return profile;
  return { ...profile, ...targets };
}
