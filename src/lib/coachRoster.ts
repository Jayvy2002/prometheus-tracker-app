import { shouldOpenSetup } from './coachAlerts';
import { liftsForClient } from './coachLifts';
import { caloriesByDay, normalizeGoal } from './coachNutrition';
import {
  clientFileHref,
  clientSituationLines,
  lastLoggedSessionDate,
} from './coachSituation';
import { displayName } from './coachText';
import { addDaysToDateStr } from './utils';
import type {
  ClientOpsRow,
  CoachClientSummary,
  CoachRosterSignals,
} from './types';

/** Lower = needs a look first. Same rank → name, then id. */
export const ROSTER_RANK = {
  setup: 0,
  noProgram: 1,
  ghost: 2,
  onTrack: 3,
} as const;

export type RosterGoalStatus = 'cut' | 'bulk' | 'perf' | '';

export type RosterKcalHint =
  | { kind: 'vs_target'; logged: number; target: number }
  | { kind: 'logged_only'; logged: number }
  | { kind: 'no_logs' }
  | { kind: 'none' };

export interface RosterContext {
  opsRows: ClientOpsRow[];
  signals: CoachRosterSignals;
  today: string;
}

export interface CoachRosterRow {
  client: CoachClientSummary;
  href: string;
  forceSetup: boolean;
  attentionRank: number;
  goalStatus: RosterGoalStatus;
  kcal: RosterKcalHint;
  programName: string | null;
  hasProgram: boolean;
  isGhost: boolean;
}

export function compareRosterName(a: CoachClientSummary, b: CoachClientSummary): number {
  const byName = displayName(a).localeCompare(displayName(b), 'fr', { sensitivity: 'base' });
  if (byName !== 0) return byName;
  return a.id.localeCompare(b.id);
}

export function rosterGoalStatus(goal: string | null | undefined): RosterGoalStatus {
  const g = normalizeGoal(goal);
  if (g === 'cut') return 'cut';
  if (g === 'bulk') return 'bulk';
  if (g === 'maintain') return 'perf';
  return '';
}

export function rosterKcalHint(
  client: CoachClientSummary,
  signals: CoachRosterSignals,
  today: string,
): RosterKcalHint {
  const target = Number(signals.calorieTargets[client.id] ?? client.daily_calorie_target) || 0;
  const weekAgo = addDaysToDateStr(today, -6);
  const recent = caloriesByDay(signals.nutritionLogs, client.id).filter(d => d.date >= weekAgo);
  if (recent.length === 0) {
    if (target > 0) return { kind: 'no_logs' };
    return { kind: 'none' };
  }
  const logged = Math.round(recent.reduce((s, d) => s + d.calories, 0) / recent.length);
  if (target > 0) return { kind: 'vs_target', logged, target };
  return { kind: 'logged_only', logged };
}

function opsFor(clientId: string, opsRows: ClientOpsRow[]): ClientOpsRow | undefined {
  return opsRows.find(r => r.client.id === clientId);
}

function isGhostRow(
  client: CoachClientSummary,
  ops: ClientOpsRow | undefined,
  signals: CoachRosterSignals,
  today: string,
): boolean {
  const lines = clientSituationLines({
    hasProgram: ops?.hasProgram ?? !!signals.assignmentName[client.id],
    lastSessionDate: lastLoggedSessionDate([], liftsForClient(signals.lifts, client.id)),
    today,
  });
  return lines.some(l => l.id === 'no_session' || l.id === 'idle_session');
}

export function rosterAttentionRank(
  client: CoachClientSummary,
  ctx: RosterContext,
): number {
  const ops = opsFor(client.id, ctx.opsRows);
  const forceSetup = ops ? shouldOpenSetup(ops) : !client.onboarding_completed;
  if (forceSetup) return ROSTER_RANK.setup;
  const hasProgram = ops?.hasProgram ?? !!ctx.signals.assignmentName[client.id];
  if (!hasProgram) return ROSTER_RANK.noProgram;
  if (isGhostRow(client, ops, ctx.signals, ctx.today)) return ROSTER_RANK.ghost;
  return ROSTER_RANK.onTrack;
}

export function buildRosterRow(client: CoachClientSummary, ctx: RosterContext): CoachRosterRow {
  const ops = opsFor(client.id, ctx.opsRows);
  const forceSetup = ops ? shouldOpenSetup(ops) : !client.onboarding_completed;
  const programName = (ctx.signals.assignmentName[client.id] || '').trim() || null;
  const hasProgram = ops?.hasProgram ?? !!programName;
  const isGhost = isGhostRow(client, ops, ctx.signals, ctx.today);
  return {
    client,
    href: forceSetup ? `/clients/${client.id}/setup` : clientFileHref(client.id),
    forceSetup,
    attentionRank: rosterAttentionRank(client, ctx),
    goalStatus: rosterGoalStatus(client.goal),
    kcal: rosterKcalHint(client, ctx.signals, ctx.today),
    programName: hasProgram ? programName : null,
    hasProgram,
    isGhost,
  };
}

export function sortRosterClients(
  clients: CoachClientSummary[],
  ctx: RosterContext,
): CoachRosterRow[] {
  return clients
    .map(c => buildRosterRow(c, ctx))
    .sort((a, b) => a.attentionRank - b.attentionRank || compareRosterName(a.client, b.client));
}
