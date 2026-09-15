import { foldText } from '../../../lib/coachText';
import type { Exercise } from '../../../lib/types';
import { rankExercises } from './pickerSearch';

export const RECENT_EXERCISES_KEY = 'prometheus-recent-exercises';
export const RECENT_EXERCISES_LIMIT = 8;

export const EQUIPMENT_ORDER = [
  'barbell',
  'dumbbell',
  'kettlebell',
  'cable',
  'machine',
  'band',
  'bodyweight',
  'other',
] as const;

export type ExerciseFamilyKey =
  | 'bench'
  | 'squat'
  | 'deadlift'
  | 'row'
  | 'pull'
  | 'fly'
  | 'lunge'
  | 'curl'
  | 'tricep'
  | 'raise'
  | 'hip'
  | 'calf'
  | 'shrug'
  | 'carry'
  | 'core'
  | 'dip'
  | 'ohp';

const FAMILIES: Array<{ key: ExerciseFamilyKey; needles: string[] }> = [
  { key: 'bench', needles: ['incline bench', 'decline bench', 'bench press', 'dumbbell press', 'developpe couche', 'developpe incline', 'developpe decline', 'developpe halteres'] },
  { key: 'ohp', needles: ['overhead press', 'military press', 'developpe militaire', 'shoulder press'] },
  { key: 'squat', needles: ['bulgarian split squat', 'hack squat', 'split squat', 'squat bulgare', 'squat'] },
  { key: 'deadlift', needles: ['romanian deadlift', 'deadlift', 'souleve de terre'] },
  { key: 'row', needles: ['barbell row', 'cable row', 'bent over row', 'rowing', 'tirage horizontal'] },
  { key: 'pull', needles: ['lat pulldown', 'tirage vertical', 'pull-up', 'pull up', 'chin-up', 'chin up', 'traction'] },
  { key: 'fly', needles: ['dumbbell fly', 'cable fly', 'ecarte'] },
  { key: 'lunge', needles: ['lunge', 'fente'] },
  { key: 'curl', needles: ['bicep curl', 'curl biceps'] },
  { key: 'tricep', needles: ['tricep extension', 'extension triceps'] },
  { key: 'raise', needles: ['lateral raise', 'elevation laterale', 'side raise'] },
  { key: 'hip', needles: ['hip thrust', 'pont fessier'] },
  { key: 'calf', needles: ['calf raise', 'mollets'] },
  { key: 'shrug', needles: ['shrug', 'haussement'] },
  { key: 'carry', needles: ['farmer walk', 'marche du fermier'] },
  { key: 'core', needles: ['plank', 'gainage'] },
  { key: 'dip', needles: ['dip', 'dips'] },
];

export type PickerSection =
  | { kind: 'recents'; exercises: Exercise[] }
  | { kind: 'family'; family: ExerciseFamilyKey; exercises: Exercise[] }
  | { kind: 'rest'; exercises: Exercise[] };

export type ExercisePickerModel = {
  sections: PickerSection[];
  equipmentOptions: string[];
};

function hasPhrase(hay: string, needle: string): boolean {
  return hay === needle
    || hay.startsWith(`${needle} `)
    || hay.endsWith(` ${needle}`)
    || hay.includes(` ${needle} `);
}

export function exerciseFamilyKey(ex: Pick<Exercise, 'name' | 'name_fr'>): ExerciseFamilyKey | null {
  const hay = `${foldText(ex.name)} ${foldText(ex.name_fr)}`.trim();
  for (const family of FAMILIES) {
    if (family.needles.some(needle => hasPhrase(hay, foldText(needle)))) return family.key;
  }
  return null;
}

export function parseRecentExerciseNames(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const out: string[] = [];
    const seen = new Set<string>();
    for (const item of parsed) {
      if (typeof item !== 'string') continue;
      const name = item.trim();
      if (!name) continue;
      const key = foldText(name);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push(name);
      if (out.length >= RECENT_EXERCISES_LIMIT) break;
    }
    return out;
  } catch {
    return [];
  }
}

export function serializeRecentExerciseNames(names: string[]): string {
  return JSON.stringify(names.slice(0, RECENT_EXERCISES_LIMIT));
}

export function pushRecentExerciseName(existing: string[], name: string): string[] {
  const next = name.trim();
  if (!next) return existing.slice(0, RECENT_EXERCISES_LIMIT);
  const key = foldText(next);
  return [next, ...existing.filter(item => foldText(item) !== key)].slice(0, RECENT_EXERCISES_LIMIT);
}

export function loadRecentExerciseNames(): string[] {
  try {
    return parseRecentExerciseNames(localStorage.getItem(RECENT_EXERCISES_KEY));
  } catch {
    return [];
  }
}

export function rememberExerciseName(name: string): string[] {
  const next = pushRecentExerciseName(loadRecentExerciseNames(), name);
  try {
    localStorage.setItem(RECENT_EXERCISES_KEY, serializeRecentExerciseNames(next));
  } catch {
    // ignore
  }
  return next;
}

