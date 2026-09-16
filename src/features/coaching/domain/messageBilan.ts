/** UX27 — lien visible séance / check-in sur un message, pas une 2ᵉ inbox.
 *  UX32 — carte résumé → fiche / recap (pas un logger dans le chat). */

import { checkinFocusHref } from './coachCheckins';
import { trainingSessionHref } from './coachTraining';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const BILAN_WORKOUT_PARAM = 'workout';
export const BILAN_CHECKIN_PARAM = 'checkin';
export const ATHLETE_CHECKIN_QUERY = 'id';

export type BilanViewer = 'coach' | 'athlete';

export type MessageBilanRef = {
  workoutId: string | null;
  checkinId: string | null;
};

export type MessageBilanLabel = {
  kind: 'workout' | 'checkin';
  date: string;
  name: string;
};

export function parseBilanUuid(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? '';
  if (!UUID_RE.test(trimmed)) return null;
  return trimmed.toLowerCase();
}

export function normalizeBilanRef(
  input?: { workoutId?: string | null; checkinId?: string | null } | null,
): MessageBilanRef {
  const workoutId = parseBilanUuid(input?.workoutId ?? null);
  const checkinId = workoutId ? null : parseBilanUuid(input?.checkinId ?? null);
  return { workoutId, checkinId };
}

export function parseBilanQuery(search: { get: (key: string) => string | null }): MessageBilanRef {
  return normalizeBilanRef({
    workoutId: search.get(BILAN_WORKOUT_PARAM),
    checkinId: search.get(BILAN_CHECKIN_PARAM),
  });
}

export function appendBilanSearch(params: URLSearchParams, ref: MessageBilanRef): void {
  const next = normalizeBilanRef(ref);
  if (next.workoutId) params.set(BILAN_WORKOUT_PARAM, next.workoutId);
  if (next.checkinId) params.set(BILAN_CHECKIN_PARAM, next.checkinId);
}

export function hasBilan(ref: MessageBilanRef): boolean {
  return Boolean(ref.workoutId || ref.checkinId);
}

export function formatBilanDate(iso: string, locale: string): string {
  const day = iso.slice(0, 10);
  const parsed = new Date(`${day}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return day;
  return parsed.toLocaleDateString(locale, { day: 'numeric', month: 'short' }).replace(/\.$/, '');
}

export function bilanInsertFields(ref: MessageBilanRef): {
  workout_id: string | null;
  checkin_id: string | null;
} {
  const next = normalizeBilanRef(ref);
  return { workout_id: next.workoutId, checkin_id: next.checkinId };
}

export function bilanViewerFor(
  currentUserId: string,
  message: { coach_id: string; client_id: string },
): BilanViewer | null {
  if (!currentUserId) return null;
  if (currentUserId === message.coach_id) return 'coach';
  if (currentUserId === message.client_id) return 'athlete';
  return null;
}

export function athleteWorkoutHref(workoutId: string | null | undefined): string | null {
  const id = parseBilanUuid(workoutId);
  return id ? `/workout/${id}` : null;
}

export function athleteCheckinHref(checkinId: string | null | undefined): string | null {
  const id = parseBilanUuid(checkinId);
  return id ? `/checkin?${ATHLETE_CHECKIN_QUERY}=${id}` : null;
}

export function parseAthleteCheckinQuery(search: { get: (key: string) => string | null }): string | null {
  return parseBilanUuid(search.get(ATHLETE_CHECKIN_QUERY));
}

export function bilanOpenHref(input: {
  viewer: BilanViewer | null;
  clientId: string;
  workoutId?: string | null;
  checkinId?: string | null;
}): string | null {
  if (!input.viewer) return null;
  const ref = normalizeBilanRef(input);
  if (ref.workoutId) {
    return input.viewer === 'coach'
      ? trainingSessionHref(input.clientId, ref.workoutId)
      : athleteWorkoutHref(ref.workoutId);
  }
  if (ref.checkinId) {
    return input.viewer === 'coach'
      ? checkinFocusHref(input.clientId, ref.checkinId)
      : athleteCheckinHref(ref.checkinId);
  }
  return null;
}
