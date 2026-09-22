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

export function proposeMapping(
  kind: ImportKind,
  detections: ColumnDetection[],
  delimiter: ImportMapping['delimiter'],
): ImportMapping {
  const columns: Partial<Record<ColumnRole, number>> = {};
  const ignored: number[] = [];
  for (const detection of detections) {
    if (detection.confidence === 'certain' && detection.candidates[0]) {
      const role = detection.candidates[0];
      if (columns[role] == null) columns[role] = detection.index;
      else ignored.push(detection.index);
      continue;
    }
    if (detection.confidence === 'unknown') {
      ignored.push(detection.index);
    }
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

export function mappingIssues(mapping: ImportMapping, columnCount: number): string[] {
  const issues: string[] = [];
  const values = Object.values(mapping.columns);
  if (new Set(values).size !== values.length) issues.push('duplicate_mapping');
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

export function parseDateCell(value: string, format: DateFormat): string | null {
  const trimmed = value.trim();
  if (!trimmed || looksLikeFormula(trimmed)) return null;
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const slash = /^(\d{1,2})[/.](\d{1,2})[/.](\d{4})$/.exec(trimmed);
  if (!slash) return null;
  const a = Number(slash[1]);
  const b = Number(slash[2]);
  const y = slash[3];
  if (format === 'dmy') {
    if (a < 1 || a > 31 || b < 1 || b > 12) return null;
    return `${y}-${String(b).padStart(2, '0')}-${String(a).padStart(2, '0')}`;
  }
  if (format === 'mdy') {
    if (a < 1 || a > 12 || b < 1 || b > 31) return null;
    return `${y}-${String(a).padStart(2, '0')}-${String(b).padStart(2, '0')}`;
  }
  if (a > 12 && b <= 12) {
    return `${y}-${String(b).padStart(2, '0')}-${String(a).padStart(2, '0')}`;
  }
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
