/**
 * Mensurations (Vision §14.4) : tours par site, une valeur par site et par
 * jour. Chaque site a sa propre tendance ; aucun score, aucun « bon » sens.
 * Stockage en cm, affichage dans l'unité de taille du profil.
 */
import { parseDecimalInput } from '../../workout/domain/workoutSetComplete';

export const MEASUREMENT_SITES = [
  'neck',
  'shoulders',
  'chest',
  'waist',
  'hips',
  'arm_left',
  'arm_right',
  'forearm',
  'thigh_left',
  'thigh_right',
  'calf',
] as const;

export type MeasurementSite = typeof MEASUREMENT_SITES[number];
export type LengthUnit = 'cm' | 'in';

/** Same bounds as the database check. */
export const MEASURE_MIN_CM = 10;
export const MEASURE_MAX_CM = 300;

export interface BodyMeasurement {
  id: string;
  user_id: string;
  measured_at: string;
  site: MeasurementSite;
  value_cm: number;
  note: string;
}

export interface SiteSummary {
  site: MeasurementSite;
  latest: BodyMeasurement;
  /** Change since the previous value of the same site; null with a single value. */
  deltaCm: number | null;
  /** Oldest → newest, for the site's own trend. */
  series: number[];
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

export function cmToUnit(cm: number, unit: LengthUnit): number {
  return unit === 'in' ? round1(cm / 2.54) : round1(cm);
}

export function unitToCm(value: number, unit: LengthUnit): number {
  return unit === 'in' ? round1(value * 2.54) : round1(value);
}

export function isMeasurementSite(value: string): value is MeasurementSite {
  return (MEASUREMENT_SITES as readonly string[]).includes(value);
}

/**
 * One summary per site that has at least one value, in the fixed body order.
 * Sites never measured are absent, not zero.
 */
export function summarizeBySite(rows: BodyMeasurement[]): SiteSummary[] {
  const bySite = new Map<MeasurementSite, BodyMeasurement[]>();
  for (const row of rows) {
    if (!isMeasurementSite(row.site)) continue;
    const list = bySite.get(row.site) ?? [];
    list.push(row);
    bySite.set(row.site, list);
  }
  const summaries: SiteSummary[] = [];
  for (const site of MEASUREMENT_SITES) {
    const list = bySite.get(site);
    if (!list?.length) continue;
    const sorted = [...list].sort((a, b) => a.measured_at.localeCompare(b.measured_at));
    const latest = sorted[sorted.length - 1];
    const previous = sorted.length > 1 ? sorted[sorted.length - 2] : null;
    summaries.push({
      site,
      latest,
      deltaCm: previous ? round1(Number(latest.value_cm) - Number(previous.value_cm)) : null,
      series: sorted.map(row => Number(row.value_cm)),
    });
  }
  return summaries;
}

/** Days that carry at least one measurement, for the calendar. */
export function measurementDays(rows: BodyMeasurement[]): Map<string, number> {
  const days = new Map<string, number>();
  for (const row of rows) days.set(row.measured_at, (days.get(row.measured_at) ?? 0) + 1);
  return days;
}

export type MeasurementDraft = Partial<Record<MeasurementSite, string>>;

export interface MeasurementEntry {
  site: MeasurementSite;
  value_cm: number;
}

/**
 * Turns the typed form into rows. Empty fields are skipped (measuring two
 * sites is a complete entry); an invalid field blocks the save and is named.
 */
export function buildMeasurementEntries(
  draft: MeasurementDraft,
  unit: LengthUnit,
): { entries: MeasurementEntry[]; invalid: MeasurementSite[] } {
  const entries: MeasurementEntry[] = [];
  const invalid: MeasurementSite[] = [];
  for (const site of MEASUREMENT_SITES) {
    const raw = (draft[site] ?? '').trim();
    if (!raw) continue;
    const value = parseDecimalInput(raw);
    const cm = Number.isFinite(value) ? unitToCm(value, unit) : Number.NaN;
    if (!Number.isFinite(cm) || cm < MEASURE_MIN_CM || cm > MEASURE_MAX_CM) {
      invalid.push(site);
      continue;
    }
    entries.push({ site, value_cm: cm });
  }
  return { entries, invalid };
}

/** Prefills the form with what was already saved for that day (correction), in the display format. */
export function draftForDay(
  rows: BodyMeasurement[],
  day: string,
  unit: LengthUnit,
  format: (value: number) => string = String,
): MeasurementDraft {
  const draft: MeasurementDraft = {};
  for (const row of rows) {
    if (row.measured_at !== day || !isMeasurementSite(row.site)) continue;
    draft[row.site] = format(cmToUnit(Number(row.value_cm), unit));
  }
  return draft;
}
