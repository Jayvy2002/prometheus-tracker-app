import type { Exercise } from '../../../lib/types';

export function findCatalogExercise(
  exercises: readonly Exercise[],
  name: string,
): Exercise | undefined {
  const q = catalogKey(name);
  if (!q) return undefined;
  return exercises.find(e =>
    catalogKey(e.name) === q
    || (e.name_fr && catalogKey(e.name_fr) === q),
  );
}

/**
 * Accents and case do not change an exercise: sessions logged as
 * « Developpe couche » keep matching the catalog's « Développé couché ».
 */
function catalogKey(name: string): string {
  return name.trim().normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

export function catalogHasExecutionMedia(ex: Pick<Exercise, 'video_url' | 'primary_muscles'>): boolean {
  return Boolean(ex.video_url?.trim()) && ex.primary_muscles.length > 0;
}
