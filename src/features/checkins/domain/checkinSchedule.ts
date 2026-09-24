import type { CheckinFrequency } from './checkinTemplate';

/**
 * Vision §11.2 — when a check-in is expected. Dates are civil dates
 * (YYYY-MM-DD) in the athlete's calendar. A missing check-in is not bad
 * adherence: these helpers only say when one is expected.
 */

export interface ScheduleInput {
  frequency: CheckinFrequency;
  /** 0 = Sunday … 6 = Saturday (weekly, biweekly). */
  weekday: number | null;
  /** When this rhythm started. */
  anchor_date: string;
}

function parse(date: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function fmt(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(date: string, days: number): string {
  const d = parse(date);
  d.setUTCDate(d.getUTCDate() + days);
  return fmt(d);
}

function daysBetween(a: string, b: string): number {
  return Math.round((parse(b).getTime() - parse(a).getTime()) / 86_400_000);
}

/** Days in one period of the rhythm. */
export function periodDays(frequency: CheckinFrequency): number {
  switch (frequency) {
    case 'daily': return 1;
    case 'weekly': return 7;
    case 'biweekly': return 14;
    case 'monthly': return 31;
  }
}

function monthlyDate(anchor: string, year: number, month: number): string {
  const day = parse(anchor).getUTCDate();
  const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return fmt(new Date(Date.UTC(year, month, Math.min(day, last))));
}

/** The most recent expected date on or before `today` (null before the first one). */
export function lastDueDate(plan: ScheduleInput, today: string): string | null {
  if (daysBetween(plan.anchor_date, today) < 0) return null;
  switch (plan.frequency) {
    case 'daily':
      return today;
    case 'weekly':
    case 'biweekly': {
      const weekday = plan.weekday ?? parse(plan.anchor_date).getUTCDay();
      // First matching weekday on or after the anchor.
      const first = addDays(plan.anchor_date, (weekday - parse(plan.anchor_date).getUTCDay() + 7) % 7);
      const since = daysBetween(first, today);
      if (since < 0) return null;
      const step = plan.frequency === 'weekly' ? 7 : 14;
      return addDays(first, Math.floor(since / step) * step);
    }
    case 'monthly': {
      const t = parse(today);
      const thisMonth = monthlyDate(plan.anchor_date, t.getUTCFullYear(), t.getUTCMonth());
      if (daysBetween(thisMonth, today) >= 0) return thisMonth;
      const prev = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() - 1, 1));
      const prevDate = monthlyDate(plan.anchor_date, prev.getUTCFullYear(), prev.getUTCMonth());
      return daysBetween(plan.anchor_date, prevDate) >= 0 ? prevDate : null;
    }
  }
}

/** The next expected date strictly after `today`. */
export function nextDueDate(plan: ScheduleInput, today: string): string {
  switch (plan.frequency) {
    case 'daily':
      return addDays(today, 1);
    case 'weekly':
    case 'biweekly': {
      const step = plan.frequency === 'weekly' ? 7 : 14;
      const last = lastDueDate(plan, today);
      if (last) return addDays(last, step);
      const weekday = plan.weekday ?? parse(plan.anchor_date).getUTCDay();
      const from = daysBetween(plan.anchor_date, today) < 0 ? plan.anchor_date : today;
      const offset = (weekday - parse(from).getUTCDay() + 7) % 7;
      return addDays(from, offset === 0 && from === today ? 7 : offset);
    }
    case 'monthly': {
      const t = parse(today);
      const thisMonth = monthlyDate(plan.anchor_date, t.getUTCFullYear(), t.getUTCMonth());
      if (daysBetween(today, thisMonth) > 0 && daysBetween(plan.anchor_date, thisMonth) >= 0) return thisMonth;
      const next = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 1));
      return monthlyDate(plan.anchor_date, next.getUTCFullYear(), next.getUTCMonth());
    }
  }
}

/**
 * A check-in is due when an expected date has passed (or is today) and no
 * check-in was made since that date. The latest check-in date is enough.
 */
export function isCheckinDue(plan: ScheduleInput, lastCheckinDate: string | null, today: string): boolean {
  const due = lastDueDate(plan, today);
  if (!due) return false;
  return !lastCheckinDate || daysBetween(due, lastCheckinDate) < 0;
}
