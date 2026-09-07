import { calculateMacros } from './utils';
import { isCompleteCalorieDraft, type CalorieDraft } from './coachInterventions';
import { firstNameOf } from './coachQueue';
import {
  FLEET_COPY,
  fleetLocale,
  type FleetCopy,
  type FleetGoalKey,
  type FleetLocale,
} from '../../supabase/functions/_shared/fleetCopy.ts';
import { normalizeGoal, OVEREAT_RATIO, MIN_NUTRITION_LOG_DAYS, CUT_STALL_MIN_DELTA_KG } from './coachNutrition';
import type {
  CoachFleetCard,
  CoachFleetDossier,
  CoachFleetEvidence,
  CoachFleetFlag,
  CoachFleetHandled,
  CoachIntervention,
  CoachInterventionKind,
  CoachNudgeTemplateKey,
} from './types';

export const FLEET_SOURCE = 'fleet';
export const FLEET_WINDOW_DAYS = 14;
export const GHOST_IDLE_DAYS = 10;
/** Linked < 7 days and no sessions yet → setup, not missed training. */
export const NEW_CLIENT_DAYS = 7;
export const UNDER_EAT_RATIO = 0.85;
/** Cut too fast: more than ~1.5% bodyweight per week. Camille ~1.05% stays quiet. */
export const CUT_TOO_FAST_PCT_PER_WEEK = 1.5;
export const BULK_TOO_FAST_PCT_PER_WEEK = 0.7;
/** On-track + no outbound coach message for this many days → keep_in_touch Relancer. */
export const KEEP_IN_TOUCH_DAYS = 7;
/** Same signal stays quiet this long after send/dismiss/keep, unless evidence moves. */
export const FLEET_HANDLE_COOLDOWN_DAYS = 7;

/**
 * Architecture lock 2026-08-29: no Grok Bots (per coach or per client).
 * Weekly review is in-app (`coach-fleet-round` + cron). SQL triages every
 * active client; Relancer templates and data-driven kcal are complete proposals —
 * the round is 100 % deterministic, no LLM call. Program drafts go through
 * `coach-agent` on demand. Never auto-apply. Never ping Second.
 *
 * This file mirrors the Edge Function so the rules are unit-tested here; the copy
 * (FR/EN) is shared through `supabase/functions/_shared/fleetCopy.ts`.
 */
export { fleetLocale };
export type { FleetLocale };

const RELANCE_KINDS = new Set<CoachInterventionKind>([
  'adherence_nutrition',
  'adherence_training',
  'keep_in_touch',
]);

export function firstName(full: string, copy: FleetCopy = FLEET_COPY.fr): string {
  return firstNameOf(full) || full.trim() || copy.you;
}

/** Check-in ratings are 0–10 in the client UI. Adherence columns remain 0–100 (shown /5 via this helper). */
export function adherenceOnFive(raw: number | null | undefined): number | null {
  if (raw == null || !Number.isFinite(raw)) return null;
  if (raw <= 5) return Math.round(raw * 10) / 10;
  return Math.round((raw / 20) * 10) / 10;
}

export function overeatRatio(avgCalories: number, calorieTarget: number): number {
  if (calorieTarget <= 0 || avgCalories <= 0) return 0;
  return avgCalories / calorieTarget;
}

export function weeklyWeightPct(deltaKg: number | null, startKg: number | null, windowDays = FLEET_WINDOW_DAYS): number | null {
  if (deltaKg == null || startKg == null || startKg <= 0 || windowDays <= 0) return null;
  const weeks = windowDays / 7;
  if (weeks <= 0) return null;
  return (deltaKg / startKg) * 100 / weeks;
}

export { isCompleteCalorieDraft };

export const WEEKLY_SMALL_KCAL = 100;
export const WEEKLY_LARGE_KCAL = 200;
export const WEEKLY_CARB_SHIFT_G = 35;
export const FATIGUE_TRAINING_MAX = 2.5;
export const CUT_GAIN_MIN_DELTA_KG = 0.3;

export type WeeklyNutritionReason =
  | 'keep'
  | 'not_following'
  | 'cut_stall'
  | 'cut_gain'
  | 'too_fast_cut'
  | 'bulk_stall'
  | 'bulk_too_fast'
  | 'carb_support';

