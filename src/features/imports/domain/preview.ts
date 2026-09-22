import { looksLikeFormula } from './csvParse';
import {
  convertToKg,
  mappingIssues,
  parseDateCell,
  parseMeasureUnit,
  parseNumberCell,
  unresolvedAmbiguities,
  type ColumnDetection,
  type ImportMapping,
  type MeasureUnit,
} from './columns';

export type PlannedRowStatus = 'ready' | 'ignored' | 'error';

export type PlannedRow = {
  rowNo: number;
  status: PlannedRowStatus;
  errorCode: string | null;
  date: string | null;
  exercise: string | null;
  sessionName: string | null;
  setIndex: number | null;
  reps: number | null;
  loadKg: number | null;
  sourceUnit: MeasureUnit | null;
  bodyWeightKg: number | null;
  rir: number | null;
  notes: string | null;
};

export type ImportPreview = {
  issues: string[];
  ambiguities: ColumnDetection[];
  rows: PlannedRow[];
  readyCount: number;
  ignoredCount: number;
  errorCount: number;
};

function cell(row: string[], index: number | undefined): string {
  if (index == null) return '';
  return row[index] ?? '';
}

function blank(value: string): boolean {
  return value.trim() === '';
}

function formulaOrInvalid(raw: string): 'formula_rejected' | 'invalid_number' {
  return looksLikeFormula(raw.trim()) ? 'formula_rejected' : 'invalid_number';
}

function parseWholeNumber(raw: string): number | null {
  const trimmed = raw.trim().replace(',', '.');
  if (!trimmed || looksLikeFormula(trimmed) || !/^\d{1,9}$/.test(trimmed)) return null;
  const parsed = Number(trimmed);
  return Number.isInteger(parsed) ? parsed : null;
}

function resolveMappedUnit(
  row: string[],
  mapping: ImportMapping,
  fallback: MeasureUnit,
): { unit: MeasureUnit } | { error: 'formula_rejected' | 'invalid_unit' } {
  if (mapping.columns.unit == null) return { unit: fallback };
  const raw = cell(row, mapping.columns.unit);
  if (blank(raw)) return { unit: fallback };
  if (looksLikeFormula(raw.trim())) return { error: 'formula_rejected' };
  const unit = parseMeasureUnit(raw);
  if (!unit) return { error: 'invalid_unit' };
  return { unit };
}

function emptyPlanned(rowNo: number, errorCode: string, date: string | null = null): PlannedRow {
  return {
    rowNo,
    status: 'error',
    errorCode,
    date,
    exercise: null,
    sessionName: null,
    setIndex: null,
    reps: null,
    loadKg: null,
    sourceUnit: null,
    bodyWeightKg: null,
    rir: null,
    notes: null,
  };
}

