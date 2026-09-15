import type { ProgressPhoto } from '../../../lib/types';

export type PhotoCompareKind = 'empty' | 'single' | 'pair';

export function sortedProgressPhotos(photos: ProgressPhoto[]): ProgressPhoto[] {
  return [...photos].sort((a, b) => (
    a.taken_at.localeCompare(b.taken_at)
    || a.created_at.localeCompare(b.created_at)
    || a.id.localeCompare(b.id)
  ));
}

export function photoCompareKind(photos: ProgressPhoto[]): PhotoCompareKind {
  if (photos.length === 0) return 'empty';
  if (photos.length === 1) return 'single';
  return 'pair';
}

/** Oldest vs newest. Coach can override with ids. Never requires a matching angle. */
export function defaultComparePair(photos: ProgressPhoto[]): {
  oldest: ProgressPhoto | null;
  newest: ProgressPhoto | null;
} {
  const sorted = sortedProgressPhotos(photos);
  if (sorted.length === 0) return { oldest: null, newest: null };
  if (sorted.length === 1) return { oldest: sorted[0], newest: null };
  return { oldest: sorted[0], newest: sorted[sorted.length - 1] };
}

export function resolveComparePair(
  photos: ProgressPhoto[],
  oldestId?: string,
  newestId?: string,
): { oldest: ProgressPhoto | null; newest: ProgressPhoto | null } {
  const sorted = sortedProgressPhotos(photos);
  const defaults = defaultComparePair(sorted);
  const oldest = (oldestId ? sorted.find(p => p.id === oldestId) : null) ?? defaults.oldest;
  const newest = (newestId ? sorted.find(p => p.id === newestId) : null) ?? defaults.newest;
  return { oldest, newest };
}
