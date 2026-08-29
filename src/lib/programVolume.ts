import type { Exercise, ProgramExerciseDraft } from './types';
import { foldText, namesMatch } from './coachText';

const SESSION_VOLUME_WARN = 16;

export interface MuscleVolume {
  muscle: string;
  sets: number;
}

export function muscleForExercise(name: string, library: Exercise[]): string | null {
  const hit = library.find(ex => namesMatch(ex.name, name) || namesMatch(ex.name_fr, name));
  const primary = hit?.primary_muscles?.[0];
  return primary || null;
}

export function sessionMuscleVolume(
  exercises: ProgramExerciseDraft[],
  library: Exercise[],
): MuscleVolume[] {
  if (library.length === 0) return [];
  const map = new Map<string, number>();
  let matched = 0;
  for (const ex of exercises) {
    const muscle = muscleForExercise(ex.name, library);
    if (!muscle) continue;
    matched += 1;
    map.set(muscle, (map.get(muscle) ?? 0) + Math.max(0, ex.default_sets || 0));
  }
  if (matched === 0) return [];
  return [...map.entries()]
    .map(([muscle, sets]) => ({ muscle, sets }))
    .sort((a, b) => b.sets - a.sets);
}

export function volumeWarnings(volumes: MuscleVolume[]): MuscleVolume[] {
  return volumes.filter(v => v.sets >= SESSION_VOLUME_WARN);
}

export function weekMuscleVolume(
  days: Array<{ exercises: ProgramExerciseDraft[] }>,
  library: Exercise[],
): MuscleVolume[] {
  const map = new Map<string, number>();
  for (const day of days) {
    for (const row of sessionMuscleVolume(day.exercises, library)) {
      map.set(row.muscle, (map.get(row.muscle) ?? 0) + row.sets);
    }
  }
  return [...map.entries()]
    .map(([muscle, sets]) => ({ muscle, sets }))
    .sort((a, b) => b.sets - a.sets);
}

export function foldExerciseKey(name: string): string {
  return foldText(name);
}
