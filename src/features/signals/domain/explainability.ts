/**
 * P2.4 — first slice: translate P2.1–P2.3 memory into a human watch list.
 * No second engine. No auto-apply. No source-data rewrite.
 *
 * Visible copy is built from type + structured evidence + i18n.
 * Engine French summaries are never dumped into the watch row.
 * Current state and last human decision are separate fields.
 */

import type {
  AthleteDecisionLog,
  AthleteHumanDecision,
  AthleteSignal,
  AthleteSignalDomain,
  AthleteSignalEvidenceItem,
  AthleteWeeklyReview,
} from '../types';
import {
  decisionEvidenceChanged,
  isProposalSuppressed,
  type ProposalEvidenceSnapshot,
} from './decisionLog';
import {
  isConcreteWatchProposal,
  watchProposalCopyKey,
  watchProposalDraftCalories,
  WATCH_PROPOSAL_COPY_KEYS,
} from './watchProposal';

export const WATCH_SIGNAL_TYPES = [
  'missed_sessions',
  'not_following',
  'sparse_nutrition',
  'too_fast',
  'stall',
  'fatigue',
] as const;

export type WatchSignalType = (typeof WATCH_SIGNAL_TYPES)[number];

export const META_EVIDENCE_KINDS = ['window', 'fingerprint'] as const;

const WINDOW_SUMMARY_RE = /^(\d{4}-\d{2}-\d{2})\.\.(\d{4}-\d{2}-\d{2})$/;

export interface WatchCopy {
  key: string;
  params: Record<string, string | number>;
}

export type WatchDataPoint = WatchCopy;

export type WatchItemKind = 'current' | 'history';

export interface PrometheusWatchItem {
  id: string;
  kind: WatchItemKind;
  domain: AthleteSignalDomain;
  type: string;
  headlineKey: string;
  domainKey: string;
  statusKey: string;
  confidenceKey: string;
  observedCopy: WatchCopy | null;
  whyKey: string;
  dataPoints: WatchDataPoint[];
  lastDataPoints: WatchDataPoint[];
  periodStart: string | null;
  periodEnd: string | null;
  lastPeriodStart: string | null;
  lastPeriodEnd: string | null;
  evolutionKey: string;
  currentProposalKey: string | null;
  currentProposalDetail: WatchCopy | null;
  lastProposalKey: string | null;
  lastDecisionKey: string | null;
  lastDecisionAt: string | null;
  lastActorKey: string | null;
  humanReason: string | null;
  whyHiddenKey: string | null;
  reevaluateKey: string;
  reviewWeekStart: string | null;
  reviewId: string | null;
  reviewUpdatedAt: string | null;
  currentProposal: Record<string, unknown> | null;
  currentEvidence: Record<string, unknown> | null;
  signalEvidence: Record<string, unknown> | null;
  signalUpdatedAt: string | null;
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

const LAST_PROPOSAL_ACTION_KEYS: Record<string, string> = {
  relance: 'prometheusWatch.proposal.relance',
  calorie_adjustment: 'prometheusWatch.proposal.calories',
  keep: 'prometheusWatch.proposal.wait',
  program_adjustment: 'prometheusWatch.proposal.program',
};

function proposalFromUnknown(raw: unknown): unknown {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  return (raw as Record<string, unknown>).proposal ?? null;
}

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

function displayMetric(value: number | null): string | number {
  return value == null ? '—' : value;
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
    goal: firstString(raw, ['goal']) ?? undefined,
    proteinTarget: firstNumber(raw, ['protein_target', 'proteinTarget']) ?? undefined,
    carbsTarget: firstNumber(raw, ['carbs_target', 'carbsTarget']) ?? undefined,
    fatTarget: firstNumber(raw, ['fat_target', 'fatTarget']) ?? undefined,
    weightKg: firstNumber(raw, ['weight_kg', 'weightKg']) ?? undefined,
    weightStartKg: firstNumber(raw, ['weight_start_kg', 'weightStartKg']),
    guarded: typeof raw.guarded === 'boolean' ? raw.guarded : undefined,
  };
}

export function parseEvidenceWindow(
  items: AthleteSignalEvidenceItem[] | null | undefined,
): { start: string; end: string } | null {
  const row = (items ?? []).find((item) => item?.kind === META_EVIDENCE_KINDS[0]);
  if (!row || typeof row.summary !== 'string') return null;
  const match = row.summary.trim().match(WINDOW_SUMMARY_RE);
  if (!match) return null;
  return { start: match[1], end: match[2] };
}

