import { datePrefix } from './coachText';
import { RECENT_SESSION_DAYS } from './coachTraining';
import { addDaysToDateStr } from './utils';
import type { ClientLiftProgress, CoachNudgeTemplateKey } from './types';

export const OVERVIEW_TAB = 'overview';

export function clientFileHref(clientId: string): string {
  return `/clients/${clientId}?tab=${OVERVIEW_TAB}`;
}

export function daysBetween(from: string, today: string): number {
  const start = datePrefix(from);
  const end = datePrefix(today);
  let n = 0;
  let cursor = start;
  while (cursor < end && n < 4000) {
    cursor = addDaysToDateStr(cursor, 1);
    n += 1;
  }
  return n;
}

export function lastLoggedSessionDate(
  workouts: Array<{ date: string; completed?: boolean }>,
  lifts: ClientLiftProgress[],
): string | null {
  let best: string | null = null;
  for (const w of workouts) {
    if (w.completed === false) continue;
    const d = datePrefix(w.date);
    if (!best || d > best) best = d;
  }
  for (const lift of lifts) {
    for (const session of lift.sessions) {
      const d = datePrefix(session.date);
      if (!best || d > best) best = d;
    }
  }
  return best;
}

export function lastCheckinDate(checkins: Array<{ checked_at: string }>): string | null {
  let best: string | null = null;
  for (const c of checkins) {
    const d = datePrefix(c.checked_at);
    if (!best || d > best) best = d;
  }
  return best;
}

export type ClientSituationId = 'no_program' | 'no_session' | 'idle_session';

export interface ClientSituationLine {
  id: ClientSituationId;
  messageKey: string;
  days?: number;
  relance: boolean;
  templateKey: CoachNudgeTemplateKey | null;
}

const IDLE_SESSION_MIN_DAYS = RECENT_SESSION_DAYS;

export function clientSituationLines(input: {
  hasProgram: boolean;
  lastSessionDate: string | null;
  today: string;
  trackWorkouts?: boolean;
}): ClientSituationLine[] {
  const lines: ClientSituationLine[] = [];
  if (!input.hasProgram) {
    lines.push({
      id: 'no_program',
      messageKey: 'coaching.situation.noProgram',
      relance: false,
      templateKey: null,
    });
  }

  if (input.trackWorkouts === false) return lines;

  if (!input.lastSessionDate) {
    lines.push({
      id: 'no_session',
      messageKey: 'coaching.situation.noSession',
      relance: true,
      templateKey: 'missed_training',
    });
    return lines;
  }

  const days = daysBetween(input.lastSessionDate, input.today);
  if (days > IDLE_SESSION_MIN_DAYS) {
    lines.push({
      id: 'idle_session',
      messageKey: 'coaching.situation.idleSession',
      days,
      relance: true,
      templateKey: 'missed_training',
    });
  }
  return lines;
}

export function hasSessionGap(lines: ClientSituationLine[]): boolean {
  return lines.some(l => l.id === 'no_session' || l.id === 'idle_session');
}
