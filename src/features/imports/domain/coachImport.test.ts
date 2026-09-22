import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { detectColumns, mappingIssues, parseDateCell, proposeMapping, unresolvedAmbiguities } from './columns';
import { CsvParseError, parseCsvText } from './csvParse';
import { createHash } from 'node:crypto';
import { IMPORT_MAX_BYTES, IMPORT_LOCK_CLASS } from './limits';
import { planImportRows } from './preview';
import frCoaching from '../../../i18n/locales/fr/coaching';
import enCoaching from '../../../i18n/locales/en/coaching';

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
  assert.equal(parseDateCell('31/01/2026', 'iso'), null);
  assert.equal(parseDateCell('31/01/2026', 'dmy'), '2026-01-31');
  assert.equal(parseDateCell('01/02/2026', 'dmy'), '2026-02-01');
  assert.equal(parseDateCell('01/02/2026', 'mdy'), '2026-01-02');
  assert.equal(parseDateCell('2026-01-02', 'iso'), '2026-01-02');
  assert.equal(parseDateCell('2026-02-31', 'iso'), null);
  assert.equal(parseDateCell('31/02/2026', 'dmy'), null);
  assert.equal(parseDateCell('02/31/2026', 'mdy'), null);
  assert.equal(parseDateCell('2024-02-29', 'iso'), '2024-02-29');
});

test('duplicate headers stay unresolved until one column is chosen and the other ignored', () => {
  const detections = detectColumns(['Date', 'Date', 'Exercise']);
  const proposed = proposeMapping('workout', detections, ',');
  assert.equal(proposed.columns.date, undefined);
  assert.deepEqual(proposed.ignored, []);
  assert.ok(mappingIssues(proposed, detections.length, detections).includes('duplicate_header'));
  const resolved = {
    ...proposed,
    columns: { date: 0, exercise: 2 },
    ignored: [1],
  };
  assert.equal(mappingIssues(resolved, detections.length, detections).includes('duplicate_header'), false);
});

test('blank load reps and RIR stay null, explicit zero stays zero, and bad set or RIR is a row error', () => {
  const csv = parseCsvText('Date,Exercise,Set,Reps,Load,RIR\n2026-06-01,Blank,1,,,\n2026-06-01,Zero,1,0,0,0\n2026-06-01,Bad,abc,5,10,1\n2026-06-01,Half,1.5,5,10,1\n2026-06-01,High,1,5,10,11\n2026-06-01,Derived,,5,10,\n2026-06-01,Derived,,5,10,\n');
  const detections = detectColumns(csv.headers);
  const mapping = {
    ...proposeMapping('workout', detections, ','),
    columns: { date: 0, exercise: 1, set_index: 2, reps: 3, exercise_load: 4, rir: 5 },
    ignored: [] as number[],
  };
  const preview = planImportRows(csv.rows, mapping, detections);
  assert.equal(preview.rows[0].reps, null);
  assert.equal(preview.rows[0].loadKg, null);
  assert.equal(preview.rows[0].rir, null);
  assert.equal(preview.rows[1].reps, 0);
  assert.equal(preview.rows[1].loadKg, 0);
  assert.equal(preview.rows[1].rir, 0);
  assert.equal(preview.rows[2].errorCode, 'invalid_number');
  assert.equal(preview.rows[3].errorCode, 'invalid_number');
  assert.equal(preview.rows[4].errorCode, 'invalid_number');
  assert.equal(preview.rows[5].status, 'ready');
  assert.equal(preview.rows[5].setIndex, 1);
  assert.equal(preview.rows[6].setIndex, 2);
  assert.equal(preview.rows[5].rir, null);
});

test('an impossible date is a row error and the other rows stay previewable', () => {
  const csv = parseCsvText('Date,Exercise\n2026-02-02,Squat\n2026-02-31,Bench\n2026-02-03,Row\n');
  const detections = detectColumns(csv.headers);
  const mapping = {
    ...proposeMapping('workout', detections, ','),
    columns: { date: 0, exercise: 1 },
    ignored: [] as number[],
  };
  const preview = planImportRows(csv.rows, mapping, detections);
  assert.equal(preview.rows[0].status, 'ready');
  assert.equal(preview.rows[1].errorCode, 'invalid_date');
  assert.equal(preview.rows[2].status, 'ready');
});

