import { calculateMacros } from './utils';
import { parseCalorieDraft, isCompleteCalorieDraft, type CalorieDraft } from './coachInterventions';
import { firstNameOf } from './coachQueue';
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

const RELANCE_KINDS = new Set<CoachInterventionKind>([
  'adherence_nutrition',
  'adherence_training',
  'keep_in_touch',
]);

export function firstName(full: string): string {
  return firstNameOf(full) || full.trim() || 'toi';
}

/** Check-ins are 1–5 in the coach UI, 0–100 in the original column check. */
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

export function completeMacrosFor(calories: number, goal: string, weightKg: number): CalorieDraft {
  const macros = calculateMacros(calories, normalizeGoal(goal) || 'maintain', undefined, weightKg || undefined);
  return {
    calories: Math.round(calories),
    protein: Math.max(1, macros.protein),
    carbs: Math.max(1, macros.carbs),
    fat: Math.max(1, macros.fat),
  };
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

function keepInTouchLooksLikeLecture(body: string): boolean {
  return /\b(kcal|calories?|macros?|stagne|descends)\b/i.test(body);
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
  modelUsed: 'openai' | 'off' = 'off',
): { action: FleetWriteAction; card: CoachFleetCard | null } {
  const raw = buildFleetCardInner(d, today, modelUsed);
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

export function buildFleetCard(d: CoachFleetDossier, today: string, modelUsed: 'openai' | 'off' = 'off'): CoachFleetCard | null {
  const card = buildFleetCardInner(d, today, modelUsed);
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

function relanceMessage(flag: CoachFleetFlag, d: CoachFleetDossier): { body: string; templateKey: CoachNudgeTemplateKey } {
  const name = firstName(d.full_name);
  const target = d.calorie_target;
  if (flag === 'adherence_nutrition') {
    return {
      templateKey: 'missed_checkins',
      body: target > 0
        ? `Salut ${name}, tes logs sont clairement au-dessus des ${target} kcal qu’on a posés. On ne touche pas encore à la cible : d’abord on l’applique. Tu me dis ce qui bloque (faim, resto, week-end) et on ajuste le plan autour, pas les chiffres.`
        : `Salut ${name}, tes logs nutrition ne suivent pas le plan. On n’invente pas une nouvelle cible — dis-moi ce qui bloque et on recale la semaine.`,
    };
  }
  if (flag === 'ghost') {
    return {
      templateKey: 'general_followup',
      body: `Salut ${name}, je ne te vois plus sur l’app depuis un moment (séances, check-ins, nutrition). Tout va bien ? Réponds-moi quand tu peux — on reprend sans te charger.`,
    };
  }
  if (flag === 'too_fast') {
    const goal = normalizeGoal(d.goal);
    const tip = goal === 'cut'
      ? 'tu perds un peu vite'
      : goal === 'bulk'
        ? 'tu prends un peu vite'
        : 'le rythme sort de la trajectoire';
    return {
      templateKey: 'general_followup',
      body: `Salut ${name}, ${tip} sur les ${FLEET_WINDOW_DAYS} derniers jours. On en parle avant de toucher aux cibles — comment tu te sens (faim, énergie, séances) ?`,
    };
  }
  return {
    templateKey: 'missed_training',
    body: `Salut ${name}, je n’ai pas vu tes séances récemment. Tout va bien de ton côté ? Dis-moi si on ajuste le programme ou le timing.`,
  };
}

function calorieTweak(d: CoachFleetDossier, direction: 'cut_more' | 'cut_less' | 'bulk_more' | 'bulk_less'): CalorieDraft {
  const base = d.calorie_target > 0 ? d.calorie_target : Math.round(d.avg_calories) || 2000;
  const delta = direction === 'cut_more' || direction === 'bulk_less' ? -150 : 150;
  const calories = Math.min(8000, Math.max(800, base + delta));
  return completeMacrosFor(calories, d.goal, d.weight_end_kg || d.weight_kg);
}

function buildFleetCardInner(d: CoachFleetDossier, today: string, modelUsed: 'openai' | 'off' = 'off'): CoachFleetCard | null {
  const clinical = classifyFleetDossier(d, today);
  const name = firstName(d.full_name);
  const aiOff = modelUsed === 'off';

  if (clinical === 'on_track') {
    if (!shouldOfferKeepInTouch(d, today)) return null;
    const silentDays = idleDays(d.last_coach_message_at, today);
    const observation = Number.isFinite(silentDays)
      ? `Ça va côté logs. Pas de contact coach depuis ${silentDays} jours.`
      : 'Ça va côté logs. Pas de message coach dans le fil.';
    const cause = 'Garder le lien — pas un stall, pas une lecture calories.';
    const body = `Salut ${name}, petit check de la semaine — comment tu vas ? L’entraînement passe bien, et tu as besoin de quelque chose ?`;
    return {
      flag: 'keep_in_touch',
      kind: 'keep_in_touch',
      title: `Prendre des nouvelles de ${name}`,
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
        ai_off: aiOff,
      },
    };
  }

  const flag = clinical;
  const ratio = overeatRatio(d.avg_calories, d.calorie_target);
  const adh = adherenceOnFive(d.avg_adherence_nutrition);
  const delta = fmtDelta(d.weight_delta_kg);

  if (flag === 'onboarding') {
    const observation = !d.onboarding_completed
      ? 'Nouveau client, onboarding incomplet.'
      : !d.has_program
        ? 'Onboarding fait, pas encore de programme assigné.'
        : `Nouveau client (J+${d.linked_days}), aucune séance encore.`;
    const cause = d.has_program
      ? 'Première semaine — setup, pas un stall.'
      : 'Pas un stall : il n’a pas encore de plan à suivre.';
    const title = d.has_program
      ? `${name} — première semaine`
      : `${name} — configurer le plan`;
    return {
      flag,
      kind: 'onboarding_plan',
      title,
      observation,
      cause,
      rationale: 'Nouveau client — setup, pas une relance de stall.',
      payload: {
        source: FLEET_SOURCE,
        flag,
        observation,
        cause,
        ai_off: aiOff,
        notes: `Configure le suivi et le programme de ${name}. Les calories ISSN du profil restent en place tant que tu ne les écris pas.`,
      },
    };
  }

  if (flag === 'adherence_nutrition') {
    const relance = relanceMessage(flag, d);
    const observation = d.calorie_target > 0
      ? `Cible ${d.calorie_target} kcal, logs ~${Math.round(d.avg_calories)} (${d.logged_nutrition_days} j)${adh != null ? `, adhérence ${adh}/5` : ''}, poids ${delta} kg.`
      : `Logs nutrition hors plan (${d.logged_nutrition_days} j), poids ${delta} kg.`;
    const cause = d.calorie_target > 0 && ratio >= OVEREAT_RATIO
      ? `Il n’applique pas les ${d.calorie_target} — on ne coupe pas les calories tant que le plan n’est pas suivi.`
      : 'Le plan nutrition n’est pas suivi. Relancer, pas une nouvelle cible.';
    const title = d.calorie_target > 0
      ? `Il n’applique pas les ${d.calorie_target}`
      : 'Il n’applique pas le plan nutrition';
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
        ai_off: aiOff,
        current_calories: d.calorie_target,
        avg_calories: Math.round(d.avg_calories),
      },
    };
  }

  if (flag === 'ghost' || flag === 'adherence_training') {
    const relance = relanceMessage(flag, d);
    const observation = flag === 'ghost'
      ? `Pas de séance, check-in ni nutrition depuis plus de ${GHOST_IDLE_DAYS} jours.`
      : `Séances ${d.workout_count}/${expectedWorkouts(d)} sur ${FLEET_WINDOW_DAYS} jours.`;
    const cause = flag === 'ghost'
      ? 'Client ghost — Relancer, pas de nutrition inventée, pas de chiffres de récup.'
      : 'Séances manquées — Relancer, pas un nouveau programme.';
    const title = flag === 'ghost' ? `${name} a disparu` : `${name} ne suit pas les séances`;
    return {
      flag,
      kind: 'adherence_training',
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
        ai_off: aiOff,
      },
    };
  }

  if (flag === 'too_fast') {
    const following = nutritionFollowingPlan(d);
    const goal = normalizeGoal(d.goal);
    const observation = `Poids ${delta} kg sur ${FLEET_WINDOW_DAYS} j${d.calorie_target ? `, logs ~${Math.round(d.avg_calories)} vs ${d.calorie_target}` : ''}.`;
    const cause = goal === 'cut'
      ? 'Cut trop rapide.'
      : goal === 'bulk'
        ? 'Bulk trop rapide.'
        : 'Rythme hors trajectoire.';
    if (following) {
      const tweak = calorieTweak(
        d,
        goal === 'cut' ? 'cut_less' : goal === 'bulk' ? 'bulk_less' : 'cut_less',
      );
      const title = goal === 'cut' ? `${name} perd trop vite` : `${name} prend trop vite`;
      return {
        flag,
        kind: 'calorie_adjustment',
        title,
        observation,
        cause: `${cause} Il suit le plan — tweak de cible complet, pas un 0/0/0.`,
        rationale: `${cause} Cibles proposées ${tweak.calories} / P${tweak.protein} C${tweak.carbs} F${tweak.fat}.`,
        payload: {
          source: FLEET_SOURCE,
          flag,
          observation,
          cause: `${cause} Il suit le plan.`,
          ai_off: aiOff,
          nutrition: tweak,
          calories: tweak.calories,
          protein: tweak.protein,
          carbs: tweak.carbs,
          fat: tweak.fat,
        },
      };
    }
    const relance = relanceMessage(flag, d);
    const title = goal === 'cut' ? `${name} perd trop vite` : `${name} prend trop vite`;
    return {
      flag,
      kind: 'adherence_nutrition',
      title,
      observation,
      cause: `${cause} Relancer avant de toucher aux cibles.`,
      rationale: `${cause} Relancer.`,
      payload: {
        source: FLEET_SOURCE,
        flag,
        observation,
        cause: `${cause} Relancer avant de toucher aux cibles.`,
        body: relance.body,
        notes: relance.body,
        template_key: relance.templateKey,
        ai_off: aiOff,
      },
    };
  }

  // stall_adherent — following the plan, still off-goal. Complete macros only.
  const goal = normalizeGoal(d.goal);
  const tweak = calorieTweak(
    d,
    goal === 'cut' ? 'cut_more' : goal === 'bulk' ? 'bulk_more' : 'cut_more',
  );
  const observation = `Cible ${d.calorie_target} kcal, logs ~${Math.round(d.avg_calories)} (${d.logged_nutrition_days} j), poids ${delta} kg. Plan suivi.`;
  const cause = 'Il applique le plan et reste hors objectif — tweak de cible, macros complètes.';
  return {
    flag,
    kind: 'calorie_adjustment',
    title: goal === 'cut' ? `${name} stagne malgré l’adhérence` : `${name} ne progresse pas malgré l’adhérence`,
    observation,
    cause,
    rationale: cause,
    payload: {
      source: FLEET_SOURCE,
      flag,
      observation,
      cause,
      ai_off: aiOff,
      nutrition: tweak,
      calories: tweak.calories,
      protein: tweak.protein,
      carbs: tweak.carbs,
      fat: tweak.fat,
    },
  };
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

