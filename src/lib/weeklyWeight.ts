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

/**
 * Trend line: for each weigh-in, the mean of the weigh-ins of the 7 days
 * ending that day. Daily water swings stay visible as dots, the decision
 * reads the line.
 */
export function rollingWeightTrend(
  rows: { measured_at: string; weight_kg: number }[],
  windowDays = 7,
): { day: string; weight_kg: number; trend_kg: number }[] {
  const day = (iso: string) => iso.slice(0, 10);
  const sorted = [...rows].sort((a, b) => day(a.measured_at).localeCompare(day(b.measured_at)));
  const startOf = (iso: string) => {
    const d = new Date(`${day(iso)}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - (windowDays - 1));
    return d.toISOString().slice(0, 10);
  };
  return sorted.map(row => {
    const end = day(row.measured_at);
    const from = startOf(row.measured_at);
    const slice = sorted.filter(other => {
      const d = day(other.measured_at);
      return d >= from && d <= end;
    });
    const mean = slice.reduce((sum, other) => sum + Number(other.weight_kg), 0) / slice.length;
    return { day: end, weight_kg: Number(row.weight_kg), trend_kg: Math.round(mean * 100) / 100 };
  });
}
