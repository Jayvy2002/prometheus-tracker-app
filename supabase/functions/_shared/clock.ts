/** YYYY-MM-DD in an IANA timezone. Falls back to UTC on a bad zone name. */
export function todayInTimeZone(now: Date, timeZone: string | null | undefined): string {
  const tz = (timeZone ?? "").trim() || "UTC";
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(now);
    const p = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${p.year}-${p.month}-${p.day}`;
  } catch {
    return now.toISOString().slice(0, 10);
  }
}

/** HH:MM (24h) in an IANA timezone. Falls back to UTC. */
export function hhmmInTimeZone(now: Date, timeZone: string | null | undefined): string {
  const tz = (timeZone ?? "").trim() || "UTC";
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: tz,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(now);
    const p = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${p.hour}:${p.minute}`;
  } catch {
    const h = String(now.getUTCHours()).padStart(2, "0");
    const m = String(now.getUTCMinutes()).padStart(2, "0");
    return `${h}:${m}`;
  }
}
