import type { Exercise } from '../../../lib/types';

export function findCatalogExercise(
  exercises: readonly Exercise[],
  name: string,
): Exercise | undefined {
  const q = name.trim().toLowerCase();
  if (!q) return undefined;
  return exercises.find(e =>
    e.name.toLowerCase() === q
    || (e.name_fr && e.name_fr.toLowerCase() === q),
  );
}

export function catalogHasExecutionMedia(ex: Pick<Exercise, 'video_url' | 'primary_muscles'>): boolean {
  return Boolean(ex.video_url?.trim()) && ex.primary_muscles.length > 0;
}
