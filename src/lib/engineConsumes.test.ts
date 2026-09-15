import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { compactLoopContext } from '../../supabase/functions/_shared/coachAgent.ts';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

test('agent payload includes loop_context (messages, notes, check-in scores, photo dates)', () => {
  const shared = src('supabase/functions/_shared/coachAgent.ts');
  assert.match(shared, /export function compactLoopContext/);
  assert.match(shared, /async function fetchLoopContext/);
  assert.match(shared, /loop_context: loopContext/);
  assert.match(shared, /from\("coach_messages"\)/);
  assert.match(shared, /from\("coach_notes"\)/);
  assert.match(shared, /from\("progress_photos"\)/);
  assert.match(shared, /select\("taken_at, kind"\)/);
  assert.match(shared, /Si "loop_context" est présent/);
  assert.doesNotMatch(shared, /storage_path/);

  const compact = compactLoopContext({
    messages: [{ body: 'Salut', sender_id: 'c', coach_id: 'c', created_at: '2026-09-01T10:00:00Z' }],
    notes: [{ body: 'Genou sensible', note_date: '2026-09-01' }],
    checkins: [{ checked_at: '2026-09-01', hunger: 8, mood: 3, stress: 7, notes: 'difficile' }],
    photos: [{ taken_at: '2026-09-01', kind: 'front', storage_path: 'secret/path.jpg' }],
  });
  assert.ok(compact);
  const photos = compact.progress_photos as Array<Record<string, unknown>>;
  assert.equal(photos[0]?.kind, 'front');
  assert.equal(photos[0]?.storage_path, undefined);
  const checkins = compact.checkins as Array<Record<string, unknown>>;
  assert.equal(checkins[0]?.hunger, 8);
  assert.equal(checkins[0]?.stress, 7);
});

test('triage_coach_fleet latest definition emits hunger/mood/stress averages and available_weekdays', () => {
  const sql = src('supabase/migrations/20260906031832_engine_consumes_data.sql');
  assert.match(sql, /AVG\(c\.hunger\)/);
  assert.match(sql, /AVG\(c\.mood\)/);
  assert.match(sql, /AVG\(c\.stress\)/);
  assert.match(sql, /'avg_hunger'/);
  assert.match(sql, /'available_weekdays'/);
  assert.match(sql, /WHEN 'dim' THEN 0/);
  assert.match(sql, /joursDispo/);
});

test('onboarding UI no longer writes dead profile fields the engine never reads', () => {
  const flow = src('src/components/onboarding/OnboardingFlow.tsx');
  assert.match(flow, /const TOTAL_STEPS = 7/);
  assert.doesNotMatch(flow, /stress_level/);
  assert.doesNotMatch(flow, /supplement_use/);
  assert.doesNotMatch(flow, /meals_per_day/);
  assert.doesNotMatch(flow, /cooking_level/);
  assert.doesNotMatch(flow, /form\.motivation/);
  assert.doesNotMatch(flow, /StepSupplements/);
  assert.match(flow, /hydration_habit/);
});

test('coach learned screen reads lessons + fleet rounds (RLS coach_id = uid)', () => {
  const page = src('src/components/coaching/CoachLearnedPage.tsx');
  assert.match(page, /from\('coach_agent_lessons'\)/);
  assert.match(page, /from\('coach_ai_rounds'\)/);
  assert.match(page, /coaching\.learned\.title/);
  const app = src('src/App.tsx') + src('src/app/bootstrap/useAuthenticatedSession.ts') + src('src/app/guards/RouteGuards.tsx') + src('src/app/router/AppRoutes.tsx');
  assert.match(app, /path="\/coach\/learned" element=\{<CoachOnly>/);
  const settings = src('src/components/coaching/CoachSettingsPanel.tsx');
  assert.match(settings, /to="\/coach\/learned"/);
  const lessonsSql = src('supabase/migrations/20260829124523_coach_agent_lessons.sql');
  assert.match(lessonsSql, /USING \(coach_id = \(select auth\.uid\(\)\)\)/);
  const roundsSql = src('supabase/migrations/20260829112641_coach_fleet_rounds.sql');
  assert.match(roundsSql, /USING \(coach_id = \(select auth\.uid\(\)\)\)/);
});

test('learned + check-in score copy exists in FR and EN', () => {
  const fr = src('src/i18n/locales/fr.ts');
  const en = src('src/i18n/locales/en.ts');
  for (const key of [
    'coaching.learned.title',
    'high_stress',
    'low_mood',
    'high_hunger',
  ]) {
    if (key === 'coaching.learned.title') {
      assert.match(fr, /title: 'Ce que Prometheus a appris'/);
      assert.match(en, /title: 'What Prometheus learned'/);
    } else {
      assert.match(fr, new RegExp(`${key}:`));
      assert.match(en, new RegExp(`${key}:`));
    }
  }
});
