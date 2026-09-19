import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { latestMigrationContaining } from './migrationScan';

const src = (path: string) => readFileSync(path, 'utf8');

test('Hotfix B revokes Data API execute on P2 primitives and keeps métier RPCs', () => {
  const mig = latestMigrationContaining('Hotfix B: internal primitive');
  assert.equal(mig.file, '20260919214423_p2_primitive_authority.sql');
  assert.match(mig.sql, /REVOKE ALL ON FUNCTION public\.upsert_athlete_signal/);
  assert.match(mig.sql, /REVOKE ALL ON FUNCTION public\.resolve_athlete_signal/);
  assert.match(mig.sql, /REVOKE ALL ON FUNCTION public\.record_athlete_decision\(uuid, text, text, text, jsonb, text, jsonb, text, jsonb, text, uuid\)/);
  assert.match(mig.sql, /REVOKE ALL ON FUNCTION public\.record_athlete_decision\(uuid, text, text, text, jsonb, text, jsonb, text, jsonb, text, uuid, text, uuid\)/);
  assert.match(mig.sql, /REVOKE ALL ON FUNCTION public\.enqueue_athlete_decision_outbox/);
  assert.match(mig.sql, /REVOKE ALL ON FUNCTION public\.queue_and_record_athlete_decision/);
  assert.match(mig.sql, /FROM PUBLIC, anon, authenticated/);
  assert.match(mig.sql, /GRANT EXECUTE ON FUNCTION public\.upsert_athlete_signal[\s\S]*TO service_role/);
  assert.match(mig.sql, /GRANT EXECUTE ON FUNCTION public\.queue_and_record_athlete_decision[\s\S]*TO service_role/);
  assert.doesNotMatch(mig.sql, /GRANT EXECUTE ON FUNCTION public\.drain_athlete_decision_outbox/);
  assert.doesNotMatch(mig.sql, /REVOKE ALL ON FUNCTION public\.drain_athlete_decision_outbox/);
  assert.doesNotMatch(mig.sql, /REVOKE ALL ON FUNCTION public\.save_athlete_weekly_review/);
  assert.doesNotMatch(mig.sql, /REVOKE ALL ON FUNCTION public\.commit_solo_weekly_review_decision/);
  assert.doesNotMatch(mig.sql, /REVOKE ALL ON FUNCTION public\.apply_intervention/);
  assert.doesNotMatch(mig.sql, /REVOKE ALL ON FUNCTION public\.correct_athlete_watch_context/);
  assert.doesNotMatch(mig.sql, /REVOKE ALL ON FUNCTION public\.decide_athlete_watch_proposal/);

  const pending = JSON.parse(src('supabase/migrations.pending.json')) as {
    pending: Array<{ version: string; name: string }>;
  };
  assert.equal(pending.pending.some((row) => row.version === '20260919214423'), true);
  assert.doesNotMatch(src('supabase/schema_migrations.lock.json'), /"version": "20260919214423"/);

  const sqlTest = src('supabase/tests/p2_primitive_authority.sql');
  assert.match(sqlTest, /primitive % still has default PUBLIC execute/);
  assert.match(sqlTest, /primitive % still granted to anon\/authenticated/);
  assert.match(sqlTest, /primitive % missing service_role execute/);
  assert.match(sqlTest, /drain revoked from clients/);
  assert.match(sqlTest, /weekly review métier RPC revoked/);
  assert.match(sqlTest, /commit_solo métier RPC revoked/);
  assert.match(sqlTest, /apply_intervention métier RPC revoked/);
  assert.match(sqlTest, /watch correct métier RPC revoked/);
  assert.match(sqlTest, /watch decide métier RPC revoked/);
  assert.match(sqlTest, /authenticated upsert_athlete_signal allowed/);
  assert.match(sqlTest, /authenticated queue_and_record allowed/);
  assert.match(sqlTest, /service path upsert failed/);
  assert.match(sqlTest, /coach métier save failed/);
  assert.match(src('.github/workflows/ci.yml'), /p2_primitive_authority\.sql/);
  assert.match(src('.github/workflows/ci.yml'), /p2 primitives: Data API execute revoked, métier RPCs and service path still work/);

  const rls = src('supabase/tests/rls_matrix.sql');
  assert.match(rls, /P2_PRIMITIVE_GRANTS/);
  assert.match(rls, /primitive still executable by Data API/);
  assert.match(rls, /métier RPC or drain revoked/);

  const durability = src('supabase/tests/athlete_decision_durability.sql');
  assert.match(durability, /enqueue exposed to clients/);
  assert.match(durability, /queue_and_record exposed to clients/);
  assert.match(durability, /signal primitives exposed to clients/);
  assert.match(durability, /authenticated queue_and_record allowed/);

  const api = src('src/features/signals/domain/decisionLogApi.ts');
  assert.doesNotMatch(api, /rpc\('record_athlete_decision'/);
  assert.doesNotMatch(api, /rpc\('queue_and_record_athlete_decision'/);
  assert.doesNotMatch(api, /rpc\('enqueue_athlete_decision_outbox'/);
  assert.match(api, /drain_athlete_decision_outbox/);
  assert.doesNotMatch(api, /recordAthleteDecisionDurable/);
  assert.doesNotMatch(api, /recordAthleteDecisionBestEffort/);
  assert.doesNotMatch(api, /RecordAthleteDecisionInput/);
  assert.doesNotMatch(api, /decisionIdempotencyKey/);
  assert.doesNotMatch(src('src/features/signals/domain/athleteSignalsApi.ts'), /rpc\('upsert_athlete_signal'/);
  assert.doesNotMatch(src('src/features/coaching/model/interventionsSlice.ts'), /journalInterventionDecision/);

  const contract = src('src/features/signals/domain/backendContract.ts');
  assert.doesNotMatch(contract, /Fail-open until P2 candidates are applied in production/);
  assert.match(contract, /Never fail-open/);
  assert.match(contract, /commit_solo_weekly_review_decision is the only/);

  const solo = src('src/stores/soloCopilotStore.ts');
  assert.doesNotMatch(solo, /isMissingBackendContract/);
  assert.doesNotMatch(solo, /updateProfile/);
  assert.doesNotMatch(solo, /recordAthleteDecision/);
});
