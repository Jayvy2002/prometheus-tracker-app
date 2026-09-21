import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { latestMigrationContaining } from '../../../lib/migrationScan';
import { reportIsOpen, type ReportStatus } from './marketplace';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

test('open reports stay in the queue until resolved or dismissed', () => {
  assert.equal(reportIsOpen('open'), true);
  assert.equal(reportIsOpen('in_review'), true);
  assert.equal(reportIsOpen('resolved' as ReportStatus), false);
  assert.equal(reportIsOpen('dismissed'), false);
});

test('P4.4 moderation is a report queue and directory hold, not ratings or an admin SPA', () => {
  const sql = src('supabase/migrations/20260921024426_p4_marketplace_moderation.sql');
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public.marketplace_reports/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public.marketplace_moderation_actions/);
  assert.match(sql, /status IN \('open', 'in_review', 'resolved', 'dismissed'\)/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public.submit_marketplace_report\(uuid, text, text, text, uuid\) TO authenticated/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public.review_marketplace_report\(uuid, text, text\) TO service_role/);
  assert.doesNotMatch(sql, /GRANT EXECUTE ON FUNCTION public.review_marketplace_report\(uuid, text, text\) TO authenticated/);
  assert.match(sql, /marketplace_coach_discoverable/);
  assert.match(sql, /directory_hold_active/);
  assert.match(sql, /marketplace_refresh_directory_suspended/);
  assert.doesNotMatch(sql, /UPDATE public\.coach_client_links/);
  assert.doesNotMatch(sql, /CREATE TABLE.*rating/i);
  assert.doesNotMatch(sql, /star_rating/i);
  assert.doesNotMatch(sql, /subscription/);
  assert.doesNotMatch(sql, /stripe/i);
  const save = latestMigrationContaining('CREATE OR REPLACE FUNCTION public.save_my_coach_profile');
  assert.doesNotMatch(save.sql, /directory_suspended/);
  const requestFn = latestMigrationContaining('CREATE OR REPLACE FUNCTION public.request_coaching');
  assert.equal(requestFn.file, '20260921024426_p4_marketplace_moderation.sql');
  const reqStart = requestFn.sql.lastIndexOf('CREATE OR REPLACE FUNCTION public.request_coaching');
  const reqEnd = requestFn.sql.indexOf('REVOKE ALL ON FUNCTION public.request_coaching', reqStart);
  const reqBody = requestFn.sql.slice(reqStart, reqEnd);
  assert.match(reqBody, /marketplace_coach_discoverable/);
  assert.match(reqBody, /lock_coach_relationship_lifecycle\(p_coach\)/);
  const mutexAt = reqBody.indexOf('lock_coach_relationship_lifecycle(p_coach)');
  const rolesAt = reqBody.indexOf('user_roles WHERE user_id = v_uid FOR UPDATE');
  const shareAt = reqBody.indexOf('AND NOT directory_suspended');
  const insertAt = reqBody.indexOf('INSERT INTO public.coach_join_requests');
  assert.ok(mutexAt >= 0 && rolesAt > mutexAt && shareAt > rolesAt && insertAt > shareAt, 'request_coaching must take Coach mutex, then client locks, then profile FOR SHARE, then INSERT');
  assert.match(reqBody, /p_sharing_version IS DISTINCT FROM 2 AND p_sharing_version IS DISTINCT FROM 3/);
  assert.match(sql, /lock_marketplace_directory_hold/);
  assert.match(sql, /20014503/);
  assert.match(sql, /report_key_conflict/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public.lock_marketplace_directory_hold\(uuid\) FROM PUBLIC, anon, authenticated/);
  assert.doesNotMatch(sql, /GRANT EXECUTE ON FUNCTION public.lock_marketplace_directory_hold\(uuid\) TO authenticated/);
  assert.match(sql, /marketplace_audit_actor\(\)/);
  assert.match(sql, /v_actor text := public\.marketplace_audit_actor\(\)/);
  assert.match(sql, /VALUES \(v_row\.id, p_action, v_note, v_actor\)/);
  assert.doesNotMatch(sql, /DEFAULT CURRENT_USER/);
  assert.match(src('supabase/tests/p4_marketplace_moderation.sql'), /new request reached suspended coach/);
  assert.match(src('supabase/tests/p4_marketplace_moderation.sql'), /in-flight pending prospect closed by suspend/);
  assert.match(src('supabase/tests/p4_marketplace_moderation.sql'), /suspended qualification badge leaked/);
  assert.match(src('supabase/tests/p4_marketplace_moderation.sql'), /durable actor/);
  assert.doesNotMatch(save.sql, /directory_suspended/);
  const explain = latestMigrationContaining('CREATE OR REPLACE FUNCTION public.explain_marketplace_matches');
  assert.equal(explain.file, '20260921024426_p4_marketplace_moderation.sql');
  assert.match(explain.sql, /marketplace_coach_discoverable/);
  assert.match(explain.sql, /array_append\(v_req, 'discipline'\)/);
  assert.doesNotMatch(explain.sql, /v_req := v_req \|\| '/);
  assert.match(src('src/components/marketplace/MarketplacePage.tsx'), /MarketplaceReportForm/);
  assert.match(src('src/components/marketplace/MarketplacePage.tsx'), /MarketplaceReportsList/);
  assert.match(src('src/components/marketplace/MarketplacePage.tsx'), /directory_suspended/);
  assert.doesNotMatch(src('src/app/router/AppRoutes.tsx'), /path="\/moderation"/);
  const nav = src('src/app/navigation/navConfig.ts');
  const mobileFn = nav.slice(nav.indexOf('export function mobileTabs'), nav.indexOf('function nonempty'));
  assert.doesNotMatch(mobileFn, /report/);
  assert.doesNotMatch(mobileFn, /\/moderation/);
  assert.match(src('src/i18n/locales/fr/marketplace.ts'), /pas une note/);
  assert.match(src('src/i18n/locales/en/marketplace.ts'), /This is not a rating/);
  assert.match(src('.github/workflows/ci.yml'), /p4_marketplace_moderation\.sql/);
  assert.match(src('supabase/tests/p4_marketplace_moderation.sql'), /eligible coach missing from matching/);
  assert.match(src('supabase/tests/p4_marketplace_moderation.sql'), /powerlifting/);
  assert.match(src('supabase/tests/p4_marketplace_moderation.sql'), /self report accepted/);
  assert.match(src('supabase/tests/p4_marketplace_moderation.sql'), /target read reporter identity/);
  assert.match(src('supabase/tests/p4_marketplace_moderation.sql'), /suspended coach remained in matching/);
  assert.match(src('supabase/tests/p4_marketplace_moderation.sql'), /suspend ended coaching link/);
  assert.match(src('supabase/tests/p4_marketplace_moderation.sql'), /restoring A lifted B hold/);
  assert.match(src('supabase/tests/p4_marketplace_moderation.sql'), /reporter delete dropped report/);
  assert.match(src('supabase/tests/p4_marketplace_moderation.sql'), /coach without capability still matched/);
  assert.match(src('supabase/tests/p4_marketplace_moderation.sql'), /closed coach republished/);
  assert.match(src('supabase/tests/p4_marketplace_moderation.sql'), /report idempotency lost/);
  assert.match(src('supabase/tests/p4_marketplace_moderation.sql'), /report key collision accepted/);
  assert.match(src('supabase/tests/p4_marketplace_moderation.sql'), /second report after success reused the first row/);
  assert.match(src('src/components/marketplace/MarketplaceReportForm.tsx'), /clearCoachingReportKey/);
  assert.match(src('scripts/test-request-coaching-lifecycle.sh'), /wait_event_type = 'Lock'/);
  assert.match(src('scripts/test-request-coaching-lifecycle.sh'), /request_coaching × close_coach_account/);
  assert.match(src('scripts/test-request-coaching-lifecycle.sh'), /request_coaching × suspend_directory/);
  assert.match(src('scripts/test-directory-hold-mutex.sh'), /restore pendant B suspend/);
  assert.match(src('scripts/test-directory-hold-mutex.sh'), /suspend pendant A restore/);
  assert.match(src('.github/workflows/ci.yml'), /test-request-coaching-lifecycle\.sh/);
  assert.match(src('.github/workflows/ci.yml'), /test-directory-hold-mutex\.sh/);
  assert.match(src('supabase/tests/p4_marketplace_moderation.sql'), /^ROLLBACK;/m);
  assert.doesNotMatch(src('supabase/tests/p4_marketplace_moderation.sql'), /^COMMIT;/m);
  for (const slice of [
    'p4_coach_qualifications.sql',
    'p4_explained_matching.sql',
    'p4_prospect_messaging.sql',
  ]) {
    assert.match(src(`supabase/tests/${slice}`), /^ROLLBACK;/m);
    assert.doesNotMatch(src(`supabase/tests/${slice}`), /^COMMIT;/m);
  }
  assert.match(src('supabase/tests/rls_matrix.sql'), /submit_marketplace_report/);
  assert.match(src('supabase/tests/rls_matrix.sql'), /review_marketplace_report/);
  assert.match(src('supabase/tests/rls_matrix.sql'), /lock_marketplace_directory_hold/);
  assert.match(src('supabase/tests/rls_matrix.sql'), /qualification_delete_proof_objects\(uuid,uuid,text\)\) IS NULL/);
  const pending = JSON.parse(src('supabase/migrations.pending.json')) as { pending: Array<{ version: string; name: string }> };
  assert.equal(pending.pending.some(row => row.version === '20260921024426'), true);
  assert.doesNotMatch(src('supabase/schema_migrations.lock.json'), /20260921024426/);
  assert.match(src('docs/CHANTIER.md'), /P4\.4/);
});