export function parseEvidenceFingerprint(
  items: AthleteSignalEvidenceItem[] | null | undefined,
): Record<string, unknown> | null {
  const row = (items ?? []).find((item) => item?.kind === META_EVIDENCE_KINDS[1]);
  if (!row || typeof row.summary !== 'string' || !row.summary.trim()) return null;
  try {
    const parsed: unknown = JSON.parse(row.summary);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
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

export function observedCopyFromType(
  type: string,
  metrics: Record<string, unknown> | null | undefined,
): WatchCopy {
  const raw = metrics ?? {};
  if (type === 'missed_sessions') {
    return {
      key: 'prometheusWatch.observedCopy.workouts',
      params: {
        count: displayMetric(firstNumber(raw, ['workout_count', 'workoutCount'])),
        expected: displayMetric(firstNumber(raw, ['expected_workouts', 'expectedWorkouts'])),
      },
    };
  }
  if (type === 'not_following') {
    return {
      key: 'prometheusWatch.observedCopy.nutrition',
      params: {
        avg: displayMetric(firstNumber(raw, ['avg_calories', 'avgCalories'])),
        target: displayMetric(firstNumber(raw, ['calorie_target', 'calorieTarget'])),
      },
    };
  }
  if (type === 'sparse_nutrition') {
    return {
      key: 'prometheusWatch.observedCopy.nutritionDays',
      params: {
        days: displayMetric(firstNumber(raw, ['logged_nutrition_days', 'loggedNutritionDays'])),
      },
    };
  }
  if (type === 'too_fast' || type === 'stall') {
    return {
      key: 'prometheusWatch.observedCopy.weightDelta',
      params: { n: displayMetric(firstNumber(raw, ['weight_delta_kg', 'weightDeltaKg'])) },
    };
  }
  if (type === 'fatigue') {
    return {
      key: 'prometheusWatch.observedCopy.fatigue',
      params: {
        fatigue: displayMetric(firstNumber(raw, ['avg_fatigue', 'avgFatigue'])),
        energy: displayMetric(firstNumber(raw, ['avg_energy', 'avgEnergy'])),
      },
    };
  }
  return { key: 'prometheusWatch.observedCopy.generic', params: {} };
}

function lastProposalKeyFrom(decision: AthleteDecisionLog | null): string | null {
  if (!decision?.proposal || typeof decision.proposal !== 'object') return null;
  if (decision.decision === 'corrected' || decision.proposal.kind === 'watch_context_correction') {
    return null;
  }
  return watchProposalCopyKey(decision.proposal)
    ?? (typeof decision.proposal.action === 'string'
      ? LAST_PROPOSAL_ACTION_KEYS[decision.proposal.action] ?? null
      : null);
}

function periodFromSnapshot(
  snapshot: ProposalEvidenceSnapshot | null,
): { start: string | null; end: string | null } {
  return {
    start: snapshot?.windowStart ?? null,
    end: snapshot?.windowEnd ?? null,
  };
}

function snapshotFromSignal(signal: AthleteSignal): ProposalEvidenceSnapshot | null {
  const fingerprint = parseEvidenceFingerprint(signal.evidence_for);
  const window = parseEvidenceWindow(signal.evidence_for);
  if (!fingerprint && !window) return null;
  return evidenceSnapshotFromRecord({
    ...(fingerprint ?? {}),
    window_start: window?.start,
    window_end: window?.end,
  });
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

function typeKeyOf(type: string): string {
  return isWatchType(type)
    ? `prometheusWatch.types.${type}`
    : 'prometheusWatch.types.other';
}

function whyKeyOf(type: string): string {
  return isWatchType(type)
    ? `prometheusWatch.whyCopy.${type}`
    : 'prometheusWatch.whyCopy.other';
}

function isOpenProposeAction(raw: unknown, domain: string, type: string): boolean {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return false;
  const row = raw as Record<string, unknown>;
  if (row.op !== 'upsert') return false;
  if (row.domain !== domain || row.type !== type) return false;
  if (row.status !== 'open') return false;
  if (row.confidence !== 'medium' && row.confidence !== 'high') return false;
  return isConcreteWatchProposal(proposalFromUnknown(raw));
}

/** True only when this review actually upserted this (domain, type) as an open, propose-worthy signal with a concrete Solo/fleet proposal. */
export function reviewProposesFor(
  review: AthleteWeeklyReview | null | undefined,
  domain: string,
  type: string,
): boolean {
  if (!review || review.decision !== 'propose') return false;
  const actions = Array.isArray(review.signal_actions) ? review.signal_actions : [];
  return actions.some((raw) => isOpenProposeAction(raw, domain, type));
}

function currentProposalFromReview(
  review: AthleteWeeklyReview | null,
  domain: string,
  type: string,
): {
  key: string;
  detail: WatchCopy | null;
  proposal: Record<string, unknown>;
  evidence: Record<string, unknown>;
} | null {
  if (!reviewProposesFor(review, domain, type) || !review) return null;
  const actions = Array.isArray(review.signal_actions) ? review.signal_actions : [];
  const action = actions.find((raw) => isOpenProposeAction(raw, domain, type));
  const proposal = proposalFromUnknown(action);
  const key = watchProposalCopyKey(proposal);
  if (!key || !proposal || typeof proposal !== 'object' || Array.isArray(proposal)) return null;
  const calories = watchProposalDraftCalories(proposal);
  const evidenceFor = action && typeof action === 'object' && !Array.isArray(action)
    ? (action as Record<string, unknown>).evidence_for
    : null;
  const evidence = parseEvidenceFingerprint(
    Array.isArray(evidenceFor) ? evidenceFor as AthleteSignalEvidenceItem[] : null,
  ) ?? {};
  return {
    key,
    detail: calories != null
      ? { key: WATCH_PROPOSAL_COPY_KEYS.draftCalories, params: { n: calories } }
      : null,
    proposal: proposal as Record<string, unknown>,
    evidence,
  };
}

function currentProposalAllowed(input: {
  kind: WatchItemKind;
  domain: string;
  type: string;
  signal: AthleteSignal | null;
  suppressed: boolean;
  review: AthleteWeeklyReview | null;
  lastHuman: AthleteHumanDecision | null;
  evidenceMoved: boolean;
}): boolean {
  if (input.kind !== 'current') return false;
  if (input.suppressed) return false;
  if (input.signal?.status !== 'open') return false;
  if (!reviewProposesFor(input.review, input.domain, input.type)) return false;
  if ((input.lastHuman === 'accepted' || input.lastHuman === 'modified') && !input.evidenceMoved) {
    return false;
  }
  return true;
}

function buildItem(input: {
  id: string;
  kind: WatchItemKind;
  domain: AthleteSignalDomain;
  type: string;
  signal: AthleteSignal | null;
  decision: AthleteDecisionLog | null;
  review: AthleteWeeklyReview | null;
}): PrometheusWatchItem {
  const { signal, decision, review, domain, type, kind } = input;
  const lastHuman: AthleteHumanDecision | null = decision?.decision ?? null;
  const refusedOrIgnored = lastHuman === 'refused' || lastHuman === 'ignored' || lastHuman === 'corrected';
  const currentEvidence = kind === 'current' && signal
    ? snapshotFromSignal(signal) ?? evidenceSnapshotFromRecord(review?.aggregates ?? null)
    : evidenceSnapshotFromRecord(review?.aggregates ?? null);
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
    lastHuman
    && currentEvidence
    && decision
    && decisionEvidenceChanged(decision.data_used, currentEvidence, domain, type),
  );
  const proposalSettled = suppressed
    || ((lastHuman === 'accepted' || lastHuman === 'modified') && !evidenceMoved);

  const currentMetrics = kind === 'current' && signal
    ? parseEvidenceFingerprint(signal.evidence_for)
    : null;
  const lastMetrics = decision?.data_used ?? null;
  const observedMetrics = currentMetrics ?? (kind === 'history' ? lastMetrics : null);
  const currentWindow = kind === 'current' && signal
    ? parseEvidenceWindow(signal.evidence_for)
    : null;
  const lastSnapshot = evidenceSnapshotFromRecord(lastMetrics);
  const lastPeriod = periodFromSnapshot(lastSnapshot);
  const hasCurrentProposal = currentProposalAllowed({
    kind,
    domain,
    type,
    signal,
    suppressed,
    review,
    lastHuman,
    evidenceMoved,
  });
  const currentProposal = hasCurrentProposal
    ? currentProposalFromReview(review, domain, type)
    : null;

  let statusKey: string;
  if (kind === 'history') {
    statusKey = 'prometheusWatch.status.quiet';
  } else if (signal?.status === 'open' || signal?.status === 'waiting') {
    statusKey = `prometheusWatch.status.${signal.status}`;
  } else {
    statusKey = 'prometheusWatch.status.quiet';
  }

  let whyHiddenKey: string | null = null;
  if (kind === 'history' && evidenceMoved) {
    whyHiddenKey = 'prometheusWatch.hidden.changedNoSignal';
  } else if (proposalSettled) {
    whyHiddenKey = 'prometheusWatch.hidden.unchanged';
  } else if (kind === 'current' && evidenceMoved) {
    whyHiddenKey = 'prometheusWatch.hidden.changed';
  }

  let reevaluateKey = 'prometheusWatch.reevaluate.nextReview';
  if (proposalSettled) reevaluateKey = 'prometheusWatch.reevaluate.needNewProof';
  else if (kind === 'history') reevaluateKey = 'prometheusWatch.reevaluate.noOpenSignal';
  else if (signal?.status === 'waiting') reevaluateKey = 'prometheusWatch.reevaluate.needMoreData';

  return {
    id: input.id,
    kind,
    domain,
    type,
    headlineKey: typeKeyOf(type),
    domainKey: `prometheusWatch.domains.${domain}`,
    statusKey,
    confidenceKey: kind === 'current' && signal
      ? `prometheusWatch.confidence.${signal.confidence}`
      : 'prometheusWatch.confidence.none',
    observedCopy: (observedMetrics || isWatchType(type))
      ? observedCopyFromType(type, observedMetrics)
      : null,
    whyKey: whyKeyOf(type),
    dataPoints: humanizeDataUsed(currentMetrics),
    lastDataPoints: humanizeDataUsed(lastMetrics),
    periodStart: currentWindow?.start ?? null,
    periodEnd: currentWindow?.end ?? null,
    lastPeriodStart: lastPeriod.start,
    lastPeriodEnd: lastPeriod.end,
    evolutionKey: kind === 'history'
      ? 'prometheusWatch.evolution.past'
      : signal && signal.first_seen_at !== signal.last_seen_at
        ? 'prometheusWatch.evolution.updated'
        : 'prometheusWatch.evolution.first',
    currentProposalKey: currentProposal?.key ?? null,
    currentProposalDetail: currentProposal?.detail ?? null,
    currentProposal: hasCurrentProposal ? currentProposal?.proposal ?? null : null,
    currentEvidence: hasCurrentProposal ? currentProposal?.evidence ?? null : null,
    signalEvidence: currentMetrics,
    reviewId: kind === 'current' ? review?.id ?? null : null,
    reviewUpdatedAt: kind === 'current' ? review?.updated_at ?? null : null,
    signalUpdatedAt: kind === 'current' ? signal?.updated_at ?? null : null,
    lastProposalKey: lastProposalKeyFrom(decision),
    lastDecisionKey: lastHuman ? `prometheusWatch.decision.${lastHuman}` : null,
    lastDecisionAt: decision?.created_at ?? null,
    lastActorKey: decision ? `prometheusWatch.actor.${decision.actor_role}` : null,
    humanReason: decision?.human_reason?.trim() || null,
    whyHiddenKey,
    reevaluateKey,
    reviewWeekStart: kind === 'current' ? review?.week_start ?? null : null,
    suppressed,
  };
}

/** Pure: one watch row per open/waiting signal, plus quiet history without inventing an open signal. */
export function buildPrometheusWatchItems(input: {
  signals: AthleteSignal[];
  decisions: AthleteDecisionLog[];
  latestReview?: AthleteWeeklyReview | null;
}): PrometheusWatchItem[] {
  const open = input.signals.filter((row) => row.status === 'open' || row.status === 'waiting');
  const items: PrometheusWatchItem[] = [];
  const seen = new Set<string>();
  const review = input.latestReview ?? null;

  for (const signal of open) {
    const key = signalKey(signal.domain, signal.type);
    seen.add(key);
    const decision = latestLog(input.decisions, signal.domain, signal.type);
    items.push(buildItem({
      id: signal.id,
      kind: 'current',
      domain: signal.domain,
      type: signal.type,
      signal,
      decision,
      review,
    }));
  }

  for (const decision of input.decisions) {
    if (
      decision.decision !== 'refused'
      && decision.decision !== 'ignored'
      && decision.decision !== 'corrected'
    ) continue;
    const key = signalKey(decision.domain, decision.type);
    if (seen.has(key)) continue;
    const latest = latestLog(input.decisions, decision.domain, decision.type);
    if (!latest || latest.id !== decision.id) continue;
    seen.add(key);
    items.push(buildItem({
      id: `hidden:${decision.id}`,
      kind: 'history',
      domain: decision.domain,
      type: decision.type,
      signal: null,
      decision,
      review,
    }));
  }

  return items.slice(0, 12);
}

export function watchItemHasRawJson(item: PrometheusWatchItem): boolean {
  const blobs = [
    item.observedCopy?.key ?? '',
    ...Object.values(item.observedCopy?.params ?? {}),
    item.humanReason ?? '',
    ...item.dataPoints.flatMap((row) => Object.values(row.params)),
    ...item.lastDataPoints.flatMap((row) => Object.values(row.params)),
  ].map((value) => String(value));
  return blobs.some((value) => /[{[]/.test(value) && /[}\]]/.test(value));
}
