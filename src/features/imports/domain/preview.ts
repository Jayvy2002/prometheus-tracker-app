import { looksLikeFormula } from './csvParse';
import {
  convertToKg,
  mappingIssues,
  parseDateCell,
  parseNumberCell,
  unresolvedAmbiguities,
  type ColumnDetection,
  type ImportMapping,
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

export function planImportRows(
  rows: string[][],
  mapping: ImportMapping,
  detections: ColumnDetection[],
): ImportPreview {
  const issues = mappingIssues(mapping, detections.length);
  const ambiguities = unresolvedAmbiguities(detections, mapping);
  if (ambiguities.length) issues.push('unresolved_ambiguity');
  const planned: PlannedRow[] = rows.map((row, offset) => {
    const rowNo = offset + 1;
    if (issues.includes('unresolved_ambiguity') || issues.includes('date_required')) {
      return {
        rowNo,
        status: 'error',
        errorCode: issues[0] ?? 'invalid_mapping',
        date: null,
        exercise: null,
        sessionName: null,
        setIndex: null,
        reps: null,
        loadKg: null,
        bodyWeightKg: null,
        rir: null,
        notes: null,
      };
    }
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
        bodyWeightKg: null,
        rir: null,
        notes: null,
      };
    }
    if (mapping.kind === 'body_weight') {
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
          bodyWeightKg: null,
          rir: null,
          notes: cell(row, mapping.columns.notes) || null,
        };
      }
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
        bodyWeightKg: Math.round(convertToKg(parsed, mapping.body_weight_unit) * 100) / 100,
        rir: null,
        notes: cell(row, mapping.columns.notes) || null,
      };
    }
    const exercise = cell(row, mapping.columns.exercise);
    if (!exercise) {
      return {
        rowNo,
        status: 'error',
        errorCode: 'exercise_required',
        date,
        exercise: null,
        sessionName: cell(row, mapping.columns.session_name) || null,
        setIndex: null,
        reps: null,
        loadKg: null,
        bodyWeightKg: null,
        rir: null,
        notes: null,
      };
    }
    const rawReps = cell(row, mapping.columns.reps);
    const reps = rawReps ? parseNumberCell(rawReps) : 0;
    if (rawReps && (reps == null || reps < 0 || reps > 1000 || !Number.isInteger(reps))) {
      return {
        rowNo,
        status: 'error',
        errorCode: looksLikeFormula(rawReps) ? 'formula_rejected' : 'invalid_number',
        date,
        exercise,
        sessionName: cell(row, mapping.columns.session_name) || null,
        setIndex: null,
        reps: null,
        loadKg: null,
        bodyWeightKg: null,
        rir: null,
        notes: null,
      };
    }
    const rawLoad = cell(row, mapping.columns.exercise_load);
    let loadKg: number | null = null;
    if (rawLoad) {
      const parsed = parseNumberCell(rawLoad);
      if (parsed == null || parsed < 0 || parsed > 2000) {
        return {
          rowNo,
          status: 'error',
          errorCode: looksLikeFormula(rawLoad) ? 'formula_rejected' : 'invalid_number',
          date,
          exercise,
          sessionName: cell(row, mapping.columns.session_name) || null,
          setIndex: null,
          reps: reps ?? 0,
          loadKg: null,
          bodyWeightKg: null,
          rir: null,
          notes: null,
        };
      }
      loadKg = Math.round(convertToKg(parsed, mapping.load_unit) * 100) / 100;
    }
    const rawSet = cell(row, mapping.columns.set_index);
    const setIndex = rawSet ? parseNumberCell(rawSet) : 1;
    const rawRir = cell(row, mapping.columns.rir);
    const rawRpe = cell(row, mapping.columns.rpe);
    let rir: number | null = rawRir ? parseNumberCell(rawRir) : null;
    let notes = cell(row, mapping.columns.notes);
    if (rawRpe) {
      const rpe = parseNumberCell(rawRpe);
      if (rpe == null || rpe < 1 || rpe > 10) {
        return {
          rowNo,
          status: 'error',
          errorCode: 'invalid_number',
          date,
          exercise,
          sessionName: cell(row, mapping.columns.session_name) || null,
          setIndex: setIndex == null ? 1 : setIndex,
          reps: reps ?? 0,
          loadKg,
          bodyWeightKg: null,
          rir: null,
          notes: notes || null,
        };
      }
      if (mapping.rpe_mode === 'convert_to_rir') {
        rir = Math.max(0, Math.round(10 - rpe));
      } else {
        notes = [notes, `RPE ${rpe}`].filter(Boolean).join(' · ');
      }
    }
    return {
      rowNo,
      status: 'ready',
      errorCode: null,
      date,
      exercise,
      sessionName: cell(row, mapping.columns.session_name) || null,
      setIndex: setIndex == null ? 1 : setIndex,
      reps: reps ?? 0,
      loadKg,
      bodyWeightKg: null,
      rir,
      notes: notes || null,
    };
  });
  return {
    issues,
    ambiguities,
    rows: planned,
    readyCount: planned.filter((row) => row.status === 'ready').length,
    ignoredCount: planned.filter((row) => row.status === 'ignored').length,
    errorCount: planned.filter((row) => row.status === 'error').length,
  };
}
