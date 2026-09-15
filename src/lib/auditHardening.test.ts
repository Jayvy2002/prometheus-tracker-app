import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { hhmmInTimeZone, todayInTimeZone } from '../../supabase/functions/_shared/clock.ts';
import { fetchAllRows } from './postgrestPage';
import {
  activityLevelFromSessions,
  activityLevelFromTrainingAndOccupation,
  calculateBMR,
  calculateCalorieTarget,
  calculateEnhancedTDEE,
} from './utils';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

test('desk athletes keep the training activity band; physical job bumps one level', () => {
  assert.equal(activityLevelFromSessions(0), 'sedentary');
  assert.equal(activityLevelFromSessions(3), 'moderate');
  assert.equal(activityLevelFromSessions(5), 'active');
  assert.equal(activityLevelFromTrainingAndOccupation(3, 'sitting'), 'moderate');
  assert.equal(activityLevelFromTrainingAndOccupation(3, 'standing'), 'moderate');
  assert.equal(activityLevelFromTrainingAndOccupation(5, 'physical'), 'very_active');

  const bmr = calculateBMR(62, 165, 34, 'female');
  assert.equal(Math.round(bmr), 1320);
  const tdee = calculateEnhancedTDEE(bmr, 'moderate', 5000, 3);
  assert.equal(tdee, 2046);
  assert.equal(calculateCalorieTarget(tdee, 'cut', bmr), 1546);

  const deskZero = calculateEnhancedTDEE(bmr, 'sedentary', 5000, 0);
  assert.equal(deskZero, 1584);
  assert.equal(calculateCalorieTarget(deskZero, 'cut', bmr), 1320);
});

test('today / HH:MM follow the IANA zone, not UTC', () => {
  const utcMorning = new Date('2026-09-06T03:30:00.000Z');
  assert.equal(todayInTimeZone(utcMorning, 'UTC'), '2026-09-06');
  assert.equal(todayInTimeZone(utcMorning, 'America/Toronto'), '2026-09-05');
  assert.equal(hhmmInTimeZone(utcMorning, 'UTC'), '03:30');
  assert.equal(hhmmInTimeZone(utcMorning, 'America/Toronto'), '23:30');
  assert.equal(todayInTimeZone(utcMorning, 'Not/AZone'), '2026-09-06');
});

test('fetchAllRows pages past the PostgREST 1000-row cap', async () => {
  const pages = [
    Array.from({ length: 1000 }, (_, i) => i),
    Array.from({ length: 3 }, (_, i) => 1000 + i),
  ];
  let calls = 0;
  const { data, error } = await fetchAllRows(() => {
    const page = pages[calls++] ?? [];
    return {
      range: (_from: number, _to: number) => Promise.resolve({ data: page, error: null }),
    };
  });
  assert.equal(error, null);
  assert.equal(calls, 2);
  assert.equal(data.length, 1003);
  assert.equal(data[0], 0);
  assert.equal(data[1002], 1002);
});

test('auth refresh keeps the same user object; logout wipes session stores', () => {
  const auth = src('src/stores/authStore.ts');
  assert.match(auth, /session\.user\.id === get\(\)\.user\?\.id/);
  const app = src('src/App.tsx') + src('src/app/bootstrap/useAuthenticatedSession.ts') + src('src/app/guards/RouteGuards.tsx') + src('src/app/router/AppRoutes.tsx');
  assert.match(app, /resetSessionStores\(\)/);
  assert.match(app, /timezoneWriteFor/);
  assert.match(app, /silent: existing\?\.id === userId/);
  assert.match(src('src/lib/resetStores.ts'), /useWorkoutStore\.getState\(\)\.reset\(\)/);
});

test('writes surface errors instead of a fake success toast', () => {
  assert.match(src('src/stores/workoutStore.ts'), /updateWorkout: \(id: string, data: Partial<Workout>\) => Promise<\{ error: string \| null \}>/);
  assert.match(src('src/components/workout/WorkoutForm.tsx'), /if \(finished\.error\)/);
  assert.match(src('src/components/workout/WorkoutForm.tsx'), /clearFieldDrafts/);
  assert.match(src('src/components/nutrition/FoodForm.tsx'), /if \(result\.error\) return/);
  assert.match(src('src/components/weight/WeightPage.tsx'), /if \(result\.error\) return/);
  assert.match(src('src/i18n/locales/fr.ts'), /saveFailed:/);
});

