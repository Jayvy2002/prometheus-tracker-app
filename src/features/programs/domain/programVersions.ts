/** P3.3 — version states derived from program_revisions + program pointers. */

import type { ProgramPhase } from './programPhases';
import type { PlanCalendarDay } from './planCalendar';
import type { SessionOrganization } from './sessionOrganization';

export type ProgramVersionState = 'draft' | 'saved' | 'active' | 'scheduled' | 'historical';

export function revisionVersionState(input: {
  revisionNo: number;
  activeRevisionNo?: number | null;
  scheduledRevisionNo?: number | null;
  activatedAt?: string | null;
}): ProgramVersionState {
  if (input.activeRevisionNo != null && input.revisionNo === input.activeRevisionNo) {
    return 'active';
  }
  if (input.scheduledRevisionNo != null && input.revisionNo === input.scheduledRevisionNo) {
    return 'scheduled';
  }
  if (input.activatedAt || (input.activeRevisionNo != null && input.revisionNo < input.activeRevisionNo)) {
    return 'historical';
  }
  return 'saved';
}

export function programGraphForDate(input: {
  date: string;
  liveDays: PlanCalendarDay[] | null | undefined;
  livePhases: ProgramPhase[] | null | undefined;
  liveOrganization?: SessionOrganization | null;
  scheduledActivatesOn?: string | null;
  scheduledDays?: PlanCalendarDay[] | null;
  scheduledPhases?: ProgramPhase[] | null;
  scheduledOrganization?: SessionOrganization | null;
}): {
  days: PlanCalendarDay[] | null | undefined;
  phases: ProgramPhase[] | null | undefined;
  organization?: SessionOrganization | null;
} {
  const date = input.date.slice(0, 10);
  const activates = input.scheduledActivatesOn?.slice(0, 10) ?? '';
  if (activates && date >= activates && input.scheduledDays != null) {
    return {
      days: input.scheduledDays,
      phases: input.scheduledPhases ?? input.livePhases,
      organization: input.scheduledOrganization ?? input.liveOrganization,
    };
  }
  return {
    days: input.liveDays,
    phases: input.livePhases,
    organization: input.liveOrganization,
  };
}
