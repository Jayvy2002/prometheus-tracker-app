/** Initials for circular avatar fallbacks (coach chrome, etc.). */
export function profileInitials(fullName: string | null | undefined, fallback = '?'): string {
  const parts = (fullName || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return fallback;
  return parts
    .map(part => part[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}