test('coach client file and draft bind assignment locally; resolve is idempotent', () => {
  const detail = src('src/components/coaching/ClientDetailPage.tsx');
  assert.match(detail, /let cancelled = false/);
  assert.match(detail, /setBoundAssignment/);
  assert.doesNotMatch(detail, /useProgramStore\(s => s\.assignment\)/);
  const draft = src('src/components/coaching/InterventionDraftPage.tsx');
  assert.match(draft, /savingRef/);
  assert.match(draft, /setSaving\(false\)/);
  assert.doesNotMatch(draft, /const endSave = \(\) => \{ savingRef\.current = false; endSave\(\); \}/);
  assert.match(draft, /row\.status !== 'pending'/);
  assert.match(draft, /errors\.alreadyResolved/);
  const store = src('src/stores/coachingStore.ts');
  const resolve = store.slice(store.indexOf('resolveIntervention: async'));
  assert.match(resolve, /\.eq\('status', 'pending'\)/);
  assert.match(resolve, /already_resolved/);
  assert.match(store, /fetchAllRows\(/);
});

test('intake and onboarding walls offer sign-out; invite token survives a tab', () => {
  assert.match(src('src/components/onboarding/KinesiologyIntakeFlow.tsx'), /WallSignOut/);
  assert.match(src('src/components/onboarding/OnboardingFlow.tsx'), /WallSignOut/);
  const invite = src('src/stores/coachingStore.ts');
  const setTok = invite.slice(invite.indexOf('export function setPendingInviteToken'), invite.indexOf('export function getPendingInviteToken'));
  assert.match(setTok, /localStorage\.setItem/);
  assert.match(setTok, /sessionStorage\.setItem/);
});

test('paused assignment stays readable after unlink; notes stay coach-only', () => {
  const sql = src('supabase/migrations/20260905212745_audit_hardening.sql');
  assert.match(sql, /DROP POLICY IF EXISTS "Clients can read notes about them"/);
  assert.match(sql, /pa\.status IN \('active', 'paused'\)/);
  assert.match(sql, /NEW\.daily_water_target_ml := OLD\.daily_water_target_ml/);
  assert.match(sql, /NEW\.daily_steps_target := OLD\.daily_steps_target/);
  const prog = src('src/stores/programStore.ts');
  const fetch = prog.slice(prog.indexOf('fetchMyAssignment: async'));
  assert.match(fetch, /status', 'paused'/);
  assert.match(fetch, /user\?\.id === clientId/);
});

test('edges: coach link first, OpenAI timeout, storage wipe, reminders auth, notify 500', () => {
  const agent = src('supabase/functions/_shared/coachAgent.ts');
  const http = agent.slice(agent.indexOf('if (clientId)'));
  assert.match(http, /is_coach_of/);
  assert.match(http, /not_your_client/);
  assert.match(agent, /p_client_id: clientId/);
  assert.match(src('supabase/functions/analyze-product/index.ts'), /AbortSignal\.timeout\(20_000\)/);
  assert.match(src('supabase/functions/verify-exercise/index.ts'), /AbortSignal\.timeout\(20_000\)/);
  const del = src('supabase/functions/delete-account/index.ts');
  assert.match(del, /progress-photos/);
  assert.match(del, /storage\.from\(bucket\)\.remove/);
  const reminders = src('supabase/functions/send-daily-reminders/index.ts');
  assert.match(reminders, /REMINDERS_CRON_SECRET/);
  assert.match(reminders, /hhmmInTimeZone/);
  const notify = src('supabase/functions/notify-onboarding-complete/index.ts');
  assert.match(notify, /NOTIFY_SECRET missing/);
  assert.match(notify, /json\(401/);
  assert.match(notify, /json\(500/);
});
