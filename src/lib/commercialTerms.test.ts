import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import {
  COACH_GRACE_DAYS,
  COMMERCIAL_PRICES,
  coachGraceEndsAt,
  SOLO_TRIAL_DAYS,
  soloTrialEndsAt,
} from './commercialTerms';
import { latestMigrationContaining } from './migrationScan';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

const START = new Date('2026-09-05T12:00:00Z');

test('commercial terms: one TypeScript definition for 14-day Solo trial and 7-day Coach grace', () => {
  assert.equal(SOLO_TRIAL_DAYS, 14);
  assert.equal(COACH_GRACE_DAYS, 7);
  assert.equal(COMMERCIAL_PRICES.status, 'undecided');
  assert.equal(soloTrialEndsAt(START).toISOString(), '2026-09-19T12:00:00.000Z');
  assert.equal(coachGraceEndsAt(START).toISOString(), '2026-09-12T12:00:00.000Z');

  const moduleSrc = src('src/lib/commercialTerms.ts');
  assert.match(moduleSrc, /SOLO_TRIAL_DAYS = 14/);
  assert.match(moduleSrc, /COACH_GRACE_DAYS = 7/);
  assert.doesNotMatch(moduleSrc, /stripe/i);
  assert.doesNotMatch(moduleSrc, /€|\$\d|eur\b|usd\b/i);
  assert.doesNotMatch(moduleSrc, /SOLO_TRIAL_DAYS = 30/);
  assert.doesNotMatch(moduleSrc, /COACH_GRACE_DAYS = 30/);
});

test('soloTransition re-exports the unique trial constant; live SQL stamps 14 days via the helper', () => {
  const solo = src('src/lib/soloTransition.ts');
  assert.match(solo, /export \{ SOLO_TRIAL_DAYS \} from '\.\/commercialTerms'/);
  assert.doesNotMatch(solo, /SOLO_TRIAL_DAYS = 30/);
  assert.doesNotMatch(src('src/shared/types.ts'), /30 days/);
  assert.match(src('src/shared/types.ts'), /14 days/);

  const latest = latestMigrationContaining('CREATE OR REPLACE FUNCTION public.transition_client_to_solo');
  assert.equal(latest.file, '20260918182954_commercial_durations.sql');
  assert.match(latest.sql, /solo_trial_interval\(\)/);
  assert.match(latest.sql, /coach_grace_interval\(\)/);
  assert.match(latest.sql, /interval '14 days'/);
  assert.match(latest.sql, /interval '7 days'/);
  assert.match(latest.sql, /COALESCE\(solo_trial_ends_at, now\(\) \+ public\.solo_trial_interval\(\)\)/);
  assert.doesNotMatch(latest.sql, /interval '30 days'/);
  assert.doesNotMatch(latest.sql, /stripe/i);
  assert.doesNotMatch(latest.sql, /GRANT EXECUTE ON FUNCTION public\.transition_client_to_solo\(uuid, uuid\) TO authenticated/);
  assert.doesNotMatch(latest.sql, /GRANT EXECUTE ON FUNCTION public\.solo_trial_interval\(\) TO authenticated/);
  assert.doesNotMatch(latest.sql, /GRANT EXECUTE ON FUNCTION public\.coach_grace_interval\(\) TO authenticated/);
  assert.doesNotMatch(latest.sql, /ADD COLUMN\b[\s\S]*coach_grace_ends_at|coach_grace_ends_at\s+timestamptz/);
});

test('historical 30-day stamps stay in applied migrations; pending carries the 14-day candidate', () => {
  const historical = src('supabase/migrations/20260905002213_end_coach_link_back_to_solo.sql');
  assert.match(historical, /COALESCE\(solo_trial_ends_at, now\(\) \+ interval '30 days'\)/);
  const previousLive = src('supabase/migrations/20260913235158_marketplace_audit_hardening.sql');
  assert.match(previousLive, /COALESCE\(solo_trial_ends_at, now\(\) \+ interval '30 days'\)/);

  const lock = src('supabase/schema_migrations.lock.json');
  const pending = JSON.parse(src('supabase/migrations.pending.json')) as {
    pending: Array<{ version: string; name: string }>;
  };
  assert.equal(pending.pending.length, 1);
  assert.equal(pending.pending[0].version, '20260918182954');
  assert.equal(pending.pending[0].name, 'commercial_durations');
  assert.doesNotMatch(lock, /"name": "commercial_durations"/);
  assert.match(lock, /"version": "20260918130232"/);

  const sqlTest = src('supabase/tests/commercial_durations.sql');
  assert.match(sqlTest, /solo trial interval is not 14 days/);
  assert.match(sqlTest, /coach grace interval is not 7 days/);
  assert.match(sqlTest, /solo_trial_interval exposed/);
  assert.match(sqlTest, /live transition still mentions 30 days/);
  const departure = src('supabase/tests/client_departure.sql');
  assert.match(departure, /solo trial not stamped to 14 days/);
  assert.match(departure, /solo trial shortened or rewritten/);

  const ci = src('.github/workflows/ci.yml');
  assert.match(ci, /commercial_durations\.sql/);
  assert.match(ci, /commercial durations: solo trial 14 days and coach grace 7 days/);
  assert.match(ci, /set -euo pipefail/);

  const chantier = src('docs/CHANTIER.md');
  assert.match(chantier, /P1\.5\s*:\s*Règles commerciales constantes/);
  assert.match(src('docs/P1_5_COMMERCIAL_TERMS.md'), /SOLO_TRIAL_DAYS = 14/);
  assert.match(src('docs/P1_5_COMMERCIAL_TERMS.md'), /COACH_GRACE_DAYS = 7/);
  assert.match(src('docs/P1_5_COMMERCIAL_TERMS.md'), /Hors scope/);
  assert.match(src('docs/P1_5_COMMERCIAL_TERMS.md'), /P6/);
});
