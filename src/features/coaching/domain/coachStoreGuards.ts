import {
  ALL_OFF_TRACKING,
  ALL_ON_TRACKING,
  parseResolvedTracking,
  type ResolvedTrackingConfig,
} from '../../../lib/clientTracking';
import type { CoachingRole } from '../../../lib/types';

export function cloneTracking(src: ResolvedTrackingConfig): ResolvedTrackingConfig {
  return {
    ...src,
    training: { ...src.training },
    nutrition: { ...src.nutrition },
    checkin: { ...src.checkin },
  };
}

export function parseRememberedCoachingRole(raw: string | null | undefined): CoachingRole | null {
  return raw === 'coach' || raw === 'client' || raw === 'none' ? raw : null;
}

/** Reload + network blip must not fail-open to none when we already knew the seat. */
export function previousRoleForFetch(
  current: CoachingRole,
  remembered: CoachingRole | null,
): CoachingRole {
  if (current !== 'none') return current;
  return remembered ?? 'none';
}

export function nextRoleAfterFetch(input: {
  previous: CoachingRole;
  data: { coaching_role?: string | null } | null;
  error: { message: string } | null;
}): { role: CoachingRole; error: string | null } {
  if (input.error) {
    return { role: input.previous, error: input.error.message };
  }
  const raw = input.data?.coaching_role;
  const role: CoachingRole = raw === 'coach' || raw === 'client' || raw === 'none' ? raw : 'none';
  return { role, error: null };
}

/** Coached athlete: unknown/off until a row exists. Solo: full tracker. Coach editors use parseResolvedTracking. */
export function viewerTrackingAfterFetch(input: {
  isCoached: boolean;
  row: unknown;
  fetchError: boolean;
}): { tracking: ResolvedTrackingConfig; ready: boolean } {
  if (!input.isCoached) {
    return { tracking: cloneTracking(ALL_ON_TRACKING), ready: true };
  }
  if (input.fetchError || input.row == null) {
    return { tracking: cloneTracking(ALL_OFF_TRACKING), ready: true };
  }
  return { tracking: parseResolvedTracking(input.row), ready: true };
}

export function opsHasPartialError(results: Array<{ error?: { message: string } | null }>): string | null {
  const first = results.find(r => r.error);
  return first?.error?.message ?? null;
}

/** Inbox kcal is never a one-tap apply. Relancer may still send. */
export function inboxPrimaryIsSend(kind: string): boolean {
  return kind === 'adherence_training' || kind === 'adherence_nutrition' || kind === 'keep_in_touch';
}
