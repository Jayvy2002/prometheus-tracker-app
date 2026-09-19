import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { latestMigrationContaining } from './migrationScan';

const src = (path: string) => readFileSync(path, 'utf8');

test('Hotfix A freezes coach_client_links identity and keeps métier RPCs', () => {
  const mig = latestMigrationContaining('protect_coach_client_link_identity');
  assert.equal(mig.file, '20260919202538_coach_client_link_immutability.sql');
  assert.match(mig.sql, /coach_client_link_identity_immutable/);
  assert.match(mig.sql, /REVOKE ALL ON TABLE public\.coach_client_links FROM PUBLIC, anon/);
  assert.match(mig.sql, /REVOKE INSERT, DELETE, TRUNCATE, UPDATE ON TABLE public\.coach_client_links FROM authenticated/);
  assert.match(mig.sql, /GRANT UPDATE \(last_visited_at, last_nudged_at, updated_at\)/);
  assert.match(mig.sql, /WITH CHECK \(coach_id = \(select auth\.uid\(\)\) AND status = 'active'\)/);
  assert.doesNotMatch(mig.sql, /GRANT UPDATE \(status/);

  const pending = JSON.parse(src('supabase/migrations.pending.json')) as {
    pending: Array<{ version: string; name: string }>;
  };
  assert.equal(pending.pending.some((row) => row.version === '20260919202538'), true);
  assert.doesNotMatch(src('supabase/schema_migrations.lock.json'), /20260919202538/);

  const sqlTest = src('supabase/tests/coach_client_link_immutability.sql');
  assert.match(sqlTest, /coach retargeted client_id without error/);
  assert.match(sqlTest, /coach ended link via Data API/);
  assert.match(sqlTest, /former coach resurrected via Data API/);
  assert.match(sqlTest, /end_coach_client_link/);
  assert.match(sqlTest, /client_end_coach_link/);
  assert.match(sqlTest, /activate_coaching_relationship/);
  assert.match(src('.github/workflows/ci.yml'), /coach_client_link_immutability\.sql/);
});
