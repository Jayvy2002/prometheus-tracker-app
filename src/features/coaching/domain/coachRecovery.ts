import {
  HIGH_HUNGER_ON_TEN,
  HIGH_STRESS_ON_TEN,
  LOW_MOOD_ON_TEN,
  LOW_SLEEP_QUALITY_ON_TEN,
  PAIN_CONCERN_ON_TEN,
  PAIN_WATCH_ON_TEN,
  formatCheckinScore,
  isLegacyFiveScaleCheckin,
  scoreOnTen,
} from '../../../lib/checkinScale';
import { relanceThreadHref } from './coachQueue';
import { datePrefix } from './coachText';
import { addDaysToDateStr } from '../../../lib/utils';
import type {
  CoachClientTab,
  CoachPriority,
  DailyCheckin,
  RecoverySnapshot,
} from '../../../lib/types';

export const HEALTH_TAB: CoachClientTab = 'health';
export const RECOVERY_TAB_ALIAS = 'recovery';
export const CHECKIN_QUERY_PARAM = 'checkin';

/** Ghost / stale check-ins → empty + Relancer, not leftover pain/sleep. */
export const RECENT_RECOVERY_DAYS = 7;
export const LOW_SLEEP_HOURS = 6;
/** @deprecated Use LOW_SLEEP_QUALITY_ON_TEN; kept as the old 1–5 cutoff for tests. */
export const LOW_SLEEP_QUALITY = 2;
/** @deprecated Use PAIN_WATCH_ON_TEN; kept as the old 1–5 cutoff for tests. */
export const PAIN_WATCH = 3;

const CLIENT_TABS: CoachClientTab[] = [
  'overview',
  'profile',
  'training',
  'progress',
  'checkins',
  'health',
  'notes',
];

function parseCheckinId(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 80 || /\s/.test(trimmed)) return null;
  return trimmed;
}

export function parseClientTab(raw: string | null | undefined): CoachClientTab | null {
  if (raw === RECOVERY_TAB_ALIAS || raw === HEALTH_TAB) return HEALTH_TAB;
  if (raw && (CLIENT_TABS as string[]).includes(raw)) return raw as CoachClientTab;
  return null;
}

export function resolveClientTab(raw: string | null | undefined, checkinId?: string | null): CoachClientTab {
  const parsed = parseClientTab(raw);
  if (parsed === 'profile') return 'overview';
  if (parsed) return parsed;
  if (checkinId && !raw) return 'checkins';
  return 'overview';
}

export { clientFileHref, OVERVIEW_TAB } from './coachSituation';

export function recoveryFocusHref(clientId: string, checkinId?: string | null): string {
  const params = new URLSearchParams({ tab: HEALTH_TAB });
  const id = parseCheckinId(checkinId);
  if (id) params.set(CHECKIN_QUERY_PARAM, id);
  return `/clients/${clientId}?${params.toString()}`;
}

export function isRecoveryHref(href: string): boolean {
  const query = href.split('?')[1];
  if (!query) return false;
  const tab = new URLSearchParams(query).get('tab');
  return tab === HEALTH_TAB || tab === RECOVERY_TAB_ALIAS;
}

export function isRecentCheckin(
  checkin: DailyCheckin,
  today: string,
  days = RECENT_RECOVERY_DAYS,
): boolean {
  const day = datePrefix(checkin.checked_at);
  const start = addDaysToDateStr(today, -days);
  return day >= start;
}

export function sortedCheckins(checkins: DailyCheckin[]): DailyCheckin[] {
  return [...checkins].sort(
    (a, b) => b.checked_at.localeCompare(a.checked_at) || b.created_at.localeCompare(a.created_at),
  );
}

export function isPainFlag(latest: DailyCheckin, prev?: DailyCheckin | null): boolean {
  const pain10 = scoreOnTen(latest.joint_pain, isLegacyFiveScaleCheckin(latest));
  if (pain10 == null) return false;
  if (pain10 >= PAIN_WATCH_ON_TEN) return true;
  if (prev?.joint_pain == null) return false;
  const prev10 = scoreOnTen(prev.joint_pain, isLegacyFiveScaleCheckin(prev));
  return prev10 != null && pain10 > prev10 && pain10 >= PAIN_WATCH_ON_TEN;
}