export interface WeeklyNutritionProposal {
  action: 'keep' | 'relance' | 'calorie_adjustment';
  reason: WeeklyNutritionReason;
  draft: CalorieDraft | null;
}

export function completeMacrosFor(calories: number, goal: string, weightKg: number): CalorieDraft {
  const macros = calculateMacros(calories, normalizeGoal(goal) || 'maintain', undefined, weightKg || undefined);
  return {
    calories: Math.round(calories),
    protein: Math.max(1, macros.protein),
    carbs: Math.max(1, macros.carbs),
    fat: Math.max(1, macros.fat),
  };
}

function clampCalories(n: number): number {
  return Math.min(8000, Math.max(800, Math.round(n)));
}

function currentOrIssnDraft(d: CoachFleetDossier): CalorieDraft {
  const current: CalorieDraft = {
    calories: Math.round(d.calorie_target),
    protein: Math.round(d.protein_target),
    carbs: Math.round(d.carbs_target),
    fat: Math.round(d.fat_target),
  };
  if (isCompleteCalorieDraft(current)) return current;
  const base = d.calorie_target > 0 ? d.calorie_target : Math.round(d.avg_calories) || 2000;
  return completeMacrosFor(base, d.goal, d.weight_end_kg || d.weight_kg);
}

export function signsOfFatigue(d: CoachFleetDossier): boolean {
  const training = adherenceOnFive(d.avg_adherence_training);
  return training != null && training <= FATIGUE_TRAINING_MAX;
}

export function shiftCarbsKeepCalories(draft: CalorieDraft, extraCarbs = WEEKLY_CARB_SHIFT_G): CalorieDraft {
  const protein = Math.max(1, draft.protein);
  const carbs = Math.max(1, draft.carbs + extraCarbs);
  const remaining = draft.calories - protein * 4 - carbs * 4;
  const fat = Math.max(1, Math.round(remaining / 9));
  return {
    calories: Math.round(draft.calories),
    protein,
    carbs,
    fat,
  };
}

/** Data-driven weekly nutrition proposal. Never auto-applied — coach confirms. */
export function proposeWeeklyNutrition(d: CoachFleetDossier): WeeklyNutritionProposal {
  if (!nutritionFollowingPlan(d)) {
    return { action: 'relance', reason: 'not_following', draft: null };
  }

  const weight = d.weight_end_kg || d.weight_kg;
  const base = d.calorie_target > 0 ? d.calorie_target : Math.round(d.avg_calories) || 2000;
  const goal = normalizeGoal(d.goal);
  const current = currentOrIssnDraft(d);

  if (signsOfFatigue(d)) {
    return { action: 'calorie_adjustment', reason: 'carb_support', draft: shiftCarbsKeepCalories(current) };
  }

  const delta = d.weight_delta_kg;
  const pct = weeklyWeightPct(delta, d.weight_start_kg ?? d.weight_kg);

  if (goal === 'cut') {
    if (pct != null && pct <= -CUT_TOO_FAST_PCT_PER_WEEK) {
      return {
        action: 'calorie_adjustment',
        reason: 'too_fast_cut',
        draft: completeMacrosFor(clampCalories(base + WEEKLY_SMALL_KCAL), d.goal, weight),
      };
    }
    if (delta != null && delta >= CUT_GAIN_MIN_DELTA_KG) {
      return {
        action: 'calorie_adjustment',
        reason: 'cut_gain',
        draft: completeMacrosFor(clampCalories(base - WEEKLY_LARGE_KCAL), d.goal, weight),
      };
    }
    if (delta != null && delta >= CUT_STALL_MIN_DELTA_KG) {
      return {
        action: 'calorie_adjustment',
        reason: 'cut_stall',
        draft: completeMacrosFor(clampCalories(base - WEEKLY_SMALL_KCAL), d.goal, weight),
      };
    }
    return { action: 'keep', reason: 'keep', draft: null };
  }

  if (goal === 'bulk') {
    if (pct != null && pct >= BULK_TOO_FAST_PCT_PER_WEEK) {
      return {
        action: 'calorie_adjustment',
        reason: 'bulk_too_fast',
        draft: completeMacrosFor(clampCalories(base - WEEKLY_SMALL_KCAL), d.goal, weight),
      };
    }
    if (delta != null && delta <= 0.1) {
      return {
        action: 'calorie_adjustment',
        reason: 'bulk_stall',
        draft: completeMacrosFor(clampCalories(base + WEEKLY_SMALL_KCAL), d.goal, weight),
      };
    }
    return { action: 'keep', reason: 'keep', draft: null };
  }

  if (delta != null && Math.abs(delta) >= 1.5) {
    const dir = delta > 0 ? -WEEKLY_SMALL_KCAL : WEEKLY_SMALL_KCAL;
    return {
      action: 'calorie_adjustment',
      reason: delta > 0 ? 'cut_gain' : 'bulk_stall',
      draft: completeMacrosFor(clampCalories(base + dir), d.goal, weight),
    };
  }
  return { action: 'keep', reason: 'keep', draft: null };
}

