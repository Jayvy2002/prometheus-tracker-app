import { foldText, namesMatch } from './coachText';
import type { AiProgramDayDraft, ProgramExerciseDraft, ProgramExercisePatch } from './types';

export interface ProgramNlProposal {
  raw: string;
  patch: ProgramExercisePatch;
  before: ProgramExerciseDraft | null;
  after: ProgramExerciseDraft;
  dayIndex: number;
  exerciseIndex: number;
  weekday: number;
  summaryKey: string;
  summaryParams: Record<string, string | number>;
}

const WEEKDAY_ALIASES: Record<number, string[]> = {
  0: ['dimanche', 'sunday', 'dim', 'sun'],
  1: ['lundi', 'monday', 'lun', 'mon'],
  2: ['mardi', 'tuesday', 'mar', 'tue'],
  3: ['mercredi', 'wednesday', 'mer', 'wed'],
  4: ['jeudi', 'thursday', 'jeu', 'thu'],
  5: ['vendredi', 'friday', 'ven', 'fri'],
  6: ['samedi', 'saturday', 'sam', 'sat'],
};

function parseWeekday(raw: string): number | null {
  const f = foldText(raw);
  for (const [day, aliases] of Object.entries(WEEKDAY_ALIASES)) {
    if (aliases.some(a => f.includes(foldText(a)))) return Number(day);
  }
  return null;
}

const SETS_RE = /(\d+)\s*[x×]\s*(\d+)(?:\s*[-–àto]+\s*(\d+))?/i;
const RIR_RE = /rir\s*(\d(?:[.,]\d)?)/i;
const REST_RE = /(\d+)\s*(s|sec|secs|secondes?)/i;

function findExercise(
  days: AiProgramDayDraft[],
  hint: string,
  weekday: number | null,
): { dayIndex: number; exerciseIndex: number } | null {
  const searchDays = weekday == null
    ? days.map((_, i) => i)
    : days.map((d, i) => (d.weekday === weekday ? i : -1)).filter(i => i >= 0);
  const pool = searchDays.length ? searchDays : days.map((_, i) => i);
  for (const di of pool) {
    const day = days[di];
    const ei = day.exercises.findIndex(ex => namesMatch(ex.name, hint));
    if (ei >= 0) return { dayIndex: di, exerciseIndex: ei };
  }
  return null;
}

function liftHintFrom(raw: string): string {
  return raw
    .replace(SETS_RE, ' ')
    .replace(RIR_RE, ' ')
    .replace(REST_RE, ' ')
    .replace(/\b(passe|met|change|set|put|update|to|a|à|from|partir|de|du|des|le|la|les|l'|the|starting)\b/gi, ' ')
    .replace(/\b(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export type ProgramNlFailReason = 'empty' | 'noParse' | 'noMatch';

export type ProgramNlParseResult =
  | { ok: true; proposal: ProgramNlProposal }
  | { ok: false; reason: ProgramNlFailReason };

export function parseProgramNl(raw: string, days: AiProgramDayDraft[]): ProgramNlParseResult {
  const q = raw.trim();
  if (!q) return { ok: false, reason: 'empty' };
  const sets = q.match(SETS_RE);
  const weekday = parseWeekday(q);
  const hint = liftHintFrom(q);
  if (!sets || !hint) return { ok: false, reason: 'noParse' };
  const found = findExercise(days, hint, weekday);
  if (!found) return { ok: false, reason: 'noMatch' };
  const day = days[found.dayIndex];
  const before = day.exercises[found.exerciseIndex];
  const default_sets = Math.max(1, Number(sets[1]));
  const low = Math.max(1, Number(sets[2]));
  const high = sets[3] ? Math.max(low, Number(sets[3])) : low;
  const rirMatch = q.match(RIR_RE);
  const restMatch = q.match(REST_RE);
  const after: ProgramExerciseDraft = {
    ...before,
    default_sets,
    default_reps: high,
    default_reps_min: high === low ? before.default_reps_min ?? null : low,
    default_rir: rirMatch ? Number(rirMatch[1].replace(',', '.')) : before.default_rir,
    default_rest_seconds: restMatch ? Number(restMatch[1]) : before.default_rest_seconds,
  };
  return {
    ok: true,
    proposal: {
      raw: q,
      patch: {
        exercise: before.name,
        weekday: day.weekday,
        default_sets: after.default_sets,
        default_reps: after.default_reps,
        default_reps_min: after.default_reps_min,
        default_rir: after.default_rir ?? null,
        default_rest_seconds: after.default_rest_seconds,
      },
      before,
      after,
      dayIndex: found.dayIndex,
      exerciseIndex: found.exerciseIndex,
      weekday: day.weekday,
      summaryKey: 'coaching.programNl.summary',
      summaryParams: {
        lift: before.name,
        sets: after.default_sets,
        reps: after.default_reps_min && after.default_reps_min !== after.default_reps
          ? `${after.default_reps_min}-${after.default_reps}`
          : String(after.default_reps),
        rir: after.default_rir ?? '—',
      },
    },
  };
}

export function applyProgramProposal(days: AiProgramDayDraft[], proposal: ProgramNlProposal): AiProgramDayDraft[] {
  return days.map((d, di) => {
    if (di !== proposal.dayIndex) return d;
    return {
      ...d,
      exercises: d.exercises.map((ex, ei) => (ei === proposal.exerciseIndex ? proposal.after : ex)),
    };
  });
}

export function formatPrescription(ex: ProgramExerciseDraft): string {
  const reps = ex.default_reps_min && ex.default_reps_min !== ex.default_reps
    ? `${ex.default_reps_min}–${ex.default_reps}`
    : String(ex.default_reps);
  const rir = ex.default_rir != null ? ` RIR${ex.default_rir}` : '';
  return `${ex.default_sets}×${reps}${rir}`;
}