export function planImportRows(
  rows: string[][],
  mapping: ImportMapping,
  detections: ColumnDetection[],
): ImportPreview {
  const issues = mappingIssues(mapping, detections.length, detections);
  const ambiguities = unresolvedAmbiguities(detections, mapping);
  if (ambiguities.length) issues.push('unresolved_ambiguity');
  const blocking = issues.find((issue) => (
    issue === 'unresolved_ambiguity'
    || issue === 'date_required'
    || issue === 'duplicate_header'
    || issue === 'duplicate_mapping'
    || issue === 'exercise_required'
    || issue === 'body_weight_required'
    || issue === 'weight_role_conflict'
    || issue === 'rir_rpe_conflict'
  ));
  const planned: PlannedRow[] = rows.map((row, offset) => {
    const rowNo = offset + 1;
    if (blocking) return emptyPlanned(rowNo, blocking);
    const rawDate = cell(row, mapping.columns.date);
    const date = parseDateCell(rawDate, mapping.date_format);
    if (!date) {
      return {
        rowNo,
        status: 'error',
        errorCode: looksLikeFormula(rawDate) ? 'formula_rejected' : 'invalid_date',
        date: null,
        exercise: null,
        sessionName: cell(row, mapping.columns.session_name) || null,
        setIndex: null,
        reps: null,
        loadKg: null,
        sourceUnit: null,
        bodyWeightKg: null,
        rir: null,
        notes: null,
      };
    }
    if (mapping.kind === 'body_weight') {
      const rawNotes = cell(row, mapping.columns.notes);
      if (rawNotes.trim() && looksLikeFormula(rawNotes.trim())) {
        return emptyPlanned(rowNo, 'formula_rejected', date);
      }
      const rawWeight = cell(row, mapping.columns.body_weight);
      const parsed = parseNumberCell(rawWeight);
      if (parsed == null || parsed <= 0 || parsed > 500) {
        return {
          rowNo,
          status: 'error',
          errorCode: looksLikeFormula(rawWeight) ? 'formula_rejected' : 'invalid_number',
          date,
          exercise: null,
          sessionName: null,
          setIndex: null,
          reps: null,
          loadKg: null,
          sourceUnit: null,
          bodyWeightKg: null,
          rir: null,
          notes: cell(row, mapping.columns.notes) || null,
        };
      }
      const unitChoice = resolveMappedUnit(row, mapping, mapping.body_weight_unit);
      if ('error' in unitChoice) return emptyPlanned(rowNo, unitChoice.error, date);
      return {
        rowNo,
        status: 'ready',
        errorCode: null,
        date,
        exercise: null,
        sessionName: null,
        setIndex: null,
        reps: null,
        loadKg: null,
        sourceUnit: unitChoice.unit,
        bodyWeightKg: Math.round(convertToKg(parsed, unitChoice.unit) * 100) / 100,
        rir: null,
        notes: cell(row, mapping.columns.notes) || null,
      };
    }
    const rawExercise = cell(row, mapping.columns.exercise);
    const rawSession = cell(row, mapping.columns.session_name);
    const rawNotes = cell(row, mapping.columns.notes);
    if (looksLikeFormula(rawExercise.trim())) return emptyPlanned(rowNo, 'formula_rejected', date);
    if (!rawExercise.trim()) return emptyPlanned(rowNo, 'exercise_required', date);
    if (rawSession.trim() && looksLikeFormula(rawSession.trim())) return emptyPlanned(rowNo, 'formula_rejected', date);
    if (rawNotes.trim() && looksLikeFormula(rawNotes.trim())) return emptyPlanned(rowNo, 'formula_rejected', date);
    const exercise = rawExercise.trim();
    const sessionName = rawSession.trim() || null;
    const rawReps = mapping.columns.reps == null ? '' : cell(row, mapping.columns.reps);
    let reps: number | null = null;
    if (!blank(rawReps)) {
      reps = parseWholeNumber(rawReps);
      if (reps == null || reps > 1000) return emptyPlanned(rowNo, formulaOrInvalid(rawReps), date);
    }
    const rawLoad = mapping.columns.exercise_load == null ? '' : cell(row, mapping.columns.exercise_load);
    let loadKg: number | null = null;
    let parsedLoad: number | null = null;
    if (!blank(rawLoad)) {
      parsedLoad = parseNumberCell(rawLoad);
      if (parsedLoad == null || parsedLoad < 0 || parsedLoad > 2000) return emptyPlanned(rowNo, formulaOrInvalid(rawLoad), date);
    }
    const unitChoice = resolveMappedUnit(row, mapping, mapping.load_unit);
    if ('error' in unitChoice) return emptyPlanned(rowNo, unitChoice.error, date);
    if (parsedLoad != null) {
      loadKg = Math.round(convertToKg(parsedLoad, unitChoice.unit) * 100) / 100;
    }
    const rawSet = mapping.columns.set_index == null ? '' : cell(row, mapping.columns.set_index);
    let setIndex: number | null = null;
    if (!blank(rawSet)) {
      setIndex = parseWholeNumber(rawSet);
      if (setIndex == null || setIndex < 1 || setIndex > 100) return emptyPlanned(rowNo, formulaOrInvalid(rawSet), date);
    }
    const rawRir = mapping.columns.rir == null ? '' : cell(row, mapping.columns.rir);
    let rir: number | null = null;
    if (!blank(rawRir)) {
      rir = parseWholeNumber(rawRir);
      if (rir == null || rir > 10) return emptyPlanned(rowNo, formulaOrInvalid(rawRir), date);
    }
    const rawRpe = mapping.columns.rpe == null ? '' : cell(row, mapping.columns.rpe);
    let notes = rawNotes.trim();
    if (!blank(rawRpe)) {
      if (looksLikeFormula(rawRpe.trim())) return emptyPlanned(rowNo, 'formula_rejected', date);
      const rpe = parseNumberCell(rawRpe);
      if (rpe == null || rpe < 1 || rpe > 10) return emptyPlanned(rowNo, 'invalid_number', date);
      if (mapping.rpe_mode === 'notes') {
        notes = [notes, `RPE ${rpe}`].filter(Boolean).join(' · ');
      } else if (rir != null && mapping.effort_source !== 'rir' && mapping.effort_source !== 'rpe') {
        return emptyPlanned(rowNo, 'rir_rpe_conflict', date);
      } else if ((mapping.effort_source ?? 'rpe') === 'rir' && rir != null) {
        notes = [notes, `RPE ${rpe}`].filter(Boolean).join(' · ');
      } else {
        rir = Math.max(0, Math.round(10 - rpe));
      }
    }
    return {
      rowNo,
      status: 'ready',
      errorCode: null,
      date,
      exercise,
      sessionName,
      setIndex,
      reps,
      loadKg,
      sourceUnit: loadKg == null ? null : unitChoice.unit,
      bodyWeightKg: null,
      rir,
      notes: notes || null,
    };
  });
  const groups = new Map<string, PlannedRow[]>();
  for (const row of planned) {
    if (row.status !== 'ready' || row.setIndex != null || !row.exercise) continue;
    const key = `${row.date ?? ''}|${row.sessionName ?? ''}|${row.exercise}`;
    const list = groups.get(key) ?? [];
    list.push(row);
    groups.set(key, list);
  }
  for (const list of groups.values()) {
    list.sort((a, b) => a.rowNo - b.rowNo);
    list.forEach((row, index) => {
      row.setIndex = index + 1;
    });
  }
  return {
    issues,
    ambiguities,
    rows: planned,
    readyCount: planned.filter((row) => row.status === 'ready').length,
    ignoredCount: planned.filter((row) => row.status === 'ignored').length,
    errorCount: planned.filter((row) => row.status === 'error').length,
  };
}
