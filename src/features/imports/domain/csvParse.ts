import { IMPORT_MAX_BYTES, IMPORT_MAX_CELL, IMPORT_MAX_COLS, IMPORT_MAX_ROWS } from './limits';

export type CsvParseErrorCode =
  | 'file_empty'
  | 'file_too_large'
  | 'too_many_rows'
  | 'too_many_columns'
  | 'cell_too_long'
  | 'header_missing'
  | 'malformed_csv';

export class CsvParseError extends Error {
  readonly code: CsvParseErrorCode;
  constructor(code: CsvParseErrorCode, message: string) {
    super(message);
    this.name = 'CsvParseError';
    this.code = code;
  }
}

export type ParsedCsv = {
  delimiter: ',' | ';' | '\t';
  headers: string[];
  rows: string[][];
  sourceText: string;
};

function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

function countOutsideQuotes(sample: string, delimiter: string): number {
  let count = 0;
  let inQuotes = false;
  for (let i = 0; i < sample.length; i += 1) {
    const ch = sample[i];
    if (inQuotes) {
      if (ch === '"') {
        if (sample[i + 1] === '"') {
          i += 1;
          continue;
        }
        inQuotes = false;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === delimiter) count += 1;
  }
  return count;
}

function detectDelimiter(sample: string): ',' | ';' | '\t' {
  const counts: Array<{ d: ',' | ';' | '\t'; n: number }> = [
    { d: ',', n: countOutsideQuotes(sample, ',') },
    { d: ';', n: countOutsideQuotes(sample, ';') },
    { d: '\t', n: countOutsideQuotes(sample, '\t') },
  ];
  counts.sort((a, b) => b.n - a.n);
  return counts[0].n > 0 ? counts[0].d : ',';
}

export function parseCsvText(input: string, delimiter?: ',' | ';' | '\t'): ParsedCsv {
  if (input.length > IMPORT_MAX_BYTES) {
    throw new CsvParseError('file_too_large', 'file exceeds size cap');
  }
  const sourceText = stripBom(input).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  if (!sourceText.trim()) {
    throw new CsvParseError('file_empty', 'file is empty');
  }
  const delim = delimiter ?? detectDelimiter(sourceText);
  const rows: string[][] = [];
  let cells: string[] = [];
  let cell = '';
  let inQuotes = false;
  let i = 0;
  while (i < sourceText.length) {
    const ch = sourceText[i];
    if (inQuotes) {
      if (ch === '"') {
        if (sourceText[i + 1] === '"') {
          cell += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      cell += ch;
      i += 1;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (ch === delim) {
      cells.push(cell);
      cell = '';
      i += 1;
      continue;
    }
    if (ch === '\n') {
      cells.push(cell);
      cell = '';
      if (cells.some((value) => value.trim() !== '') || rows.length === 0) {
        rows.push(cells);
      }
      cells = [];
      i += 1;
      continue;
    }
    cell += ch;
    i += 1;
  }
  if (inQuotes) {
    throw new CsvParseError('malformed_csv', 'unclosed quote');
  }
  cells.push(cell);
  if (cells.some((value) => value.trim() !== '') || rows.length === 0) {
    rows.push(cells);
  }
  if (rows.length < 2) {
    throw new CsvParseError('header_missing', 'header row only or missing');
  }
  if (rows.length - 1 > IMPORT_MAX_ROWS) {
    throw new CsvParseError('too_many_rows', 'too many data rows');
  }
  const width = Math.max(...rows.map((row) => row.length));
  if (width > IMPORT_MAX_COLS) {
    throw new CsvParseError('too_many_columns', 'too many columns');
  }
  const normalized = rows.map((row) => {
    const padded = row.slice();
    while (padded.length < width) padded.push('');
    return padded.map((value) => {
      if (value.length > IMPORT_MAX_CELL) {
        throw new CsvParseError('cell_too_long', 'cell exceeds length cap');
      }
      return value.trim();
    });
  });
  const headers = normalized[0].map((header, index) => header || `col_${index + 1}`);
  return {
    delimiter: delim,
    headers,
    rows: normalized.slice(1),
    sourceText,
  };
}

export function looksLikeFormula(value: string): boolean {
  return /^[=+@|-]/.test(value);
}
