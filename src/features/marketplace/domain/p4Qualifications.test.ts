import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import {
  coachHasVerifiedBadge,
  ownedQualificationProofPath,
  publicQualifications,
  qualificationEffectiveStatus,
  type CoachQualification,
} from './marketplace';

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
  assert.equal(ownedQualificationProofPath('c4100000-0000-4000-8000-000000000001', 'c4100000-0000-4000-8000-000000000099', 'c4100000-0000-4000-8000-000000000001/c4100000-0000-4000-8000-000000000099/proof.pdf'), true);
  assert.equal(ownedQualificationProofPath('c4100000-0000-4000-8000-000000000001', 'c4100000-0000-4000-8000-000000000099', 'c4100000-0000-4000-8000-000000000002/c4100000-0000-4000-8000-000000000099/proof.pdf'), false);
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
  assert.match(src('src/components/marketplace/MarketplacePage.tsx'), /CoachQualificationsPanel/);
  assert.match(src('src/components/marketplace/CoachDirectoryCard.tsx'), /verifiedBadge/);
  assert.match(src('docs/CHANTIER.md'), /P4\.1/);
  const pending = JSON.parse(src('supabase/migrations.pending.json')) as { pending: Array<{ version: string; name: string }> };
  assert.equal(pending.pending.some(row => row.version === '20260921021231'), true);
  assert.doesNotMatch(src('supabase/schema_migrations.lock.json'), /20260921021231/);
  assert.match(src('.github/workflows/ci.yml'), /p4_coach_qualifications\.sql/);
  assert.match(src('supabase/tests/p4_coach_qualifications.sql'), /publish required a verified badge/);
  assert.match(src('supabase/tests/p4_coach_qualifications.sql'), /unverified badge shown/);
  assert.match(src('supabase/tests/p4_coach_qualifications.sql'), /^ROLLBACK;/m);
  assert.doesNotMatch(src('supabase/tests/p4_coach_qualifications.sql'), /^COMMIT;/m);
  assert.match(src('supabase/tests/p4_coach_qualifications.sql'), /foreign proof_path accepted/);
  assert.match(src('supabase/tests/p4_coach_qualifications.sql'), /stranger selected owner qualification table/);
  assert.match(src('supabase/tests/p4_coach_qualifications.sql'), /public qualification leaked internal fields/);
  assert.match(src('supabase/tests/p4_coach_qualifications.sql'), /reviewer_ref was not durable/);
  assert.match(found, /list_public_coach_qualifications/);
  assert.match(found, /qualification_owned_proof_path/);
  assert.match(found, /qualification_proof_object_exists/);
  assert.match(found, /proof_missing/);
  assert.match(found, /qualification_delete_proof_objects/);
  assert.match(found, /verification_status IN \('declared', 'rejected'\)/);
  assert.match(src('supabase/tests/p4_coach_qualifications.sql'), /submit without storage object/);
  assert.match(src('supabase/tests/p4_coach_qualifications.sql'), /pending proof update allowed/);
  assert.match(src('supabase/tests/p4_coach_qualifications.sql'), /withdraw left proof object/);
  assert.match(found, /coach_id = \(SELECT auth.uid\(\)\)/);
  assert.doesNotMatch(found, /verification_status <> 'rejected'\s+AND EXISTS/);
  assert.match(src('src/features/marketplace/domain/marketplaceApi.ts'), /list_public_coach_qualifications/);
  assert.doesNotMatch(src('src/components/marketplace/MarketplacePage.tsx'), /from\('coach_qualifications'\)/);
  assert.match(src('supabase/tests/rls_matrix.sql'), /declare_coach_qualification/);
});
