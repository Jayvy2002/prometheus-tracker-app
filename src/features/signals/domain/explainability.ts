/**
 * P2.4 — first slice: translate P2.1–P2.3 memory into a human watch list.
 * No second engine. No auto-apply. No source-data rewrite.
 */

import type {
  AthleteDecisionLog,
  AthleteHumanDecision,
  AthleteSignal,
  AthleteSignalDomain,
  AthleteWeeklyReview,
} from '../types';
import {
  isProposalSuppressed,
  type ProposalEvidenceSnapshot,
} from './decisionLog';

export const WATCH_SIGNAL_TYPES = [
  'missed_sessions',
  'not_following',
  'sparse_nutrition',
  'too_fast',
  'stall',
  'fatigue',
] as const;

export type WatchSignalType = (typeof WATCH_SIGNAL_TYPES)[number];

export interface WatchDataPoint {
  key: string;
  params: Record<string, string | number>;
}

export interface PrometheusWatchItem {
  id: string;
  domain: AthleteSignalDomain;
  type: string;
  headlineKey: string;
  headlineFallback: string;
  domainKey: string;
  statusKey: string;
  confidenceKey: string;
  observed: string;
  whyKey: string;
  dataPoints: WatchDataPoint[];
  periodStart: string | null;
  periodEnd: string | null;
  evolutionKey: string;
  proposalKey: string | null;
  lastDecisionKey: string | null;
  lastDecisionAt: string | null;
  lastActorKey: string | null;
  humanReason: string | null;
  whyHiddenKey: string | null;
  reevaluateKey: string;
  suppressed: boolean;
}

const DATA_KEY_MAP: Record<string, string> = {
  workout_count: 'prometheusWatch.data.workouts',
  workoutCount: 'prometheusWatch.data.workouts',
  expected_workouts: 'prometheusWatch.data.expectedWorkouts',
  expectedWorkouts: 'prometheusWatch.data.expectedWorkouts',
  avg_calories: 'prometheusWatch.data.avgCalories',
  avgCalories: 'prometheusWatch.data.avgCalories',
  calorie_target: 'prometheusWatch.data.calorieTarget',
  calorieTarget: 'prometheusWatch.data.calorieTarget',
  logged_nutrition_days: 'prometheusWatch.data.nutritionDays',
  loggedNutritionDays: 'prometheusWatch.data.nutritionDays',
  weight_delta_kg: 'prometheusWatch.data.weightDelta',
  weightDeltaKg: 'prometheusWatch.data.weightDelta',
  weigh_ins: 'prometheusWatch.data.weighIns',
  weighIns: 'prometheusWatch.data.weighIns',
  avg_fatigue: 'prometheusWatch.data.fatigue',
  avgFatigue: 'prometheusWatch.data.fatigue',
  avg_energy: 'prometheusWatch.data.energy',
  avgEnergy: 'prometheusWatch.data.energy',
};

const PROPOSAL_ACTION_KEYS: Record<string, string> = {
  relance: 'prometheusWatch.proposal.relance',
  calorie_adjustment: 'prometheusWatch.proposal.calories',
  keep: 'prometheusWatch.proposal.wait',
  program_adjustment: 'prometheusWatch.proposal.program',
};

function isWatchType(value: string): value is WatchSignalType {
  return (WATCH_SIGNAL_TYPES as readonly string[]).includes(value);
}

function firstNumber(raw: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const value = raw[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) return Number(value);
  }
  return null;
}

