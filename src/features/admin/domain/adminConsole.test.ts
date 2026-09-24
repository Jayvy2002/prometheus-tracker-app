import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import frAdmin from '../../../i18n/locales/fr/admin';
import enAdmin from '../../../i18n/locales/en/admin';
import { actionReady, adminErrorKey, isOperatorUserId, reportNoteRequired, shortOperatorId } from './adminConsole';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

function fnBody(sql: string, name: string): string {
  const start = sql.indexOf(`FUNCTION public.${name}`);
  const end = sql.indexOf('$$;', start);
  return sql.slice(start, end);
}

test('operator actions stay disabled until confirm and a required note', () => {
  assert.equal(actionReady(false, 'note', false), false);
  assert.equal(actionReady(true, '   ', true), false);
  assert.equal(actionReady(true, 'vu', true), true);
  assert.equal(actionReady(true, '', false), true);
  assert.equal(reportNoteRequired('acknowledge'), false);
  assert.equal(reportNoteRequired('suspend_directory'), true);
  assert.equal(adminErrorKey('ERROR: not_authorized'), 'not_authorized');
  assert.equal(adminErrorKey('last_operator'), 'last_operator');
  assert.equal(adminErrorKey('something else'), 'generic');
  assert.equal(shortOperatorId('c5400000-0000-4000-8000-000000000001'), 'c5400000');
  assert.equal(isOperatorUserId('c5400000-0000-4000-8000-000000000001'), true);
  assert.equal(isOperatorUserId('not-an-id'), false);
});

test('P5.4 admin is an operator console with confirm gates and no public review grant', () => {
  const sql = src('supabase/migrations/20260923021000_p5_minimal_admin.sql');
  const approve = fnBody(sql, 'admin_approve_exercise_proposal');
  assert.ok(approve.indexOf('request_closed') < approve.indexOf('already_in_catalog'));
  assert.match(approve, /created_by/);
  assert.doesNotMatch(approve, /UPDATE public\.workout_exercises/);
  const qualifications = fnBody(sql, 'admin_list_pending_qualifications');
  assert.match(qualifications, /proof_present boolean/);
  assert.match(qualifications, /\(q\.proof_path IS NOT NULL\)/);
  assert.doesNotMatch(qualifications, /\.email/);
  assert.doesNotMatch(fnBody(sql, 'admin_list_problem_imports'), /filename|raw_payload|column_mapping/);
  assert.doesNotMatch(fnBody(sql, 'admin_list_open_reports'), /reporter/);
  assert.doesNotMatch(sql, /GRANT EXECUTE ON FUNCTION public\.review_coach_qualification\(uuid, text, text\) TO authenticated/);
  assert.doesNotMatch(sql, /GRANT EXECUTE ON FUNCTION public\.review_marketplace_report\(uuid, text, text\) TO authenticated/);
  assert.doesNotMatch(sql, /GRANT EXECUTE ON FUNCTION public\.merge_exercises\(uuid, uuid, boolean\) TO authenticated/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.admin_review_qualification/);
  assert.doesNotMatch(sql, /CREATE TABLE[^;]*subscription|stripe_/i);
  const testSql = src('supabase/tests/p5_minimal_admin.sql');
  assert.match(testSql, /^ROLLBACK;/m);
  assert.doesNotMatch(testSql, /^COMMIT;/m);
  const grant = fnBody(sql, 'grant_platform_operator');
  const revoke = fnBody(sql, 'admin_revoke_platform_operator');
  assert.match(grant, /lock_platform_operators\(\)/);
  assert.match(revoke, /lock_platform_operators\(\)/);
  const grantLock = grant.indexOf('lock_platform_operators()');
  const grantRecheck = grant.indexOf('is_platform_operator()', grantLock);
  const grantWrite = grant.indexOf('INSERT INTO public.platform_operators');
  assert.ok(grantLock >= 0 && grantRecheck > grantLock && grantRecheck < grantWrite);
  const revokeLock = revoke.indexOf('lock_platform_operators()');
  const revokeRecheck = revoke.indexOf('is_platform_operator()', revokeLock);
  const revokeCount = revoke.indexOf('INTO v_active, v_target');
  assert.ok(revokeLock >= 0 && revokeRecheck > revokeLock && revokeRecheck < revokeCount);
  assert.match(sql, /pg_advisory_xact_lock\(20014508, 1135\)/);
  assert.match(revoke, /v_target = 1 AND v_active <= 1/);
  assert.match(src('.github/workflows/ci.yml'), /p5_minimal_admin\.sql/);
  assert.match(src('.github/workflows/ci.yml'), /test-p5-operator-lock\.sh/);
  assert.match(src('supabase/tests/rls_matrix.sql'), /P5_ADMIN_GRANTS/);
  const pending = JSON.parse(src('supabase/migrations.pending.json')) as { pending: Array<{ version: string }> };
  assert.equal(pending.pending.some(row => row.version === '20260923021000'), false);
  assert.match(src('supabase/schema_migrations.lock.json'), /"version": "20260923021000"/);
  const page = src('src/components/admin/AdminPage.tsx');
  assert.match(page, /p_confirm: true/);
  assert.match(page, /is_platform_operator/);
  assert.match(page, /actionReady/);
  assert.doesNotMatch(page, /\{path\}|filename|reporter_id|\.email/);
  assert.match(src('src/app/router/AppRoutes.tsx'), /path="\/admin"/);
  assert.doesNotMatch(src('src/app/router/AppRoutes.tsx'), /path="\/moderation"/);
  const nav = src('src/app/navigation/navConfig.ts');
  const mobileFn = nav.slice(nav.indexOf('export function mobileTabs'), nav.indexOf('function nonempty'));
  assert.doesNotMatch(mobileFn, /\/admin/);
  assert.match(src('src/components/profile/ProfilePage.tsx'), /is_platform_operator/);
  assert.match(src('src/shared/ui/Button.tsx'), /saturate-0/);
  assert.ok(frAdmin.admin.import.rows_one);
  assert.ok(frAdmin.admin.import.rows_other);
  assert.ok(enAdmin.admin.import.errors_one);
  assert.ok(enAdmin.admin.import.errors_other);
  assert.ok(frAdmin.admin.errors.confirmation_required);
  // Import incidents are visible to operators, paged by keyset, read-only.
  assert.match(page, /admin_list_import_incidents/);
  assert.match(page, /p_before_id: last\.id/);
  assert.ok(frAdmin.admin.incidents.title);
  assert.ok(enAdmin.admin.incidents.kind.body_weight);
  assert.ok(enAdmin.admin.denied);
});
