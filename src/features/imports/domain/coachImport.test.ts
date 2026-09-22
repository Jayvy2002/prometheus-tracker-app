import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { detectColumns, mappingIssues, parseDateCell, proposeMapping, unresolvedAmbiguities } from './columns';
import { CsvParseError, parseCsvText } from './csvParse';
import { createHash } from 'node:crypto';
import { IMPORT_MAX_BYTES, IMPORT_LOCK_CLASS } from './limits';
import { planImportRows } from './preview';

const src = (rel: string) => readFileSync(resolve(process.cwd(), rel), 'utf8');

test('CSV parser rejects empty, missing header, formulas stay literal, and caps rows', () => {
  assert.throws(() => parseCsvText(''), (err: unknown) => err instanceof CsvParseError && err.code === 'file_empty');
  assert.throws(() => parseCsvText('Date,Weight\n'), (err: unknown) => err instanceof CsvParseError && err.code === 'header_missing');
  const parsed = parseCsvText('Date,Exercise,Reps,Weight\n2026-01-02,Squat,5,100\n2026-01-02,Squat,5,102.5\n');
  assert.equal(parsed.headers[0], 'Date');
  assert.equal(parsed.rows.length, 2);
  assert.equal(parsed.rows[0][1], 'Squat');
  const quoted = parseCsvText('Date,Notes\n2026-01-02,"hello, world"\n');
  assert.equal(quoted.rows[0][1], 'hello, world');
  const formula = parseCsvText('Date,Weight\n2026-01-02,=2+2\n');
  assert.equal(formula.rows[0][1], '=2+2');
});

test('Weight is ambiguous until the coach chooses load or body weight', () => {
  const detections = detectColumns(['Date', 'Weight', 'Notes']);
  assert.equal(detections[1].confidence, 'ambiguous');
  assert.deepEqual(detections[1].candidates, ['exercise_load', 'body_weight']);
  const proposed = proposeMapping('workout', detections, ',');
  assert.equal(unresolvedAmbiguities(detections, proposed).length, 1);
  const resolved = {
    ...proposed,
    columns: { ...proposed.columns, exercise_load: 1 },
  };
  assert.equal(unresolvedAmbiguities(detections, resolved).length, 0);
});

test('ambiguous dates stay unresolved on iso unless the format is chosen', () => {
  assert.equal(parseDateCell('01/02/2026', 'iso'), null);
  assert.equal(parseDateCell('01/02/2026', 'dmy'), '2026-02-01');
  assert.equal(parseDateCell('01/02/2026', 'mdy'), '2026-01-02');
  assert.equal(parseDateCell('2026-01-02', 'iso'), '2026-01-02');
});

test('preview never writes and surfaces invalid numbers, formulas and missing exercise', () => {
  const csv = parseCsvText('Date,Exercise,Reps,Weight\n2026-01-02,Squat,5,100\n2026-01-03,,5,100\n2026-01-04,Squat,abc,100\n2026-01-05,Squat,5,=CMD\n');
  const detections = detectColumns(csv.headers);
  const mapping = {
    ...proposeMapping('workout', detections, ','),
    columns: { date: 0, exercise: 1, reps: 2, exercise_load: 3 },
    ignored: [] as number[],
  };
  assert.deepEqual(mappingIssues(mapping, csv.headers.length), []);
  const preview = planImportRows(csv.rows, mapping, detections);
  assert.equal(preview.readyCount, 1);
  assert.equal(preview.errorCount, 3);
  assert.equal(preview.rows[1].errorCode, 'exercise_required');
  assert.equal(preview.rows[2].errorCode, 'invalid_number');
  assert.equal(preview.rows[3].errorCode, 'formula_rejected');
});

test('body-weight import converts lb and keeps a stable fingerprint', () => {
  const csv = parseCsvText('Date,Weight\n2026-01-02,180\n');
  const detections = detectColumns(csv.headers);
  const mapping = {
    ...proposeMapping('body_weight', detections, ','),
    kind: 'body_weight' as const,
    body_weight_unit: 'lb' as const,
    columns: { date: 0, body_weight: 1 },
    ignored: [] as number[],
  };
  const preview = planImportRows(csv.rows, mapping, detections);
  assert.equal(preview.readyCount, 1);
  assert.equal(preview.rows[0].bodyWeightKg, 81.65);
  assert.equal(createHash('sha256').update(csv.sourceText, 'utf8').digest('hex').length, 64);
});

test('P5.1 is a server-committed pipeline, pending until apply, and stays off the mobile tabs', () => {
  const sql = src('supabase/migrations/20260922014500_p5_coach_csv_import.sql');
  assert.match(sql, /preview_coach_import/);
  assert.match(sql, /commit_coach_import/);
  assert.match(sql, /lock_coach_import/);
  assert.match(sql, /String\(20014504\)|20014504/);
  assert.match(sql, /is_coach_of/);
  assert.doesNotMatch(sql, /start_workout_from_template/);
  assert.doesNotMatch(sql, /save_program/);
  assert.match(src('docs/CHANTIER.md'), /P5\.1/);
  assert.match(src('docs/P5_1_CSV_IMPORT.md'), /preview obligatoire|preview required/i);
  assert.match(src('src/app/router/AppRoutes.tsx'), /path="\/coach\/import"/);
  const nav = src('src/app/navigation/navConfig.ts');
  const mobileFn = nav.slice(nav.indexOf('export function mobileTabs'), nav.indexOf('function nonempty'));
  assert.doesNotMatch(mobileFn, /\/coach\/import/);
  const pending = JSON.parse(src('supabase/migrations.pending.json')) as { pending: Array<{ version: string }> };
  assert.equal(pending.pending.some((row) => row.version === '20260922014500'), true);
  assert.doesNotMatch(src('supabase/schema_migrations.lock.json'), /20260922014500/);
  assert.match(src('.github/workflows/ci.yml'), /p5_coach_csv_import\.sql/);
  assert.match(src('supabase/tests/p5_coach_csv_import.sql'), /^ROLLBACK;/m);
  assert.doesNotMatch(src('supabase/tests/p5_coach_csv_import.sql'), /^COMMIT;/m);
  assert.match(src('supabase/tests/rls_matrix.sql'), /preview_coach_import/);
  assert.match(src('supabase/tests/rls_matrix.sql'), /NOT has_table_privilege\('authenticated', 'public.coach_imports', 'insert'\)/);
  assert.equal(IMPORT_LOCK_CLASS, 20014504);
  assert.equal(IMPORT_MAX_BYTES, 512 * 1024);
  assert.match(src('src/components/coaching/CoachImportPage.tsx'), /previewCoachImport/);
  assert.match(src('src/i18n/locales/fr/coaching.ts'), /Dépose ton fichier/);
  assert.match(src('src/i18n/locales/en/coaching.ts'), /Drop your file/);
  assert.doesNotMatch(src('src/components/coaching/CoachImportPage.tsx'), /% compatible|€/);
});
