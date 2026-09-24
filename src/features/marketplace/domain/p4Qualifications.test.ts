import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import {
  buildQualificationProofPath,
  coachHasVerifiedBadge,
  ownedQualificationProofPath,
  publicQualifications,
  qualificationEffectiveStatus,
  type CoachQualification,
} from './marketplace';
import { marketplaceUiSource } from '../../../lib/marketplaceUiSource';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

function row(status: CoachQualification['verification_status'], expires_on: string | null = null): CoachQualification {
  return {
    id: 'q', coach_id: 'c', title: 'CSCS', qualification_type: 'certification', issuer: 'NSCA',
    declared_at: '', proof_path: 'proof.pdf', verification_status: status, verified_at: status === 'verified' ? '2026-01-01' : null,
    reviewer_id: null, expires_on, review_note: status === 'rejected' ? 'nope' : null, updated_at: '',
  };
}

test('verified qualifications expire on the civil date without becoming a ranking', () => {
  assert.equal(qualificationEffectiveStatus(row('verified', '2026-09-20'), '2026-09-21'), 'expired');
  assert.equal(qualificationEffectiveStatus(row('verified', '2026-09-21'), '2026-09-21'), 'verified');
  assert.equal(qualificationEffectiveStatus(row('pending', '2020-01-01'), '2026-09-21'), 'pending');
  assert.equal(publicQualifications([row('rejected'), row('declared')]).map(q => q.verification_status).join(), 'declared');
  assert.equal(coachHasVerifiedBadge([row('declared'), row('verified')]), true);
  assert.equal(coachHasVerifiedBadge([row('declared')]), false);
  assert.equal(coachHasVerifiedBadge([row('verified', '2020-01-01')], '2026-09-21'), false);
  const coach = 'c4100000-0000-4000-8000-000000000001';
  const qid = 'c4100000-0000-4000-8000-000000000099';
  const immutable = `${coach}/${qid}/proof-aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.pdf`;
  assert.equal(ownedQualificationProofPath(coach, qid, immutable), true);
  assert.equal(ownedQualificationProofPath(coach, qid, `${coach}/${qid}/proof.pdf`), false);
  assert.equal(ownedQualificationProofPath(coach, qid, `${coach}/${qid}/proof-not-a-uuid.pdf`), false);
  assert.equal(ownedQualificationProofPath('c4100000-0000-4000-8000-000000000002', qid, immutable), false);
  assert.equal(
    buildQualificationProofPath(coach, qid, 'pdf', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
    immutable,
  );
  assert.match(buildQualificationProofPath(coach, qid, 'jpg'), new RegExp(`^${coach}/${qid}/proof-[0-9a-f-]{36}\\.jpg$`, 'i'));
});

test('P4.1 qualifications reuse marketplace publish and never require a verified badge', () => {
  const found = src('supabase/migrations/20260921021231_p4_coach_qualifications.sql');
  assert.match(found, /CREATE TABLE IF NOT EXISTS public.coach_qualifications/);
  assert.match(found, /verification_status IN \('declared', 'pending', 'verified', 'rejected', 'expired'\)/);
  assert.match(found, /GRANT EXECUTE ON FUNCTION public.review_coach_qualification\(uuid, text, text\) TO service_role/);
  assert.doesNotMatch(found, /GRANT EXECUTE ON FUNCTION public.review_coach_qualification\(uuid, text, text\) TO authenticated/);
  assert.match(found, /qualification-proofs/);
  assert.doesNotMatch(found, /CREATE TABLE.*rating/i);
  assert.doesNotMatch(found, /star_rating/i);
  assert.doesNotMatch(found, /subscription/);
  assert.match(marketplaceUiSource(), /CoachQualificationsPanel/);
  assert.match(src('src/components/marketplace/CoachDirectoryCard.tsx'), /verifiedBadge/);
  assert.match(src('docs/CHANTIER.md'), /P4\.1/);
  assert.match(src('docs/CHANTIER.md'), /proof-<uuid>/);
  assert.match(src('docs/CHANTIER.md'), /Edge `delete-account`/);
  assert.match(src('docs/P4_1_QUALIFICATIONS.md'), /upsert: false/);
  assert.match(src('src/i18n/locales/fr/common.ts'), /storageCleanupFailed/);
  assert.match(src('src/i18n/locales/en/common.ts'), /storageCleanupFailed/);
  assert.match(src('src/components/profile/ProfilePage.tsx'), /storage_cleanup_failed/);
  const pending = JSON.parse(src('supabase/migrations.pending.json')) as { pending: Array<{ version: string; name: string }> };
  assert.equal(pending.pending.some(row => row.version === '20260921021231'), false);
  assert.match(src('supabase/schema_migrations.lock.json'), /"version": "20260921021231"/);
  assert.match(src('.github/workflows/ci.yml'), /p4_coach_qualifications\.sql/);
  assert.match(src('supabase/tests/p4_coach_qualifications.sql'), /publish required a verified badge/);
  assert.match(src('supabase/tests/p4_coach_qualifications.sql'), /unverified badge shown/);
  assert.match(src('supabase/tests/p4_coach_qualifications.sql'), /^ROLLBACK;/m);
  assert.doesNotMatch(src('supabase/tests/p4_coach_qualifications.sql'), /^COMMIT;/m);
  assert.match(src('supabase/tests/p4_coach_qualifications.sql'), /foreign proof_path accepted/);
  assert.match(src('supabase/tests/p4_coach_qualifications.sql'), /mutable proof path accepted/);
  assert.match(src('supabase/tests/p4_coach_qualifications.sql'), /stranger selected owner qualification table/);
  assert.match(src('supabase/tests/p4_coach_qualifications.sql'), /public qualification leaked internal fields/);
  assert.match(src('supabase/tests/p4_coach_qualifications.sql'), /reviewer_ref was not durable/);
  assert.match(found, /list_public_coach_qualifications/);
  assert.match(found, /qualification_owned_proof_path/);
  assert.match(found, /qualification_proof_object_exists/);
  assert.match(found, /proof_missing/);
  assert.match(found, /proof_cleanup_required/);
  assert.doesNotMatch(found, /CREATE OR REPLACE FUNCTION public\.qualification_delete_proof_objects/);
  assert.doesNotMatch(found, /DELETE FROM storage\.objects/);
  assert.match(found, /verification_status IN \('declared', 'rejected'\)/);
  assert.match(src('supabase/tests/p4_coach_qualifications.sql'), /submit without storage object/);
  assert.match(src('supabase/tests/p4_coach_qualifications.sql'), /pending proof update allowed/);
  assert.match(src('supabase/tests/p4_coach_qualifications.sql'), /withdraw succeeded while proof object existed/);
  assert.match(src('supabase/tests/p4_coach_qualifications.sql'), /withdraw deleted storage catalog without Storage API/);
  assert.match(src('src/features/marketplace/domain/marketplaceApi.ts'), /qualification-proofs'\)\.remove/);
  assert.match(src('src/features/marketplace/domain/marketplaceApi.ts'), /upsert:\s*false/);
  assert.doesNotMatch(src('src/features/marketplace/domain/marketplaceApi.ts'), /upsert:\s*true/);
  assert.match(src('src/features/marketplace/domain/marketplaceApi.ts'), /buildQualificationProofPath/);
  assert.match(found, /proof-\[0-9a-f\]\{8\}/);
  assert.doesNotMatch(found, /CREATE POLICY "Coaches update qualification proofs"/);
  assert.match(src('src/components/marketplace/CoachQualificationsPanel.tsx'), /removeQualificationProof/);
  assert.match(src('scripts/test-qualification-proof-storage.sh'), /storage\/v1\/object/);
  assert.match(src('scripts/test-qualification-proof-storage.sh'), /prefixes/);
  assert.match(src('scripts/test-qualification-proof-storage.sh'), /proof_cleanup_required/);
  assert.match(src('.github/workflows/ci.yml'), /test-qualification-proof-storage\.sh/);
  for (const file of [
    '20260921021231_p4_coach_qualifications.sql',
    '20260921021923_p4_explained_matching.sql',
    '20260921023720_p4_prospect_messaging.sql',
    '20260921024426_p4_marketplace_moderation.sql',
  ]) {
    assert.doesNotMatch(src(`supabase/migrations/${file}`), /DELETE FROM storage\.objects/);
  }
  assert.match(found, /coach_id = \(SELECT auth.uid\(\)\)/);
  assert.doesNotMatch(found, /verification_status <> 'rejected'\s+AND EXISTS/);
  assert.match(src('src/features/marketplace/domain/marketplaceApi.ts'), /list_public_coach_qualifications/);
  assert.doesNotMatch(marketplaceUiSource(), /from\('coach_qualifications'\)/);
  assert.match(src('supabase/tests/rls_matrix.sql'), /declare_coach_qualification/);
});
