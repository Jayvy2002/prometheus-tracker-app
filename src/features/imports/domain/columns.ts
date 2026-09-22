import { looksLikeFormula } from './csvParse';

export const IMPORT_KINDS = ['workout', 'body_weight'] as const;
export type ImportKind = (typeof IMPORT_KINDS)[number];

export const COLUMN_ROLES = [
  'date',
  'exercise',
  'set_index',
  'reps',
  'exercise_load',
  'body_weight',
  'rir',
  'rpe',
  'notes',
  'session_name',
  'unit',
] as const;
export type ColumnRole = (typeof COLUMN_ROLES)[number];

export type DateFormat = 'iso' | 'dmy' | 'mdy';
export type MeasureUnit = 'kg' | 'lb';
export type RpeMode = 'notes' | 'convert_to_rir';

export type ColumnDetection = {
  index: number;
  header: string;
  confidence: 'certain' | 'ambiguous' | 'unknown';
  candidates: ColumnRole[];
};

export type ImportMapping = {
  kind: ImportKind;
  delimiter: ',' | ';' | '\t';
  date_format: DateFormat;
  load_unit: MeasureUnit;
  body_weight_unit: MeasureUnit;
  rpe_mode: RpeMode;
  columns: Partial<Record<ColumnRole, number>>;
  ignored: number[];
};

const CERTAIN: Array<{ role: ColumnRole; tokens: string[] }> = [
  { role: 'date', tokens: ['date', 'jour', 'day', 'logged_at', 'measured_at'] },
  { role: 'exercise', tokens: ['exercise', 'exercice', 'movement', 'mouvement', 'lift'] },
  { role: 'set_index', tokens: ['set', 'serie', 'série', 'set_index'] },
  { role: 'reps', tokens: ['reps', 'rep', 'repetitions', 'répétitions'] },
  { role: 'rir', tokens: ['rir'] },
  { role: 'rpe', tokens: ['rpe'] },
  { role: 'notes', tokens: ['notes', 'note', 'comment', 'commentaire'] },
  { role: 'session_name', tokens: ['session', 'workout', 'seance', 'séance'] },
  { role: 'unit', tokens: ['unit', 'unite', 'unité', 'units'] },
];

const AMBIGUOUS_WEIGHT = ['weight', 'poids', 'wt', 'load', 'charge'];

