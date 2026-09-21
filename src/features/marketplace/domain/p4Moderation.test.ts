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
  assert.match(sql, /AND NOT directory_suspended/);
  assert.match(sql, /SET directory_suspended = true/);
  assert.doesNotMatch(sql, /UPDATE public\.coach_client_links/);
  assert.doesNotMatch(sql, /CREATE TABLE.*rating/i);
  assert.doesNotMatch(sql, /star_rating/i);
  assert.doesNotMatch(sql, /subscription/);
  assert.doesNotMatch(sql, /stripe/i);
  const save = latestMigrationContaining('CREATE OR REPLACE FUNCTION public.save_my_coach_profile');
  assert.doesNotMatch(save.sql, /directory_suspended/);
  const explain = latestMigrationContaining('CREATE OR REPLACE FUNCTION public.explain_marketplace_matches');
  assert.equal(explain.file, '20260921024426_p4_marketplace_moderation.sql');
  assert.match(explain.sql, /AND NOT directory_suspended/);
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
  assert.match(src('supabase/tests/p4_marketplace_moderation.sql'), /client flipped directory_suspended/);
  assert.match(src('supabase/tests/rls_matrix.sql'), /submit_marketplace_report/);
  assert.match(src('supabase/tests/rls_matrix.sql'), /review_marketplace_report/);
  const pending = JSON.parse(src('supabase/migrations.pending.json')) as { pending: Array<{ version: string; name: string }> };
  assert.equal(pending.pending.some(row => row.version === '20260921024426'), true);
  assert.doesNotMatch(src('supabase/schema_migrations.lock.json'), /20260921024426/);
  assert.match(src('docs/CHANTIER.md'), /P4\.4/);
});
