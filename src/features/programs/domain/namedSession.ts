/** UX22 — séance identifiable (jour de semaine + nom, ou nom seul en mode ordre). */

export function namedSessionLine(weekdayLabel: string, name?: string | null): string {
  const day = weekdayLabel.trim();
  const session = (name ?? '').trim();
  if (day && session) return `${day} · ${session}`;
  return session || day;
}

export function programSessionLabel(
  day: { weekday?: number | null; name?: string | null; order_index?: number },
  weekdayLabel: (weekday: number) => string,
  fallback = '',
): string {
  const name = (day.name ?? '').trim() || fallback;
  if (typeof day.weekday === 'number') {
    return namedSessionLine(weekdayLabel(day.weekday), name);
  }
  return name;
}