export function isLowSleep(checkin: DailyCheckin): boolean {
  if (checkin.sleep_hours != null && checkin.sleep_hours < LOW_SLEEP_HOURS) return true;
  const quality10 = scoreOnTen(checkin.sleep_quality, isLegacyFiveScaleCheckin(checkin));
  if (quality10 != null && quality10 <= LOW_SLEEP_QUALITY_ON_TEN) return true;
  return false;
}

export function canAskRecoveryAdjust(snapshot: RecoverySnapshot): boolean {
  const pain10 = scoreOnTen(snapshot.pain, isLegacyFiveScaleCheckin(snapshot.checkin));
  return pain10 != null && pain10 >= PAIN_WATCH_ON_TEN;
}

function numericSeries(
  rows: DailyCheckin[],
  key: 'sleep_hours' | 'joint_pain' | 'energy_level' | 'hunger' | 'mood' | 'stress',
): number[] {
  return rows
    .map(c => c[key])
    .filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
}

function viewFromCheckin(checkin: DailyCheckin, trendSource: DailyCheckin[]): RecoverySnapshot {
  const chronological = [...trendSource].sort(
    (a, b) => a.checked_at.localeCompare(b.checked_at) || a.created_at.localeCompare(b.created_at),
  );
  return {
    checkin,
    sleepHours: checkin.sleep_hours,
    sleepQuality: checkin.sleep_quality,
    pain: checkin.joint_pain,
    soreness: checkin.muscle_soreness,
    energy: checkin.energy_level,
    hunger: checkin.hunger,
    mood: checkin.mood,
    stress: checkin.stress,
    notes: (checkin.notes || '').trim(),
    trend: {
      sleepHours: numericSeries(chronological, 'sleep_hours'),
      pain: numericSeries(chronological, 'joint_pain'),
      energy: numericSeries(chronological, 'energy_level'),
      hunger: numericSeries(chronological, 'hunger'),
      mood: numericSeries(chronological, 'mood'),
      stress: numericSeries(chronological, 'stress'),
    },
  };
}

/** Latest recovery snapshot from existing check-in fields. Stale / missing → empty. */
export function recoverySnapshot(
  checkins: DailyCheckin[],
  opts?: { checkinId?: string | null; today?: string; recentDays?: number },
): RecoverySnapshot | null {
  const sorted = sortedCheckins(checkins);
  if (sorted.length === 0) return null;

  const requested = parseCheckinId(opts?.checkinId ?? null);
  if (requested) {
    const hit = sorted.find(c => c.id === requested) ?? null;
    if (!hit) return viewFromCheckin(sorted[0], sorted.slice(0, 7));
    return viewFromCheckin(hit, sorted.slice(0, 7));
  }

  const latest = sorted[0];
  if (opts?.today && !isRecentCheckin(latest, opts.today, opts.recentDays)) return null;
  return viewFromCheckin(latest, sorted.filter(c => (
    !opts?.today || isRecentCheckin(c, opts.today, opts.recentDays)
  )).slice(0, 7));
}

export function recoveryContextPayload(snapshot: RecoverySnapshot): Record<string, unknown> {
  return {
    checkin_id: snapshot.checkin.id,
    date: datePrefix(snapshot.checkin.checked_at),
    sleep_hours: snapshot.sleepHours,
    sleep_quality: snapshot.sleepQuality,
    joint_pain: snapshot.pain,
    muscle_soreness: snapshot.soreness,
    energy_level: snapshot.energy,
    hunger: snapshot.hunger,
    mood: snapshot.mood,
    stress: snapshot.stress,
    notes: snapshot.notes || null,
  };
}

function scorePriority(
  kind: 'high_stress' | 'low_mood' | 'high_hunger',
  clientId: string,
  name: string,
  avatar: string,
  latest: DailyCheckin,
  value: number,
): CoachPriority {
  const shown = formatCheckinScore(value, latest);
  return {
    id: `${clientId}-${kind}`,
    clientId,
    clientName: name,
    avatarUrl: avatar,
    kind,
    severity: kind === 'high_hunger' ? 'yellow' : 'orange',
    headlineKey: `coaching.priority.headlines.${kind}`,
    headlineParams: { name, n: shown },
    detailKey: `coaching.priority.details.${kind}`,
    detailParams: { n: shown },
    href: recoveryFocusHref(clientId, latest.id),
    checkinId: latest.id,
  };
}

