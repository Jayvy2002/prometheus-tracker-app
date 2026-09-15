export type MuscleTone = 'idle' | 'primary' | 'secondary';

export const MANNEQUIN_IDLE = '#f4f4f5';
export const MANNEQUIN_PRIMARY = '#ef4444';
export const MANNEQUIN_SECONDARY = '#fb7185';
export const MANNEQUIN_STROKE = '#a1a1aa';

/** Ids drawn on the SVG. Aliases expand a library id onto several regions. */
export const FRONT_MUSCLE_IDS = [
  'chest', 'upper_chest', 'lower_chest',
  'front_delts', 'side_delts', 'shoulders',
  'biceps', 'forearms',
  'core', 'obliques',
  'quadriceps', 'hip_flexors', 'adductors', 'abductors',
] as const;

export const BACK_MUSCLE_IDS = [
  'traps', 'lats', 'rhomboids', 'rear_delts', 'rotator_cuff',
  'triceps', 'lower_back',
  'glutes', 'hamstrings', 'calves',
] as const;

const ALIASES: Record<string, readonly string[]> = {
  shoulders: ['front_delts', 'side_delts', 'rear_delts', 'shoulders'],
  chest: ['chest'],
  rotator_cuff: ['rotator_cuff', 'rear_delts'],
};

export function expandedMuscleIds(ids: readonly string[]): Set<string> {
  const out = new Set<string>();
  for (const id of ids) {
    out.add(id);
    for (const alias of ALIASES[id] ?? []) out.add(alias);
  }
  return out;
}

export function muscleTone(
  id: string,
  primary: readonly string[],
  secondary: readonly string[],
): MuscleTone {
  const prim = expandedMuscleIds(primary);
  if (prim.has(id)) return 'primary';
  const sec = expandedMuscleIds(secondary);
  if (sec.has(id)) return 'secondary';
  return 'idle';
}

export function fillForTone(tone: MuscleTone): string {
  if (tone === 'primary') return MANNEQUIN_PRIMARY;
  if (tone === 'secondary') return MANNEQUIN_SECONDARY;
  return MANNEQUIN_IDLE;
}

export function mannequinShouldShowBack(primary: readonly string[], secondary: readonly string[]): boolean {
  const wanted = expandedMuscleIds([...primary, ...secondary]);
  return BACK_MUSCLE_IDS.some(id => wanted.has(id));
}

export function mannequinShouldShowFront(primary: readonly string[], secondary: readonly string[]): boolean {
  const wanted = expandedMuscleIds([...primary, ...secondary]);
  if (wanted.size === 0) return true;
  return FRONT_MUSCLE_IDS.some(id => wanted.has(id));
}