function firstString(raw: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = raw[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

export function evidenceSnapshotFromRecord(
  raw: Record<string, unknown> | null | undefined,
): ProposalEvidenceSnapshot | null {
  if (!raw || typeof raw !== 'object') return null;
  return {
    avgCalories: firstNumber(raw, ['avg_calories', 'avgCalories']) ?? 0,
    calorieTarget: firstNumber(raw, ['calorie_target', 'calorieTarget']) ?? 0,
    workoutCount: firstNumber(raw, ['workout_count', 'workoutCount']) ?? 0,
    loggedNutritionDays: firstNumber(raw, ['logged_nutrition_days', 'loggedNutritionDays']) ?? 0,
    weightDeltaKg: firstNumber(raw, ['weight_delta_kg', 'weightDeltaKg']),
    expectedWorkouts: firstNumber(raw, ['expected_workouts', 'expectedWorkouts']) ?? undefined,
    weighIns: firstNumber(raw, ['weigh_ins', 'weighIns']) ?? undefined,
    avgFatigue: firstNumber(raw, ['avg_fatigue', 'avgFatigue']),
    avgEnergy: firstNumber(raw, ['avg_energy', 'avgEnergy']),
    windowStart: firstString(raw, ['window_start', 'windowStart']) ?? undefined,
    windowEnd: firstString(raw, ['window_end', 'windowEnd']) ?? undefined,
  };
}

export function humanizeDataUsed(raw: Record<string, unknown> | null | undefined): WatchDataPoint[] {
  if (!raw || typeof raw !== 'object') return [];
  const out: WatchDataPoint[] = [];
  const seen = new Set<string>();
  for (const [key, value] of Object.entries(raw)) {
    const label = DATA_KEY_MAP[key];
    if (!label || seen.has(label)) continue;
    if (value == null || typeof value === 'object') continue;
    if (typeof value !== 'number' && typeof value !== 'string') continue;
    if (typeof value === 'string' && !value.trim()) continue;
    seen.add(label);
    out.push({ key: label, params: { n: value } });
  }
  return out;
}

function evidenceSummaries(signal: AthleteSignal | null): string[] {
  if (!signal) return [];
  const rows = [...(signal.evidence_for ?? []), ...(signal.evidence_against ?? [])];
  return rows
    .map((item) => (typeof item?.summary === 'string' ? item.summary.trim() : ''))
    .filter(Boolean)
    .slice(0, 4);
}

function proposalKeyFrom(decision: AthleteDecisionLog | null): string | null {
  if (!decision?.proposal || typeof decision.proposal !== 'object') return null;
  const action = decision.proposal.action;
  if (typeof action !== 'string') return null;
  return PROPOSAL_ACTION_KEYS[action] ?? 'prometheusWatch.proposal.generic';
}

function periodFrom(
  review: AthleteWeeklyReview | null | undefined,
  dataUsed: Record<string, unknown> | null | undefined,
  signal: AthleteSignal | null,
): { start: string | null; end: string | null } {
  const fromReview = evidenceSnapshotFromRecord(review?.aggregates ?? null);
  const fromData = evidenceSnapshotFromRecord(dataUsed ?? null);
  return {
    start: fromReview?.windowStart ?? fromData?.windowStart ?? signal?.first_seen_at?.slice(0, 10) ?? null,
    end: fromReview?.windowEnd ?? fromData?.windowEnd ?? signal?.last_seen_at?.slice(0, 10) ?? null,
  };
}

function signalKey(domain: string, type: string): string {
  return `${domain}:${type}`;
}

function latestLog(
  rows: AthleteDecisionLog[],
  domain: string,
  type: string,
): AthleteDecisionLog | null {
  let best: AthleteDecisionLog | null = null;
  for (const row of rows) {
    if (row.domain !== domain || row.type !== type) continue;
    if (!best || row.created_at > best.created_at) best = row;
  }
  return best;
}

function buildItem(input: {
  id: string;
  domain: AthleteSignalDomain;
  type: string;
  signal: AthleteSignal | null;
  decision: AthleteDecisionLog | null;
  currentEvidence: ProposalEvidenceSnapshot | null;
  review: AthleteWeeklyReview | null;
}): PrometheusWatchItem {
  const { signal, decision, currentEvidence, review, domain, type } = input;
  const lastHuman: AthleteHumanDecision | null = decision?.decision ?? null;
  const refusedOrIgnored = lastHuman === 'refused' || lastHuman === 'ignored';
  const suppressed = refusedOrIgnored
    ? currentEvidence
      ? isProposalSuppressed(
        decision ? [decision] : [],
        domain,
        type,
        currentEvidence,
      )
      : true
    : false;
  const evidenceMoved = Boolean(
    refusedOrIgnored
    && currentEvidence
    && decision
    && !isProposalSuppressed([decision], domain, type, currentEvidence),
  );
  const status = signal?.status ?? (suppressed ? 'waiting' : 'open');
  const dataPoints = humanizeDataUsed(decision?.data_used ?? review?.aggregates ?? null);
  const observedBits = evidenceSummaries(signal);
  const period = periodFrom(review, decision?.data_used, signal);
  const typeKey = isWatchType(type)
    ? `prometheusWatch.types.${type}`
    : 'prometheusWatch.types.other';

  return {
    id: input.id,
    domain,
    type,
    headlineKey: typeKey,
    headlineFallback: (signal?.hypothesis ?? decision?.why ?? type).trim(),
    domainKey: `prometheusWatch.domains.${domain}`,
    statusKey: `prometheusWatch.status.${status}`,
    confidenceKey: signal
      ? `prometheusWatch.confidence.${signal.confidence}`
      : 'prometheusWatch.confidence.low',
    observed: observedBits[0] ?? (signal?.hypothesis ?? ''),
    whyKey: typeKey,
    dataPoints,
    periodStart: period.start,
    periodEnd: period.end,
    evolutionKey: signal && signal.first_seen_at !== signal.last_seen_at
      ? 'prometheusWatch.evolution.updated'
      : 'prometheusWatch.evolution.first',
    proposalKey: suppressed ? null : proposalKeyFrom(decision),
    lastDecisionKey: lastHuman ? `prometheusWatch.decision.${lastHuman}` : null,
    lastDecisionAt: decision?.created_at ?? null,
    lastActorKey: decision ? `prometheusWatch.actor.${decision.actor_role}` : null,
    humanReason: decision?.human_reason?.trim() || null,
    whyHiddenKey: suppressed
      ? 'prometheusWatch.hidden.unchanged'
      : evidenceMoved
        ? 'prometheusWatch.hidden.changed'
        : null,
    reevaluateKey: suppressed
      ? 'prometheusWatch.reevaluate.needNewProof'
      : status === 'waiting'
        ? 'prometheusWatch.reevaluate.needMoreData'
        : 'prometheusWatch.reevaluate.nextReview',
    suppressed,
  };
}

/** Pure: one watch row per open/waiting signal, plus suppressed proposals without an open row. */
export function buildPrometheusWatchItems(input: {
  signals: AthleteSignal[];
  decisions: AthleteDecisionLog[];
  latestReview?: AthleteWeeklyReview | null;
}): PrometheusWatchItem[] {
  const currentEvidence = evidenceSnapshotFromRecord(input.latestReview?.aggregates ?? null);
  const open = input.signals.filter((row) => row.status === 'open' || row.status === 'waiting');
  const items: PrometheusWatchItem[] = [];
  const seen = new Set<string>();

  for (const signal of open) {
    const key = signalKey(signal.domain, signal.type);
    seen.add(key);
    const decision = latestLog(input.decisions, signal.domain, signal.type);
    items.push(buildItem({
      id: signal.id,
      domain: signal.domain,
      type: signal.type,
      signal,
      decision,
      currentEvidence,
      review: input.latestReview ?? null,
    }));
  }

  for (const decision of input.decisions) {
    if (decision.decision !== 'refused' && decision.decision !== 'ignored') continue;
    const key = signalKey(decision.domain, decision.type);
    if (seen.has(key)) continue;
    const latest = latestLog(input.decisions, decision.domain, decision.type);
    if (!latest || latest.id !== decision.id) continue;
    seen.add(key);
    items.push(buildItem({
      id: `hidden:${decision.id}`,
      domain: decision.domain,
      type: decision.type,
      signal: null,
      decision,
      currentEvidence,
      review: input.latestReview ?? null,
    }));
  }

  return items.slice(0, 12);
}

export function watchItemHasRawJson(item: PrometheusWatchItem): boolean {
  const blobs = [
    item.observed,
    item.headlineFallback,
    item.humanReason ?? '',
    ...item.dataPoints.map((row) => String(row.params.n)),
  ];
  return blobs.some((value) => /[{[]/.test(value) && /[}\]]/.test(value));
}
