/**
 * Coached → solo transition (docs/VISION.md point 4).
 * When a coach ends the link, end_coach_client_link hands the account back to solo and stamps
 * user_profiles.coach_link_ended_at / solo_trial_ends_at. These helpers decide what the solo home
 * says about it. Pure — no Supabase.
 */

export const SOLO_TRIAL_DAYS = 30;

export interface LinkEndedNotice {
  show: boolean;
  endedAt: string | null;
  /** Whole days left in the solo trial; null when no trial is recorded. */
  trialDaysLeft: number | null;
  trialExpired: boolean;
}

function parseIso(value: string | null | undefined): number | null {
  if (!value) return null;
  const t = Date.parse(value);
  return Number.isFinite(t) ? t : null;
}

export function linkEndedNotice(input: {
  profile: { coach_link_ended_at?: string | null; solo_trial_ends_at?: string | null } | null | undefined;
  hasCoach: boolean;
  ackedEndedAt: string | null;
  now?: Date;
}): LinkEndedNotice {
  const endedAt = input.profile?.coach_link_ended_at ?? null;
  const now = input.now ?? new Date();
  const trialEnd = parseIso(input.profile?.solo_trial_ends_at);
  const trialDaysLeft = trialEnd == null
    ? null
    : Math.max(0, Math.ceil((trialEnd - now.getTime()) / 86_400_000));
  const trialExpired = trialEnd != null && trialEnd <= now.getTime();
  // A new coach clears the situation; an acknowledged notice stays hidden until the next unlink.
  const show = !!endedAt && !input.hasCoach && input.ackedEndedAt !== endedAt;
  return { show, endedAt, trialDaysLeft, trialExpired };
}

export function linkEndedAckKey(userId: string): string {
  return `prometheus_link_ended_ack:${userId}`;
}

/** user_profiles Realtime: the unlink lands as a coach_link_ended_at change → reload role + coach. */
export function profileLinkEndedChanged(
  previous: { coach_link_ended_at?: string | null } | null | undefined,
  raw: Record<string, unknown> | null | undefined,
): boolean {
  if (!raw || !('coach_link_ended_at' in raw)) return false;
  const next = typeof raw.coach_link_ended_at === 'string' ? raw.coach_link_ended_at : null;
  const prev = previous?.coach_link_ended_at ?? null;
  return !!next && next !== prev;
}
