import { relanceThreadHref } from './coachQueue';
import { displayName } from './coachText';
import { addDaysToDateStr } from './utils';
import type {
  ClientOpsRow,
  CoachIntervention,
  CoachPriority,
  CoachRosterSignals,
  NutritionLogSnapshot,
  NutritionStallRow,
  WeightMeasurement,
} from './types';

export const PROGRESS_TAB = 'progress';

export const MIN_NUTRITION_LOG_DAYS = 4;
export const OVEREAT_RATIO = 1.15;
/** Cut is stalling if weight did not drop by more than this over the window. */
export const CUT_STALL_MIN_DELTA_KG = -0.2;
export const LAST_LOG_MAX_AGE_DAYS = 10;

export function nutritionStallFocusHref(clientId: string): string {
  return `/clients/${clientId}?tab=${PROGRESS_TAB}`;
}

export function isProgressHref(href: string): boolean {
  const query = href.split('?')[1];
  if (!query) return false;
  return new URLSearchParams(query).get('tab') === PROGRESS_TAB;
}

export type NormalizedGoal = 'cut' | 'bulk' | 'maintain' | '';

export function normalizeGoal(goal: string | null | undefined): NormalizedGoal {
  const g = (goal || '').trim().toLowerCase();
  if (g === 'cut' || g === 'lose' || g === 'fat_loss' || g === 'weight_loss') return 'cut';
  if (g === 'bulk' || g === 'gain' || g === 'muscle') return 'bulk';
  if (g === 'maintain' || g === 'recomp') return 'maintain';
  return '';
}

export interface NutritionStallSignal {
  clientId: string;
  goal: NormalizedGoal;
  calorieTarget: number;
  avgCalories: number;
  loggedDays: number;
  lastLogDate: string;
  weightDeltaKg: number;
  newestKg: number;
  oldestKg: number;
  overeatRatio: number;
}

function dateOnly(value: string): string {
  return (value || '').slice(0, 10);
}

function daysBetween(from: string, to: string): number {
  const a = dateOnly(from);
  const b = dateOnly(to);
  if (!a || !b) return Number.POSITIVE_INFINITY;
  const aMs = Date.parse(`${a}T00:00:00`);
  const bMs = Date.parse(`${b}T00:00:00`);
  if (!Number.isFinite(aMs) || !Number.isFinite(bMs)) return Number.POSITIVE_INFINITY;
  return Math.round((bMs - aMs) / 86_400_000);
}