function normalizeHeader(header: string): string {
  return header.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

export function detectColumns(headers: string[]): ColumnDetection[] {
  return headers.map((header, index) => {
    const token = normalizeHeader(header);
    if (!token) {
      return { index, header, confidence: 'unknown', candidates: [] };
    }
    if (AMBIGUOUS_WEIGHT.includes(token)) {
      return { index, header, confidence: 'ambiguous', candidates: ['exercise_load', 'body_weight'] };
    }
    const hits = CERTAIN.filter((entry) => entry.tokens.includes(token)).map((entry) => entry.role);
    if (hits.length === 1) {
      return { index, header, confidence: 'certain', candidates: hits };
    }
    if (hits.length > 1) {
      return { index, header, confidence: 'ambiguous', candidates: hits };
    }
    return { index, header, confidence: 'unknown', candidates: [] };
  });
}

export function headerGroup(detection: ColumnDetection): string | null {
  if (detection.confidence === 'certain' && detection.candidates[0]) return detection.candidates[0];
  if (
    detection.confidence === 'ambiguous'
    && detection.candidates.includes('exercise_load')
    && detection.candidates.includes('body_weight')
  ) {
    return 'weight';
  }
  return null;
}

export function columnResolved(index: number, mapping: ImportMapping): boolean {
  return mapping.ignored.includes(index) || Object.values(mapping.columns).includes(index);
}

export function unresolvedDuplicateHeaders(
  detections: ColumnDetection[],
  mapping: ImportMapping,
): ColumnDetection[] {
  const groups = new Map<string, ColumnDetection[]>();
  for (const detection of detections) {
    const group = headerGroup(detection);
    if (!group) continue;
    const list = groups.get(group) ?? [];
    list.push(detection);
    groups.set(group, list);
  }
  const unresolved: ColumnDetection[] = [];
  for (const list of groups.values()) {
    if (list.length < 2) continue;
    for (const detection of list) {
      if (!columnResolved(detection.index, mapping)) unresolved.push(detection);
    }
  }
  return unresolved;
}

export function proposeMapping(
  kind: ImportKind,
  detections: ColumnDetection[],
  delimiter: ImportMapping['delimiter'],
): ImportMapping {
  const columns: Partial<Record<ColumnRole, number>> = {};
  const ignored: number[] = [];
  const groupCount = new Map<string, number>();
  for (const detection of detections) {
    const group = headerGroup(detection);
    if (group) groupCount.set(group, (groupCount.get(group) ?? 0) + 1);
  }
  for (const detection of detections) {
    const group = headerGroup(detection);
    if (group && (groupCount.get(group) ?? 0) > 1) continue;
    if (detection.confidence === 'certain' && detection.candidates[0]) {
      const role = detection.candidates[0];
      if (columns[role] == null) columns[role] = detection.index;
      continue;
    }
    if (detection.confidence === 'unknown') ignored.push(detection.index);
  }
  return {
    kind,
    delimiter,
    date_format: 'iso',
    load_unit: 'kg',
    body_weight_unit: 'kg',
    rpe_mode: 'notes',
    columns,
    ignored,
  };
}

export function unresolvedAmbiguities(
  detections: ColumnDetection[],
  mapping: ImportMapping,
): ColumnDetection[] {
  const assigned = new Set(Object.values(mapping.columns));
  const ignored = new Set(mapping.ignored);
  return detections.filter((detection) => (
    detection.confidence === 'ambiguous'
    && !assigned.has(detection.index)
    && !ignored.has(detection.index)
  ));
}

export function mappingIssues(
  mapping: ImportMapping,
  columnCount: number,
  detections: ColumnDetection[] = [],
): string[] {
  const issues: string[] = [];
  const values = Object.values(mapping.columns);
  if (new Set(values).size !== values.length) issues.push('duplicate_mapping');
  if (unresolvedDuplicateHeaders(detections, mapping).length > 0) issues.push('duplicate_header');
  for (const index of values) {
    if (index < 0 || index >= columnCount) issues.push('column_out_of_range');
  }
  if (mapping.kind === 'workout') {
    if (mapping.columns.date == null) issues.push('date_required');
    if (mapping.columns.exercise == null) issues.push('exercise_required');
  }
  if (mapping.kind === 'body_weight') {
    if (mapping.columns.date == null) issues.push('date_required');
    if (mapping.columns.body_weight == null) issues.push('body_weight_required');
  }
  if (
    mapping.columns.exercise_load != null
    && mapping.columns.body_weight != null
    && mapping.columns.exercise_load === mapping.columns.body_weight
  ) {
    issues.push('weight_role_conflict');
  }
  return [...new Set(issues)];
}

function isCivilDate(year: number, month: number, day: number): boolean {
  if (year < 1 || year > 9999 || month < 1 || month > 12 || day < 1) return false;
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year
    && parsed.getUTCMonth() === month - 1
    && parsed.getUTCDate() === day;
}

function isoDate(year: string, month: number, day: number): string | null {
  const y = Number(year);
  if (!isCivilDate(y, month, day)) return null;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function parseDateCell(value: string, format: DateFormat): string | null {
  const trimmed = value.trim();
  if (!trimmed || looksLikeFormula(trimmed)) return null;
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (iso) return isoDate(iso[1], Number(iso[2]), Number(iso[3]));
  const slash = /^(\d{1,2})[/.](\d{1,2})[/.](\d{4})$/.exec(trimmed);
  if (!slash) return null;
  const a = Number(slash[1]);
  const b = Number(slash[2]);
  const y = slash[3];
  if (format === 'dmy') return isoDate(y, b, a);
  if (format === 'mdy') return isoDate(y, a, b);
  if (a > 12 && b <= 12) return isoDate(y, b, a);
  return null;
}

export function parseNumberCell(value: string): number | null {
  const trimmed = value.trim().replace(',', '.');
  if (!trimmed || looksLikeFormula(trimmed)) return null;
  if (!/^-?\d+(\.\d+)?$/.test(trimmed)) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

export function convertToKg(value: number, unit: MeasureUnit): number {
  return unit === 'lb' ? value * 0.45359237 : value;
}