test('formulas in exercise, notes, set and RIR are rejected', () => {
  const csv = parseCsvText('Date,Exercise,Notes,Set,RIR\n2026-08-01,=1+1,ok,1,1\n2026-08-01,Squat,=cmd,1,1\n2026-08-01,Squat,ok,=2,1\n2026-08-01,Squat,ok,1,=3\n2026-08-01,Squat,fine,1,2\n');
  const detections = detectColumns(csv.headers);
  const mapping = {
    ...proposeMapping('workout', detections, ','),
    columns: { date: 0, exercise: 1, notes: 2, set_index: 3, rir: 4 },
    ignored: [] as number[],
  };
  const preview = planImportRows(csv.rows, mapping, detections);
  assert.equal(preview.rows[0].errorCode, 'formula_rejected');
  assert.equal(preview.rows[1].errorCode, 'formula_rejected');
  assert.equal(preview.rows[2].errorCode, 'formula_rejected');
  assert.equal(preview.rows[3].errorCode, 'formula_rejected');
  assert.equal(preview.rows[4].status, 'ready');
  assert.equal(preview.rows[4].rir, 2);
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

test('domain limits apply after conversion to kilograms', () => {
  const load = parseCsvText('Date,Exercise,Weight,Unit\n2026-09-22,Bench,3000,lb\n2026-09-22,Squat,5000,lb\n');
  const loadDetections = detectColumns(load.headers);
  const loadMapping = {
    ...proposeMapping('workout', loadDetections, ','),
    load_unit: 'kg' as const,
    columns: { date: 0, exercise: 1, exercise_load: 2, unit: 3 },
    ignored: [] as number[],
  };
  const loadPreview = planImportRows(load.rows, loadMapping, loadDetections);
  assert.equal(loadPreview.rows[0].status, 'ready');
  assert.equal(loadPreview.rows[0].loadKg, 1360.78);
  assert.equal(loadPreview.rows[1].errorCode, 'invalid_number');

  const body = parseCsvText('Date,Weight,Unit\n2026-09-20,501,lb\n2026-09-21,1103,lb\n');
  const bodyDetections = detectColumns(body.headers);
  const bodyMapping = {
    ...proposeMapping('body_weight', bodyDetections, ','),
    kind: 'body_weight' as const,
    body_weight_unit: 'kg' as const,
    columns: { date: 0, body_weight: 1, unit: 2 },
    ignored: [] as number[],
  };
  const bodyPreview = planImportRows(body.rows, bodyMapping, bodyDetections);
  assert.equal(bodyPreview.rows[0].status, 'ready');
  assert.equal(bodyPreview.rows[0].bodyWeightKg, 227.25);
  assert.equal(bodyPreview.rows[1].errorCode, 'invalid_number');
});

test('a mapped unit column converts that row and a blank unit uses the chosen fallback', () => {
  const csv = parseCsvText('Date,Exercise,Weight,Unit\n2026-09-01,Bench,225,lb\n2026-09-01,Squat,100,\n2026-09-01,Row,10,stone\n');
  const detections = detectColumns(csv.headers);
  const mapping = {
    ...proposeMapping('workout', detections, ','),
    load_unit: 'kg' as const,
    columns: { date: 0, exercise: 1, exercise_load: 2, unit: 3 },
    ignored: [] as number[],
  };
  assert.equal(mapping.columns.unit, 3);
  const preview = planImportRows(csv.rows, mapping, detections);
  assert.equal(preview.rows[0].status, 'ready');
  assert.equal(preview.rows[0].loadKg, 102.06);
  assert.equal(preview.rows[0].sourceUnit, 'lb');
  assert.equal(preview.rows[1].loadKg, 100);
  assert.equal(preview.rows[1].sourceUnit, 'kg');
  assert.equal(preview.rows[2].errorCode, 'invalid_unit');
});

test('convert_to_rir does not replace an explicit RIR unless the coach chooses RPE', () => {
  const csv = parseCsvText('Date,Exercise,RIR,RPE\n2026-09-02,Bench,3,8\n');
  const detections = detectColumns(csv.headers);
  const base = {
    ...proposeMapping('workout', detections, ','),
    rpe_mode: 'convert_to_rir' as const,
    columns: { date: 0, exercise: 1, rir: 2, rpe: 3 },
    ignored: [] as number[],
  };
  assert.ok(mappingIssues(base, detections.length, detections).includes('rir_rpe_conflict'));
  const keepRir = planImportRows(csv.rows, { ...base, effort_source: 'rir' }, detections);
  assert.equal(keepRir.rows[0].rir, 3);
  assert.match(keepRir.rows[0].notes ?? '', /RPE 8/);
  const useRpe = planImportRows(csv.rows, { ...base, effort_source: 'rpe' }, detections);
  assert.equal(useRpe.rows[0].rir, 2);
  const notesMode = planImportRows(csv.rows, { ...base, rpe_mode: 'notes', effort_source: null }, detections);
  assert.equal(notesMode.rows[0].rir, 3);
  assert.match(notesMode.rows[0].notes ?? '', /RPE 8/);
});

test('delimiter detection ignores separators inside quotes and an explicit delimiter overrides it', () => {
  const text = 'Date;Exercise;Notes\n2026-01-01;Bench;"a, b, c, d, e, f"\n';
  const detected = parseCsvText(text);
  assert.equal(detected.delimiter, ';');
  assert.equal(detected.headers.length, 3);
  assert.equal(detected.rows[0][2], 'a, b, c, d, e, f');
  const forced = parseCsvText(text, ',');
  assert.equal(forced.delimiter, ',');
  assert.notEqual(forced.headers.length, 3);
});

test('P5.1 is a server-committed pipeline, applied in the lock, and stays off the mobile tabs', () => {
  const sql = src('supabase/migrations/20260922014500_p5_coach_csv_import.sql');
  assert.match(sql, /preview_coach_import/);
  assert.match(sql, /commit_coach_import/);
  assert.match(sql, /lock_coach_import/);
  assert.match(sql, /coach_import_lock_active_link/);
  assert.match(sql, /FOR SHARE/);
  assert.match(sql, /ON DELETE SET NULL/);
  assert.match(sql, /coach_ref/);
  assert.match(sql, /interval '12 hours'/);
  assert.match(sql, /ORDER BY min\(row_no\)/);
  assert.match(sql, /duplicate_header/);
  assert.match(sql, /already_imported/);
  assert.match(sql, /acknowledge_duplicates/);
  assert.match(sql, /cancel_coach_import/);
  assert.match(sql, /20014505/);
  assert.match(sql, /20014506/);
  assert.match(sql, /duplicates_changed/);
  assert.match(sql, /coach_import_purge_stale_previews/);
  assert.match(sql, /coach-import-preview-purge/);
  const schedule = sql.slice(sql.lastIndexOf('CREATE EXTENSION IF NOT EXISTS pg_cron'));
  assert.doesNotMatch(schedule, /EXCEPTION\s+WHEN/);
  assert.doesNotMatch(schedule, /RAISE NOTICE/);
  assert.match(schedule, /coach-import-preview-purge schedule mismatch/);
  assert.match(src('supabase/tests/p5_coach_csv_import.sql'), /coach-import-preview-purge job missing after migration/);
  assert.match(sql, /interval '7 days'/);
  assert.match(sql, />= 20/);
  assert.doesNotMatch(sql, /coalesce\(\(r\.planned->>'load_kg'\)/);
  assert.doesNotMatch(sql, /coalesce\(\(r\.planned->>'reps'\)/);
  assert.doesNotMatch(sql, /coalesce\(\(r\.planned->>'rir'\)/);
  const commit = sql.slice(sql.indexOf('FUNCTION public.commit_coach_import'), sql.indexOf('FUNCTION public.get_coach_import'));
  const life = commit.indexOf('coach_import_assert_actor');
  const mutex = commit.indexOf('lock_coach_import');
  const rowLock = commit.indexOf('FOR UPDATE');
  const shareCall = commit.indexOf('coach_import_lock_active_link');
  const subjectLock = commit.indexOf('lock_coach_import_subject');
  assert.ok(life >= 0 && life < mutex && mutex < rowLock && rowLock < shareCall && shareCall < subjectLock);
  assert.match(
    sql.slice(sql.indexOf('FUNCTION public.coach_import_lock_active_link'), sql.indexOf('FUNCTION public.coach_import_view')),
    /FOR SHARE/,
  );
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
  assert.equal(pending.pending.some((row) => row.version === '20260922014500'), false);
  assert.match(src('supabase/schema_migrations.lock.json'), /"version": "20260922014500"/);
  assert.match(src('.github/workflows/ci.yml'), /p5_coach_csv_import\.sql/);
  assert.match(src('.github/workflows/ci.yml'), /test-p5-commit-commit-subject\.sh/);
  assert.match(src('supabase/tests/p5_coach_csv_import.sql'), /^ROLLBACK;/m);
  assert.doesNotMatch(src('supabase/tests/p5_coach_csv_import.sql'), /^COMMIT;/m);
  assert.match(src('supabase/tests/rls_matrix.sql'), /preview_coach_import/);
  assert.match(src('supabase/tests/rls_matrix.sql'), /NOT has_table_privilege\('authenticated', 'public.coach_imports', 'insert'\)/);
  assert.equal(IMPORT_LOCK_CLASS, 20014504);
  assert.equal(IMPORT_MAX_BYTES, 512 * 1024);
  assert.match(src('src/components/coaching/CoachImportPage.tsx'), /previewCoachImport/);
  assert.equal(frCoaching.coaching.importCsv.drop, 'Dépose ton fichier');
  assert.equal(enCoaching.coaching.importCsv.drop, 'Drop your file');
  assert.equal(frCoaching.coaching.importCsv.acknowledgeDuplicates, 'Importer quand même');
  assert.equal(enCoaching.coaching.importCsv.confirm, 'Confirm import');
  assert.doesNotMatch(src('src/components/coaching/CoachImportPage.tsx'), /% compatible|€/);
});