export function caloriesByDay(
  logs: NutritionLogSnapshot[],
  clientId: string,
): Array<{ date: string; calories: number }> {
  const byDate = new Map<string, number>();
  for (const log of logs) {
    if (log.user_id !== clientId) continue;
    const d = dateOnly(log.logged_at);
    if (!d) continue;
    byDate.set(d, (byDate.get(d) ?? 0) + (Number(log.calories) || 0));
  }
  return [...byDate.entries()]
    .map(([date, calories]) => ({ date, calories }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

function weightsForClient(weights: WeightMeasurement[], clientId: string): WeightMeasurement[] {
  return weights
    .filter(w => w.user_id === clientId)
    .slice()
    .sort((a, b) => a.measured_at.localeCompare(b.measured_at));
}

/**
 * Cut stall + calories too high. Requires recent adherence logs.
 * No inventing a cut: missing target, thin/stale logs, or on-target intake → null.
 */
export function detectCutCalorieStall(input: {
  clientId: string;
  goal: string;
  calorieTarget: number;
  logs: NutritionLogSnapshot[];
  weights: WeightMeasurement[];
  today: string;
}): NutritionStallSignal | null {
  const goal = normalizeGoal(input.goal);
  if (goal !== 'cut') return null;
  const target = Number(input.calorieTarget) || 0;
  if (target <= 0) return null;

  const days = caloriesByDay(input.logs, input.clientId);
  if (days.length < MIN_NUTRITION_LOG_DAYS) return null;

  const lastLog = days[days.length - 1];
  if (!lastLog || daysBetween(lastLog.date, input.today) > LAST_LOG_MAX_AGE_DAYS) return null;

  const avgCalories = days.reduce((s, d) => s + d.calories, 0) / days.length;
  const overeatRatio = avgCalories / target;
  if (overeatRatio < OVEREAT_RATIO) return null;

  const weights = weightsForClient(input.weights, input.clientId);
  if (weights.length < 2) return null;
  const oldest = weights[0];
  const newest = weights[weights.length - 1];
  const oldestKg = Number(oldest.weight_kg) || 0;
  const newestKg = Number(newest.weight_kg) || 0;
  const weightDeltaKg = Math.round((newestKg - oldestKg) * 10) / 10;
  if (weightDeltaKg < CUT_STALL_MIN_DELTA_KG) return null;

  return {
    clientId: input.clientId,
    goal,
    calorieTarget: target,
    avgCalories: Math.round(avgCalories),
    loggedDays: days.length,
    lastLogDate: lastLog.date,
    weightDeltaKg,
    newestKg,
    oldestKg,
    overeatRatio,
  };
}

export function canAskCalorieAdjustment(signal: NutritionStallSignal | null): boolean {
  if (!signal) return false;
  return false;
}

export function nutritionStallPriority(
  row: ClientOpsRow,
  signals: CoachRosterSignals,
  today: string,
): CoachPriority | null {
  const signal = detectCutCalorieStall({
    clientId: row.client.id,
    goal: row.client.goal,
    calorieTarget: signals.calorieTargets[row.client.id] ?? 0,
    logs: signals.nutritionLogs,
    weights: signals.weights,
    today,
  });
  if (!signal) return null;
  const name = displayName(row.client);
  const delta = signal.weightDeltaKg > 0 ? `+${signal.weightDeltaKg}` : String(signal.weightDeltaKg);
  return {
    id: `${row.client.id}-nutrition-stall`,
    clientId: row.client.id,
    clientName: name,
    avatarUrl: row.client.avatar_url,
    kind: 'nutrition_stall',
    severity: signal.overeatRatio >= 1.3 || signal.weightDeltaKg >= 1 ? 'red' : 'orange',
    headlineKey: 'coaching.priority.headlines.nutrition_stall',
    headlineParams: { name },
    detailKey: 'coaching.priority.details.nutrition_stall',
    detailParams: {
      avg: signal.avgCalories,
      target: signal.calorieTarget,
      delta,
    },
    href: nutritionStallFocusHref(row.client.id),
  };
}

function calorieDraftForClient(
  pending: CoachIntervention[],
  clientId: string,
): CoachIntervention | null {
  return pending.find(row =>
    row.client_id === clientId
    && row.status === 'pending'
    && (row.kind === 'calorie_adjustment' || row.kind === 'adherence_nutrition')
  ) ?? null;
}

function draftEditorHref(clientId: string, interventionId: string): string {
  return `/clients/${clientId}/draft/${interventionId}`;
}

export function nutritionStallReviewRows(
  opsRows: ClientOpsRow[],
  signals: CoachRosterSignals,
  priorities: CoachPriority[],
  pending: CoachIntervention[],
  today: string,
): NutritionStallRow[] {
  const byClient = new Map<string, NutritionStallRow>();

  const push = (row: NutritionStallRow) => {
    const existing = byClient.get(row.clientId);
    if (!existing) {
      byClient.set(row.clientId, row);
      return;
    }
    byClient.set(row.clientId, {
      ...existing,
      ...row,
      draftHref: row.draftHref || existing.draftHref,
      relanceHref: existing.relanceHref || row.relanceHref,
    });
  };

  for (const ops of opsRows) {
    const detected = detectCutCalorieStall({
      clientId: ops.client.id,
      goal: ops.client.goal,
      calorieTarget: signals.calorieTargets[ops.client.id] ?? 0,
      logs: signals.nutritionLogs,
      weights: signals.weights,
      today,
    });
    const fromPriority = priorities.find(p => p.clientId === ops.client.id && p.kind === 'nutrition_stall');
    const draft = calorieDraftForClient(pending, ops.client.id);
    if (!detected && !fromPriority && !draft) continue;
    const name = displayName(ops.client);
    const delta = detected
      ? (detected.weightDeltaKg > 0 ? `+${detected.weightDeltaKg}` : String(detected.weightDeltaKg))
      : '—';
    push({
      clientId: ops.client.id,
      clientName: name,
      avatarUrl: ops.client.avatar_url,
      href: nutritionStallFocusHref(ops.client.id),
      relanceHref: relanceThreadHref(ops.client.id, 'general_followup'),
      draftHref: draft ? draftEditorHref(ops.client.id, draft.id) : null,
      avgCalories: detected?.avgCalories ?? 0,
      calorieTarget: detected?.calorieTarget ?? (signals.calorieTargets[ops.client.id] ?? 0),
      weightDelta: delta,
      title: draft?.title || '',
    });
  }

  return [...byClient.values()].sort((a, b) => a.clientName.localeCompare(b.clientName));
}

export function secondCaloriePrompt(input: {
  name: string;
  avg: number;
  target: number;
  delta: string;
}): string {
  return (
    `Le cut de ${input.name} stagne (poids ${input.delta} kg). `
    + `Moyenne ${input.avg} kcal vs cible ${input.target}. `
    + 'Propose un brouillon calorie_adjustment éditable. N’écris pas les cibles ISSN. Rien ne s’applique tout seul.'
  );
}

export function recentWindowStart(today: string, days = 20): string {
  return addDaysToDateStr(today, -days);
}
