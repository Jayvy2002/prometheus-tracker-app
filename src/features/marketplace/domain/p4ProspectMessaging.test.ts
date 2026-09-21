import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

test('P4.3 prospect messaging opens the thread without is_coach_of or the dossier boundary', () => {
  const sql = src('supabase/migrations/20260921023720_p4_prospect_messaging.sql');
  assert.match(sql, /CREATE OR REPLACE FUNCTION public.marketplace_open_prospect\(p_coach uuid, p_client uuid\)/);
  assert.match(sql, /status = 'coach_accepted'/);
  assert.match(sql, /template_key IN \('prospect', 'reply'\)/);
  assert.match(sql, /public.marketplace_open_prospect\(v_uid, p_client_id\)/);
  assert.doesNotMatch(sql, /GRANT EXECUTE ON FUNCTION public.marketplace_open_prospect\(uuid, uuid\) TO anon/);
  assert.doesNotMatch(sql, /is_coach_of.*coach_accepted/);
  assert.doesNotMatch(sql, /subscription/);
  const routes = src('src/app/router/AppRoutes.tsx');
  assert.match(routes, /path="\/messages\/:clientId" element=\{<CoachOnly><CoachMessageAccess>/);
  assert.doesNotMatch(routes, /path="\/messages\/:clientId" element=\{<CoachOnly><ActiveRelationshipBoundary>/);
  assert.match(routes, /path="\/clients\/:id" element=\{<CoachOnly><ActiveRelationshipBoundary>/);
  assert.match(src('src/components/coaching/CoachInboxPage.tsx'), /coach_accepted/);
  assert.match(src('src/components/coaching/ClientMessagesPage.tsx'), /coach_accepted/);
  assert.match(src('src/components/marketplace/MarketplacePage.tsx'), /openConversation/);
  assert.match(src('src/features/coaching/domain/coachQueue.ts'), /'prospect'/);
  assert.match(src('src/features/coaching/model/messagesSlice.ts'), /pCoachId/);
  assert.match(src('.github/workflows/ci.yml'), /p4_prospect_messaging\.sql/);
  assert.match(src('supabase/tests/p4_prospect_messaging.sql'), /prospect gained is_coach_of/);
  assert.match(src('supabase/tests/p4_prospect_messaging.sql'), /prospect coach read photos/);
  assert.match(src('supabase/tests/p4_prospect_messaging.sql'), /activation dropped prospect thread/);
  assert.match(src('supabase/tests/p4_prospect_messaging.sql'), /^ROLLBACK;/m);
  assert.doesNotMatch(src('supabase/tests/p4_prospect_messaging.sql'), /^COMMIT;/m);
  assert.match(src('supabase/tests/rls_matrix.sql'), /marketplace_open_prospect/);
  const pending = JSON.parse(src('supabase/migrations.pending.json')) as { pending: Array<{ version: string; name: string }> };
  assert.equal(pending.pending.some(row => row.version === '20260921023720'), true);
  assert.doesNotMatch(src('supabase/schema_migrations.lock.json'), /20260921023720/);
});
