import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import frCoaching from '../../../i18n/locales/fr/coaching';
import enCoaching from '../../../i18n/locales/en/coaching';
import { provisionalErrorCode } from './errors';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

test('P5.2 reuses the import pipeline for an owned provisional dossier and never creates an auth user', () => {
  const sql = src('supabase/migrations/20260922223000_p5_provisional_dossiers.sql');
  assert.match(sql, /subject_user_id IS NOT NULL AND provisional_dossier_id IS NULL/);
  assert.match(sql, /preview_provisional_import/);
  assert.match(sql, /confirm_provisional_claim/);
  assert.match(sql, /20014507/);
  assert.match(sql, /activate_coaching_relationship/);
  assert.doesNotMatch(sql, /INSERT INTO auth\.users/);
  assert.doesNotMatch(sql, /start_workout_from_template/);
  assert.doesNotMatch(sql, /save_program/);
  assert.doesNotMatch(sql, /INSERT INTO public\.coach_client_links/);
  const testSql = src('supabase/tests/p5_provisional_dossier.sql');
  assert.match(testSql, /^ROLLBACK;/m);
  assert.doesNotMatch(testSql, /^COMMIT;/m);
  assert.match(src('.github/workflows/ci.yml'), /p5_provisional_dossier\.sql/);
  assert.match(src('.github/workflows/ci.yml'), /test-p5-provisional-claim-lock\.sh/);
  assert.match(src('supabase/tests/rls_matrix.sql'), /P5_DOSSIER_GRANTS/);
  const pending = JSON.parse(src('supabase/migrations.pending.json')) as { pending: Array<{ version: string }> };
  assert.equal(pending.pending.some((row) => row.version === '20260922223000'), false);
  assert.match(src('supabase/schema_migrations.lock.json'), /"version": "20260922223000"/);
  const routes = src('src/app/router/AppRoutes.tsx');
  assert.match(routes, /path="\/coach\/dossiers"/);
  assert.match(routes, /path="\/dossier\/:token"/);
  const nav = src('src/app/navigation/navConfig.ts');
  const mobileFn = nav.slice(nav.indexOf('export function mobileTabs'), nav.indexOf('function nonempty'));
  assert.doesNotMatch(mobileFn, /\/coach\/dossiers/);
  assert.match(src('src/components/coaching/CoachImportPage.tsx'), /previewProvisionalImport/);
  assert.match(src('src/shared/ui/Button.tsx'), /saturate-0/);
  assert.equal(frCoaching.coaching.provisional.create, 'Créer le dossier');
  assert.equal(enCoaching.coaching.provisional.create, 'Create dossier');
  assert.equal(frCoaching.coaching.importCsv.counts.applied_one, '{{count}} ligne importée');
  assert.equal(enCoaching.coaching.importCsv.counts.applied_one, '{{count}} row imported');
  assert.equal(provisionalErrorCode('invite_email_mismatch'), 'invite_email_mismatch');
  assert.equal(provisionalErrorCode('something else'), 'generic');
  assert.match(src('docs/P5_2_PROVISIONAL_DOSSIER.md'), /aucun faux compte/);
  assert.match(src('docs/CHANTIER.md'), /P5\.2/);
});