export function parseFleetCause(payload: unknown, fallback = ''): string {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return fallback;
  const row = payload as Record<string, unknown>;
  return typeof row.cause === 'string' && row.cause.trim() ? row.cause : fallback;
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

export function sanitizeLlmCard(
  raw: Record<string, unknown>,
  d: CoachFleetDossier,
  today: string,
): CoachFleetCard | null {
  const fallback = buildFleetCard(d, today, 'openai');
  if (!fallback) return null;
  const flag = fallback.flag;
  let kind = typeof raw.kind === 'string' ? raw.kind : fallback.kind;
  if (flag === 'adherence_nutrition' && kind === 'calorie_adjustment') {
    kind = 'adherence_nutrition';
  }
  if (flag === 'ghost' && (kind === 'calorie_adjustment' || kind === 'adherence_nutrition' || kind === 'keep_in_touch')) {
    kind = 'adherence_training';
  }
  if (flag === 'keep_in_touch') {
    kind = 'keep_in_touch';
  }
  if (flag === 'onboarding' && kind !== 'onboarding_plan') {
    kind = 'onboarding_plan';
  }
  const title = typeof raw.title === 'string' && raw.title.trim() ? raw.title.trim() : fallback.title;
  const observation = typeof raw.observation === 'string' && raw.observation.trim()
    ? raw.observation.trim()
    : fallback.observation;
  const cause = typeof raw.cause === 'string' && raw.cause.trim() ? raw.cause.trim() : fallback.cause;
  const body = typeof raw.body === 'string' && raw.body.trim()
    ? raw.body.trim()
    : parsePreparedMessage(fallback.payload);

  if (kind === 'calorie_adjustment') {
    if (flag === 'adherence_nutrition' || flag === 'ghost' || flag === 'adherence_training' || flag === 'keep_in_touch') {
      return fallback;
    }
    const nested = raw.nutrition && typeof raw.nutrition === 'object' ? raw.nutrition as Record<string, unknown> : raw;
    const draft = parseCalorieDraft({
      calories: nested.calories,
      protein: nested.protein,
      carbs: nested.carbs,
      fat: nested.fat,
    });
    if (!isCompleteCalorieDraft(draft)) {
      return {
        ...fallback,
        kind: 'calorie_adjustment',
        payload: {
          ...fallback.payload,
          nutrition: fallback.payload.nutrition ?? completeMacrosFor(
            d.calorie_target || 2000,
            d.goal,
            d.weight_kg,
          ),
        },
      };
    }
    return {
      flag,
      kind: 'calorie_adjustment',
      title,
      observation,
      cause,
      rationale: cause,
      payload: {
        source: FLEET_SOURCE,
        flag,
        observation,
        cause,
        ai_off: false,
        nutrition: draft,
        calories: draft!.calories,
        protein: draft!.protein,
        carbs: draft!.carbs,
        fat: draft!.fat,
      },
    };
  }

  return {
    flag,
    kind: (kind === 'onboarding_plan' || kind === 'adherence_nutrition' || kind === 'adherence_training' || kind === 'keep_in_touch'
      ? kind
      : fallback.kind) as CoachInterventionKind,
    title,
    observation,
    cause,
    rationale: cause,
    payload: {
      ...fallback.payload,
      observation,
      cause,
      body: flag === 'keep_in_touch' && keepInTouchLooksLikeLecture(body) ? parsePreparedMessage(fallback.payload) : body,
      notes: flag === 'keep_in_touch' && keepInTouchLooksLikeLecture(body) ? parsePreparedMessage(fallback.payload) : body,
      ai_off: false,
    },
  };
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
