/** UX22 — séance identifiable (weekday + nom). Pas un moteur de phases. */

export function namedSessionLine(weekdayLabel: string, name?: string | null): string {
  const day = weekdayLabel.trim();
  const session = (name ?? '').trim();
  if (day && session) return `${day} · ${session}`;
  return session || day;
}