function nutritionFollowingPlan(d: CoachFleetDossier): boolean {
  if (d.calorie_target <= 0 || d.logged_nutrition_days < MIN_NUTRITION_LOG_DAYS) return false;
  const ratio = overeatRatio(d.avg_calories, d.calorie_target);
  if (ratio >= OVEREAT_RATIO || ratio <= UNDER_EAT_RATIO) return false;
  const adh = adherenceOnFive(d.avg_adherence_nutrition);
  if (adh != null && adh <= 2) return false;
  return true;
}

function offGoal(d: CoachFleetDossier): boolean {
  const goal = normalizeGoal(d.goal);
  const delta = d.weight_delta_kg;
  if (delta == null) return false;
  if (goal === 'cut') return delta >= CUT_STALL_MIN_DELTA_KG;
  if (goal === 'bulk') return delta <= 0.1;
  if (goal === 'maintain') return Math.abs(delta) >= 1.5;
  return false;
}

function tooFast(d: CoachFleetDossier): boolean {
  const goal = normalizeGoal(d.goal);
  const pct = weeklyWeightPct(d.weight_delta_kg, d.weight_start_kg ?? d.weight_kg);
  if (pct == null) return false;
  if (goal === 'cut') return pct <= -CUT_TOO_FAST_PCT_PER_WEEK;
  if (goal === 'bulk') return pct >= BULK_TOO_FAST_PCT_PER_WEEK;
  return false;
}

function expectedWorkouts(d: CoachFleetDossier): number {
  const freq = d.training_frequency > 0 ? d.training_frequency : 3;
  return Math.round(freq * (FLEET_WINDOW_DAYS / 7));
}

function isGhostAt(d: CoachFleetDossier, today: string): boolean {
  if (d.linked_days < 7) return false;
  const stale = (iso: string | null) => {
    if (!iso) return true;
    const day = iso.slice(0, 10);
    const a = Date.parse(`${day}T00:00:00Z`);
    const b = Date.parse(`${today}T00:00:00Z`);
    if (!Number.isFinite(a) || !Number.isFinite(b)) return true;
    return Math.round((b - a) / 86_400_000) > GHOST_IDLE_DAYS;
  };
  return stale(d.last_workout_at) && stale(d.last_nutrition_at) && stale(d.last_checkin_at);
}

