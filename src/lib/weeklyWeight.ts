/** Moyenne des 7 derniers jours et écart avec les 7 jours d'avant. */
export function weeklyAverageKg(
  rows: { measured_at: string; weight_kg: number }[],
  today: string,
): { current: number | null; deltaKg: number | null } {
  const day = (iso: string) => iso.slice(0, 10);
  const shift = (iso: string, days: number) => {
    const d = new Date(`${day(iso)}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  };
  const todayDay = day(today);
  const avg = (from: string, to: string) => {
    const slice = rows.filter(row => {
      const measured = day(row.measured_at);
      return measured >= from && measured <= to;
    });
    if (slice.length === 0) return null;
    return slice.reduce((sum, row) => sum + Number(row.weight_kg), 0) / slice.length;
  };
  const current = avg(shift(todayDay, -6), todayDay);
  const previous = avg(shift(todayDay, -13), shift(todayDay, -7));
  return {
    current,
    deltaKg: current != null && previous != null ? +(current - previous).toFixed(1) : null,
  };
}
