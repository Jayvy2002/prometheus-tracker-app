/** UX54 — audience réelle des photos, pas un 5ᵉ interrupteur tracking. */

export type AthletePhotoAudience = 'solo' | 'coached';

export function athletePhotoAudience(hasCoach: boolean): AthletePhotoAudience {
  return hasCoach ? 'coached' : 'solo';
}

export function athletePhotoSubtitleKey(audience: AthletePhotoAudience): 'coaching.photos.subtitleSolo' | 'coaching.photos.subtitleCoached' {
  return audience === 'coached' ? 'coaching.photos.subtitleCoached' : 'coaching.photos.subtitleSolo';
}

/** Current coach (`is_coach_of`) reads every row — no date cut at the link. */
export function currentCoachSeesPhotoHistory(): true {
  return true;
}

export function photoTakenBeforeLink(takenAt: string, linkedAt: string | null | undefined): boolean {
  if (!linkedAt) return false;
  return takenAt.slice(0, 10) < linkedAt.slice(0, 10);
}

export function hasPhotosBeforeLink(
  photos: Array<{ taken_at: string }>,
  linkedAt: string | null | undefined,
): boolean {
  return photos.some(photo => photoTakenBeforeLink(photo.taken_at, linkedAt));
}