/** Calendar days since an ISO timestamp. Null / unparsable → Infinity (never happened). */
function idleDays(iso: string | null, today: string): number {
  if (!iso) return Number.POSITIVE_INFINITY;
  const day = iso.slice(0, 10);
  const a = Date.parse(`${day}T00:00:00Z`);
  const b = Date.parse(`${today}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return Number.POSITIVE_INFINITY;
  return Math.round((b - a) / 86_400_000);
}

/** Clinical on_track + coach silent ≥7d + no keep-in-touch handled this week. Pending is refreshed, not skipped. */
function shouldOfferKeepInTouch(d: CoachFleetDossier, today: string): boolean {
  if (idleDays(d.last_coach_message_at, today) < KEEP_IN_TOUCH_DAYS) return false;
  if (d.pending_fleet) return true;
  if (idleDays(d.last_keep_in_touch_at, today) < KEEP_IN_TOUCH_DAYS) return false;
  return true;
}

export function fleetSignalKey(kind: string, flag: string): string {
  return `${kind}:${flag || kind}`;
}

export function fleetEvidenceFromDossier(d: CoachFleetDossier): CoachFleetEvidence {
  const day = (iso: string | null) => (iso ? iso.slice(0, 10) : null);
  return {
    avg_calories: Math.round(d.avg_calories),
    logged_nutrition_days: d.logged_nutrition_days,
    workout_count: d.workout_count,
    checkin_count: d.checkin_count,
    weight_delta_kg: d.weight_delta_kg,
    last_nutrition_at: day(d.last_nutrition_at),
    last_workout_at: day(d.last_workout_at),
    last_checkin_at: day(d.last_checkin_at),
  };
}

export function withFleetEvidence(d: CoachFleetDossier, card: CoachFleetCard): CoachFleetCard {
  const evidence = fleetEvidenceFromDossier(d);
  return {
    ...card,
    payload: {
      ...card.payload,
      evidence,
      avg_calories: evidence.avg_calories,
      logged_nutrition_days: evidence.logged_nutrition_days,
      workout_count: evidence.workout_count,
    },
  };
}

function newerDay(next: string | null, prev: string | null): boolean {
  if (!next || !prev) return false;
  return next.slice(0, 10) > prev.slice(0, 10);
}

/** New week of overeating, new missed block, new activity — not the same snapshot tomorrow. */
export function fleetEvidenceChanged(
  prev: CoachFleetEvidence | null | undefined,
  next: CoachFleetEvidence,
  flag: string,
): boolean {
  if (flag === 'keep_in_touch') return false;
  if (!prev) return false;
  if (Math.abs((next.avg_calories || 0) - (prev.avg_calories || 0)) >= 150) return true;
  if ((next.logged_nutrition_days || 0) - (prev.logged_nutrition_days || 0) >= 3) return true;
  if (Math.abs((next.workout_count || 0) - (prev.workout_count || 0)) >= 2) return true;
  if (
    next.weight_delta_kg != null
    && prev.weight_delta_kg != null
    && Math.abs(next.weight_delta_kg - prev.weight_delta_kg) >= 0.4
  ) return true;
  if (newerDay(next.last_nutrition_at, prev.last_nutrition_at)) return true;
  if (newerDay(next.last_workout_at, prev.last_workout_at)) return true;
  if (newerDay(next.last_checkin_at, prev.last_checkin_at)) return true;
  return false;
}

export function findHandledSignal(
  handled: CoachFleetHandled[] | null | undefined,
  kind: string,
  flag: string,
): CoachFleetHandled | null {
  const key = fleetSignalKey(kind, flag);
  const rows = handled ?? [];
  return rows.find(row => fleetSignalKey(row.kind, row.flag) === key) ?? null;
}

export type FleetWriteAction = 'skip' | 'upsert' | 'insert';

/**
 * Upsert-or-skip: pending → refresh in place. Handled same signal within ~7d
 * with unchanged facts → skip (never reopen sent/dismissed). New evidence → insert.
 */
export function planFleetRoundCard(
  d: CoachFleetDossier,
  today: string,
  locale: FleetLocale = 'fr',
): { action: FleetWriteAction; card: CoachFleetCard | null } {
  const raw = buildFleetCardInner(d, today, locale);
  if (!raw) return { action: 'skip', card: null };
  const card = withFleetEvidence(d, raw);
  if (d.pending_fleet) return { action: 'upsert', card };
  const prev = findHandledSignal(d.fleet_handled, card.kind, card.flag);
  if (prev && idleDays(prev.handled_at, today) < FLEET_HANDLE_COOLDOWN_DAYS) {
    const next = fleetEvidenceFromDossier(d);
    if (!fleetEvidenceChanged(prev.evidence, next, card.flag)) {
      return { action: 'skip', card: null };
    }
  }
  return { action: 'insert', card };
}

export function buildFleetCard(d: CoachFleetDossier, today: string, locale: FleetLocale = 'fr'): CoachFleetCard | null {
  const card = buildFleetCardInner(d, today, locale);
  if (!card) return null;
  return withFleetEvidence(d, card);
}

function missedTraining(d: CoachFleetDossier): boolean {
  const expected = expectedWorkouts(d);
  if (expected <= 0) return false;
  return d.workout_count <= Math.max(0, Math.floor(expected * 0.4));
}

/**
 * One clinical flag per client. `on_track` stays correct for Camille / Léa.
 * Contact is separate: on_track + coach silent ≥7d → keep_in_touch card (not a stall).
 * Order is locked: setup → first week → ghost → nutrition adherence → training → too fast → adherent stall.
 */
export function classifyFleetDossier(d: CoachFleetDossier, today: string): CoachFleetFlag {
  if (!d.onboarding_completed || (!d.has_program && !d.setup_completed)) {
    return 'onboarding';
  }
  // Alex: already onboarded with a program, J+5, 0 séances → setup, not a stall.
  if (d.linked_days < NEW_CLIENT_DAYS && d.workout_count === 0) {
    return 'onboarding';
  }
  if (isGhostAt(d, today)) return 'ghost';

  const following = nutritionFollowingPlan(d);
  const off = offGoal(d);
  const fast = tooFast(d);

  if (!following && d.logged_nutrition_days >= MIN_NUTRITION_LOG_DAYS && (off || adherenceOnFive(d.avg_adherence_nutrition) != null && (adherenceOnFive(d.avg_adherence_nutrition) ?? 5) <= 2)) {
    return 'adherence_nutrition';
  }
  if (!following && d.calorie_target > 0 && d.logged_nutrition_days >= MIN_NUTRITION_LOG_DAYS && overeatRatio(d.avg_calories, d.calorie_target) >= OVEREAT_RATIO) {
    return 'adherence_nutrition';
  }
  if (missedTraining(d) && d.workout_count + d.checkin_count + d.logged_nutrition_days > 0) {
    return 'adherence_training';
  }
  if (fast) return 'too_fast';
  if (following && off) return 'stall_adherent';
  return 'on_track';
}

function fmtDelta(delta: number | null): string {
  if (delta == null) return '—';
  return delta > 0 ? `+${delta}` : String(delta);
}

function goalKey(goal: string): FleetGoalKey {
  const g = normalizeGoal(goal);
  return g === 'cut' || g === 'bulk' ? g : 'other';
}

function relanceMessage(
  flag: CoachFleetFlag,
  d: CoachFleetDossier,
  copy: FleetCopy,
): { body: string; templateKey: CoachNudgeTemplateKey } {
  const name = firstName(d.full_name, copy);
  const target = d.calorie_target;
  if (flag === 'adherence_nutrition') {
    return {
      templateKey: 'missed_checkins',
      body: target > 0 ? copy.relance.nutritionOverTarget(name, target) : copy.relance.nutritionOffPlan(name),
    };
  }
  if (flag === 'ghost') {
    return { templateKey: 'general_followup', body: copy.relance.ghost(name) };
  }
  if (flag === 'too_fast') {
    return {
      templateKey: 'general_followup',
      body: copy.relance.tooFast(name, copy.relance.tooFastTip[goalKey(d.goal)], FLEET_WINDOW_DAYS),
    };
  }
  return { templateKey: 'missed_training', body: copy.relance.training(name) };
}

function calorieAdjustmentCard(
  d: CoachFleetDossier,
  flag: CoachFleetFlag,
  proposal: WeeklyNutritionProposal,
  observation: string,
  copy: FleetCopy,
): CoachFleetCard | null {
  if (proposal.action !== 'calorie_adjustment' || !proposal.draft || !isCompleteCalorieDraft(proposal.draft)) {
    return null;
  }
  const name = firstName(d.full_name, copy);
  const tweak = proposal.draft;
  const reason = proposal.reason;
  const cause = copy.kcal.cause[reason] || copy.kcal.defaultCause;
  const title = copy.kcal.title[reason]?.(name) ?? copy.kcal.defaultTitle(name);
  const ratio = overeatRatio(d.avg_calories, d.calorie_target);
  const pctWeek = weeklyWeightPct(d.weight_delta_kg, d.weight_start_kg ?? d.weight_kg);
  return {
    flag,
    kind: 'calorie_adjustment',
    title,
    observation,
    cause,
    rationale: `${cause} ${tweak.calories} / P${tweak.protein} C${tweak.carbs} F${tweak.fat}.`,
    payload: {
      source: FLEET_SOURCE,
      flag,
      observation,
      cause,
      reason,
      why: {
        from: Math.round(d.calorie_target),
        to: tweak.calories,
        delta: fmtDelta(d.weight_delta_kg),
        pct: ratio > 0 ? Math.round(ratio * 100) : 0,
        pctWeek: pctWeek == null ? '—' : Math.abs(Math.round(pctWeek * 10) / 10),
        avg: Math.round(d.avg_calories),
        loggedDays: d.logged_nutrition_days,
        window: FLEET_WINDOW_DAYS,
        carbs: tweak.carbs,
      },
      nutrition: tweak,
      calories: tweak.calories,
      protein: tweak.protein,
      carbs: tweak.carbs,
      fat: tweak.fat,
    },
  };
}

function buildFleetCardInner(d: CoachFleetDossier, today: string, locale: FleetLocale): CoachFleetCard | null {
  const copy = FLEET_COPY[locale] ?? FLEET_COPY.fr;
  const clinical = classifyFleetDossier(d, today);
  const name = firstName(d.full_name, copy);
  const proposal = proposeWeeklyNutrition(d);
  const avg = Math.round(d.avg_calories);

  if (clinical === 'on_track') {
    if (proposal.action === 'calorie_adjustment' && proposal.reason === 'carb_support') {
      const observation = copy.kcal.carbSupportObservation(d.calorie_target, avg, fmtDelta(d.weight_delta_kg));
      return calorieAdjustmentCard(d, 'on_track', proposal, observation, copy);
    }
    if (!shouldOfferKeepInTouch(d, today)) return null;
    const silentDays = idleDays(d.last_coach_message_at, today);
    const observation = Number.isFinite(silentDays)
      ? copy.keepInTouch.observationSilent(silentDays)
      : copy.keepInTouch.observationNoMessage;
    const cause = copy.keepInTouch.cause;
    const body = copy.keepInTouch.body(name);
    return {
      flag: 'keep_in_touch',
      kind: 'keep_in_touch',
      title: copy.keepInTouch.title(name),
      observation,
      cause,
      rationale: cause,
      payload: {
        source: FLEET_SOURCE,
        flag: 'keep_in_touch',
        observation,
        cause,
        body,
        notes: body,
        template_key: 'general_followup',
      },
    };
  }

  const flag = clinical;
  const ratio = overeatRatio(d.avg_calories, d.calorie_target);
  const adh = adherenceOnFive(d.avg_adherence_nutrition);
  const delta = fmtDelta(d.weight_delta_kg);

  if (flag === 'onboarding') {
    const observation = !d.onboarding_completed
      ? copy.onboarding.observationIncomplete
      : !d.has_program
        ? copy.onboarding.observationNoProgram
        : copy.onboarding.observationNoSession(d.linked_days);
    const cause = d.has_program ? copy.onboarding.causeFirstWeek : copy.onboarding.causeNoPlan;
    const title = d.has_program ? copy.onboarding.titleFirstWeek(name) : copy.onboarding.titleSetup(name);
    return {
      flag,
      kind: 'onboarding_plan',
      title,
      observation,
      cause,
      rationale: copy.onboarding.rationale,
      payload: {
        source: FLEET_SOURCE,
        flag,
        observation,
        cause,
        notes: copy.onboarding.notes(name),
      },
    };
  }

  if (flag === 'adherence_nutrition') {
    const relance = relanceMessage(flag, d, copy);
    const observation = d.calorie_target > 0
      ? copy.nutrition.observationTarget(d.calorie_target, avg, d.logged_nutrition_days, adh, delta)
      : copy.nutrition.observationOffPlan(d.logged_nutrition_days, delta);
    const over = d.calorie_target > 0 && ratio >= OVEREAT_RATIO;
    const cause = over ? copy.nutrition.causeOverTarget(d.calorie_target) : copy.nutrition.causeOffPlan;
    const title = d.calorie_target > 0 ? copy.nutrition.titleOverTarget(d.calorie_target) : copy.nutrition.titleOffPlan;
    return {
      flag,
      kind: 'adherence_nutrition',
      title,
      observation,
      cause,
      rationale: cause,
      payload: {
        source: FLEET_SOURCE,
        flag,
        observation,
        cause,
        body: relance.body,
        notes: relance.body,
        template_key: relance.templateKey,
        current_calories: d.calorie_target,
        avg_calories: avg,
      },
    };
  }

  if (flag === 'ghost' || flag === 'adherence_training') {
    const relance = relanceMessage(flag, d, copy);
    const observation = flag === 'ghost'
      ? copy.training.observationGhost(GHOST_IDLE_DAYS)
      : copy.training.observationMissed(d.workout_count, expectedWorkouts(d), FLEET_WINDOW_DAYS);
    const cause = flag === 'ghost' ? copy.training.causeGhost : copy.training.causeMissed;
    return {
      flag,
      kind: 'adherence_training',
      title: flag === 'ghost' ? copy.training.titleGhost(name) : copy.training.titleMissed(name),
      observation,
      cause,
      rationale: cause,
      payload: {
        source: FLEET_SOURCE,
        flag,
        observation,
        cause,
        body: relance.body,
        notes: relance.body,
        template_key: relance.templateKey,
      },
    };
  }

  if (flag === 'too_fast') {
    const following = nutritionFollowingPlan(d);
    const goal = goalKey(d.goal);
    const observation = copy.tooFast.observation(delta, FLEET_WINDOW_DAYS, d.calorie_target, avg);
    const cause = copy.tooFast.cause[goal];
    const title = goal === 'cut' ? copy.tooFast.titleCut(name) : copy.tooFast.titleBulk(name);
    if (following) {
      const card = calorieAdjustmentCard(d, flag, proposal, observation, copy);
      if (card) return card;
    }
    const relance = relanceMessage(flag, d, copy);
    const fullCause = `${cause} ${copy.tooFast.relanceSuffix}`;
    return {
      flag,
      kind: 'adherence_nutrition',
      title,
      observation,
      cause: fullCause,
      rationale: `${cause} ${copy.tooFast.rationaleSuffix}`,
      payload: {
        source: FLEET_SOURCE,
        flag,
        observation,
        cause: fullCause,
        body: relance.body,
        notes: relance.body,
        template_key: relance.templateKey,
      },
    };
  }

  // stall_adherent — following the plan, still off-goal. Complete macros only.
  const observation = copy.kcal.stallObservation(d.calorie_target, avg, d.logged_nutrition_days, delta);
  return calorieAdjustmentCard(d, flag, proposal, observation, copy);
}

export function isRelanceKind(kind: CoachInterventionKind): boolean {
  return RELANCE_KINDS.has(kind);
}

export function isFleetIntervention(row: Pick<CoachIntervention, 'source' | 'payload'>): boolean {
  return row.source === FLEET_SOURCE || row.payload?.source === FLEET_SOURCE;
}

export function parseFleetObservation(payload: unknown, fallback = ''): string {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return fallback;
  const row = payload as Record<string, unknown>;
  return typeof row.observation === 'string' && row.observation.trim() ? row.observation : fallback;
}

/** One-line coach cause — never a JSON blob, stack, or prompt/log dump. */
export function isHumanCoachCause(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const s = value.trim();
  if (!s || s.length > 180) return false;
  if (s.split(/\n/).length > 2) return false;
  if (/[{[]/.test(s) && /[}\]]/.test(s)) return false;
  if (/\d{4}-\d{2}-\d{2}T\d{2}:/.test(s)) return false;
  if (/^\s*(error|traceback|console\.|at \w+)/i.test(s)) return false;
  if (/"kind"\s*:|"payload"\s*:|"drafting"\s*:/.test(s)) return false;
  return true;
}

export function parseFleetCause(payload: unknown, fallback = ''): string {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return isHumanCoachCause(fallback) ? fallback.trim() : '';
  }
  const row = payload as Record<string, unknown>;
  if (isHumanCoachCause(row.cause)) return String(row.cause).trim();
  if (isHumanCoachCause(fallback)) return fallback.trim();
  return '';
}

export function parsePreparedMessage(payload: unknown, fallback = ''): string {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return fallback;
  const row = payload as Record<string, unknown>;
  if (typeof row.body === 'string' && row.body.trim()) return row.body;
  if (typeof row.notes === 'string' && row.notes.trim()) return row.notes;
  return fallback;
}

export function preparedTemplateKey(payload: unknown, kind: CoachInterventionKind): CoachNudgeTemplateKey {
  if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
    const key = (payload as Record<string, unknown>).template_key;
    if (key === 'missed_training' || key === 'missed_checkins' || key === 'general_followup') return key;
  }
  if (kind === 'adherence_training') return 'missed_training';
  if (kind === 'adherence_nutrition') return 'missed_checkins';
  if (kind === 'keep_in_touch') return 'general_followup';
  return 'general_followup';
}

export function mapTriageRow(raw: Record<string, unknown>): CoachFleetDossier | null {
  const clientId = typeof raw.client_id === 'string' ? raw.client_id : '';
  const coachId = typeof raw.coach_id === 'string' ? raw.coach_id : '';
  if (!clientId || !coachId) return null;
  const dossierRaw = raw.dossier && typeof raw.dossier === 'object' && !Array.isArray(raw.dossier)
    ? raw.dossier as Record<string, unknown>
    : raw;
  const num = (v: unknown, fallback = 0) => {
    const n = typeof v === 'number' ? v : Number(v);
    return Number.isFinite(n) ? n : fallback;
  };
  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v : null);
  return {
    coach_id: coachId,
    client_id: clientId,
    full_name: typeof dossierRaw.full_name === 'string' ? dossierRaw.full_name : '',
    goal: typeof dossierRaw.goal === 'string' ? dossierRaw.goal : '',
    onboarding_completed: dossierRaw.onboarding_completed === true,
    has_program: dossierRaw.has_program === true,
    setup_completed: dossierRaw.setup_completed === true,
    linked_days: num(dossierRaw.linked_days),
    training_frequency: num(dossierRaw.training_frequency),
    calorie_target: num(dossierRaw.calorie_target),
    protein_target: num(dossierRaw.protein_target),
    carbs_target: num(dossierRaw.carbs_target),
    fat_target: num(dossierRaw.fat_target),
    weight_kg: num(dossierRaw.weight_kg),
    logged_nutrition_days: num(dossierRaw.logged_nutrition_days),
    avg_calories: num(dossierRaw.avg_calories),
    last_nutrition_at: str(dossierRaw.last_nutrition_at),
    workout_count: num(dossierRaw.workout_count),
    last_workout_at: str(dossierRaw.last_workout_at),
    checkin_count: num(dossierRaw.checkin_count),
    last_checkin_at: str(dossierRaw.last_checkin_at),
    avg_adherence_nutrition: dossierRaw.avg_adherence_nutrition == null ? null : num(dossierRaw.avg_adherence_nutrition),
    avg_adherence_training: dossierRaw.avg_adherence_training == null ? null : num(dossierRaw.avg_adherence_training),
    weight_start_kg: dossierRaw.weight_start_kg == null ? null : num(dossierRaw.weight_start_kg),
    weight_end_kg: dossierRaw.weight_end_kg == null ? null : num(dossierRaw.weight_end_kg),
    weight_delta_kg: dossierRaw.weight_delta_kg == null ? null : num(dossierRaw.weight_delta_kg),
    last_message_at: str(dossierRaw.last_message_at),
    last_coach_message_at: str(dossierRaw.last_coach_message_at),
    last_keep_in_touch_at: str(dossierRaw.last_keep_in_touch_at),
    pending_fleet: dossierRaw.pending_fleet === true,
    fleet_handled: parseFleetHandled(dossierRaw.fleet_handled),
  };
}

function parseFleetHandled(raw: unknown): CoachFleetHandled[] {
  if (!Array.isArray(raw)) return [];
  const rows: CoachFleetHandled[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const row = item as Record<string, unknown>;
    const kind = typeof row.kind === 'string' ? row.kind : '';
    const flag = typeof row.flag === 'string' ? row.flag : kind;
    const handledAt = typeof row.handled_at === 'string' ? row.handled_at : '';
    if (!kind || !handledAt) continue;
    const evRaw = row.evidence && typeof row.evidence === 'object' && !Array.isArray(row.evidence)
      ? row.evidence as Record<string, unknown>
      : null;
    const numOrNull = (v: unknown) => {
      if (v == null || v === '') return null;
      const n = typeof v === 'number' ? v : Number(v);
      return Number.isFinite(n) ? n : null;
    };
    const strOrNull = (v: unknown) => (typeof v === 'string' && v.trim() ? v : null);
    rows.push({
      kind,
      flag,
      status: typeof row.status === 'string' ? row.status : '',
      handled_at: handledAt,
      evidence: evRaw ? {
        avg_calories: numOrNull(evRaw.avg_calories) ?? 0,
        logged_nutrition_days: numOrNull(evRaw.logged_nutrition_days) ?? 0,
        workout_count: numOrNull(evRaw.workout_count) ?? 0,
        checkin_count: numOrNull(evRaw.checkin_count) ?? 0,
        weight_delta_kg: numOrNull(evRaw.weight_delta_kg),
        last_nutrition_at: strOrNull(evRaw.last_nutrition_at),
        last_workout_at: strOrNull(evRaw.last_workout_at),
        last_checkin_at: strOrNull(evRaw.last_checkin_at),
      } : null,
    });
  }
  return rows;
}