export function namesFromWorkouts(
  workouts: Array<{
    date?: string;
    created_at?: string;
    exercises?: Array<{ name: string }>;
  }>,
): string[] {
  const sorted = [...workouts].sort((a, b) =>
    (b.date || b.created_at || '').localeCompare(a.date || a.created_at || ''),
  );
  const out: string[] = [];
  const seen = new Set<string>();
  for (const workout of sorted) {
    for (const exercise of workout.exercises ?? []) {
      const name = exercise.name.trim();
      if (!name) continue;
      const key = foldText(name);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(name);
    }
  }
  return out;
}

export function mergeRecentNames(picked: string[], fromHistory: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const name of [...picked, ...fromHistory]) {
    const trimmed = name.trim();
    if (!trimmed) continue;
    const key = foldText(trimmed);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
    if (out.length >= RECENT_EXERCISES_LIMIT) break;
  }
  return out;
}

export function catalogMatchesForNames(catalog: readonly Exercise[], names: string[]): Exercise[] {
  const out: Exercise[] = [];
  const used = new Set<string>();
  for (const name of names) {
    const key = foldText(name);
    if (!key) continue;
    const hit = catalog.find(ex =>
      foldText(ex.name) === key || foldText(ex.name_fr) === key,
    );
    if (!hit || used.has(hit.id)) continue;
    used.add(hit.id);
    out.push(hit);
  }
  return out;
}

export function filterExercisesByEquipment(
  exercises: readonly Exercise[],
  equipment: string | 'all',
): Exercise[] {
  if (equipment === 'all') return [...exercises];
  return exercises.filter(ex => ex.equipment === equipment);
}

function equipmentRank(equipment: string): number {
  const idx = EQUIPMENT_ORDER.indexOf(equipment as typeof EQUIPMENT_ORDER[number]);
  return idx === -1 ? EQUIPMENT_ORDER.length : idx;
}

function uniqueEquipment(exercises: readonly Exercise[]): string[] {
  const present = new Set(exercises.map(ex => ex.equipment));
  return EQUIPMENT_ORDER.filter(item => present.has(item));
}

function sortFamily(exercises: Exercise[], recentIds: Set<string>): Exercise[] {
  return [...exercises].sort((a, b) => {
    const recentA = recentIds.has(a.id) ? 0 : 1;
    const recentB = recentIds.has(b.id) ? 0 : 1;
    if (recentA !== recentB) return recentA - recentB;
    const eq = equipmentRank(a.equipment) - equipmentRank(b.equipment);
    if (eq !== 0) return eq;
    return a.name.localeCompare(b.name);
  });
}

export function composeExercisePicker(input: {
  catalog: Exercise[];
  query: string;
  recentNames: string[];
  equipment: string | 'all';
  lang?: string;
}): ExercisePickerModel {
  const searched = input.query.trim()
    ? rankExercises(input.catalog, input.query, input.lang ?? 'fr')
    : [...input.catalog];
  const equipmentOptions = uniqueEquipment(searched);
  const pool = filterExercisesByEquipment(searched, input.equipment);
  const recents = catalogMatchesForNames(pool, input.recentNames);
  const recentIds = new Set(recents.map(ex => ex.id));
  const firstIndex = new Map(pool.map((ex, index) => [ex.id, index]));

  const buckets = new Map<ExerciseFamilyKey, Exercise[]>();
  for (const ex of pool) {
    const family = exerciseFamilyKey(ex);
    if (!family) continue;
    const list = buckets.get(family) ?? [];
    list.push(ex);
    buckets.set(family, list);
  }

  const familyOrder = [...buckets.entries()]
    .map(([family, exercises]) => ({
      family,
      exercises,
      first: Math.min(...exercises.map(ex => firstIndex.get(ex.id) ?? 0)),
    }))
    .sort((a, b) => a.first - b.first);

  const sections: PickerSection[] = [];
  if (recents.length > 0) sections.push({ kind: 'recents', exercises: recents });

  const shownInFamily = new Set<string>();
  for (const row of familyOrder) {
    if (row.exercises.length < 2) continue;
    sections.push({
      kind: 'family',
      family: row.family,
      exercises: sortFamily(row.exercises, recentIds),
    });
    for (const ex of row.exercises) shownInFamily.add(ex.id);
  }

  const rest = pool.filter(ex => !recentIds.has(ex.id) && !shownInFamily.has(ex.id));
  if (rest.length > 0) sections.push({ kind: 'rest', exercises: rest });

  return { sections, equipmentOptions };
}

export function isRecentExercise(ex: Pick<Exercise, 'name' | 'name_fr'>, recentNames: string[]): boolean {
  const keys = new Set(recentNames.map(foldText).filter(Boolean));
  return keys.has(foldText(ex.name)) || keys.has(foldText(ex.name_fr));
}

export function pickerRowTestId(ex: Pick<Exercise, 'name'>): string {
  return `exercise-picker-${foldText(ex.name).replace(/\s+/g, '-')}`;
}