export function highStressPriority(
  clientId: string,
  name: string,
  avatar: string,
  latest: DailyCheckin,
  today: string,
): CoachPriority | null {
  if (!isRecentCheckin(latest, today)) return null;
  const n = scoreOnTen(latest.stress, isLegacyFiveScaleCheckin(latest));
  if (n == null || n < HIGH_STRESS_ON_TEN) return null;
  return scorePriority('high_stress', clientId, name, avatar, latest, latest.stress as number);
}

export function lowMoodPriority(
  clientId: string,
  name: string,
  avatar: string,
  latest: DailyCheckin,
  today: string,
): CoachPriority | null {
  if (!isRecentCheckin(latest, today)) return null;
  const n = scoreOnTen(latest.mood, isLegacyFiveScaleCheckin(latest));
  if (n == null || n > LOW_MOOD_ON_TEN) return null;
  return scorePriority('low_mood', clientId, name, avatar, latest, latest.mood as number);
}

export function highHungerPriority(
  clientId: string,
  name: string,
  avatar: string,
  latest: DailyCheckin,
  today: string,
): CoachPriority | null {
  if (!isRecentCheckin(latest, today)) return null;
  const n = scoreOnTen(latest.hunger, isLegacyFiveScaleCheckin(latest));
  if (n == null || n < HIGH_HUNGER_ON_TEN) return null;
  return scorePriority('high_hunger', clientId, name, avatar, latest, latest.hunger as number);
}

export function relanceHrefForRecovery(clientId: string, hasSnapshot: boolean): string {
  return relanceThreadHref(clientId, hasSnapshot ? 'general_followup' : 'missed_checkins');
}

export function painPriority(
  clientId: string,
  name: string,
  avatar: string,
  latest: DailyCheckin,
  prev: DailyCheckin | null,
  today: string,
): CoachPriority | null {
  if (!isRecentCheckin(latest, today)) return null;
  if (!isPainFlag(latest, prev)) return null;
  const pain = latest.joint_pain as number;
  const pain10 = scoreOnTen(pain, isLegacyFiveScaleCheckin(latest)) ?? 0;
  const prev10 = prev?.joint_pain != null
    ? scoreOnTen(prev.joint_pain, isLegacyFiveScaleCheckin(prev))
    : null;
  const jumped = prev10 != null && pain10 >= PAIN_WATCH_ON_TEN && pain10 > prev10;
  const red = pain10 >= PAIN_CONCERN_ON_TEN || jumped;
  return {
    id: `${clientId}-pain`,
    clientId,
    clientName: name,
    avatarUrl: avatar,
    kind: 'new_pain',
    severity: red ? 'red' : 'orange',
    headlineKey: 'coaching.priority.headlines.new_pain',
    headlineParams: { name, n: formatCheckinScore(pain, latest) },
    detailKey: 'coaching.priority.details.new_pain',
    detailParams: {
      n: formatCheckinScore(pain, latest),
      prev: prev?.joint_pain != null ? formatCheckinScore(prev.joint_pain, prev) : '—',
    },
    href: recoveryFocusHref(clientId, latest.id),
    checkinId: latest.id,
  };
}

export function lowSleepPriority(
  clientId: string,
  name: string,
  avatar: string,
  latest: DailyCheckin,
  today: string,
): CoachPriority | null {
  if (!isRecentCheckin(latest, today)) return null;
  if (!isLowSleep(latest)) return null;
  const hours = latest.sleep_hours;
  const quality = latest.sleep_quality;
  const orange = hours != null && hours < 5;
  return {
    id: `${clientId}-sleep`,
    clientId,
    clientName: name,
    avatarUrl: avatar,
    kind: 'low_sleep',
    severity: orange ? 'orange' : 'yellow',
    headlineKey: 'coaching.priority.headlines.low_sleep',
    headlineParams: { name },
    detailKey: 'coaching.priority.details.low_sleep',
    detailParams: {
      hours: hours ?? '—',
      quality: quality != null ? formatCheckinScore(quality, latest) : '—',
    },
    href: recoveryFocusHref(clientId, latest.id),
    checkinId: latest.id,
  };
}
