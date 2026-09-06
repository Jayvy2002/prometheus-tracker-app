import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { previousCheckins } from './checkinHistory';
import type { DailyCheckin } from './types';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

function checkin(partial: Partial<DailyCheckin> & Pick<DailyCheckin, 'id' | 'checked_at'>): DailyCheckin {
  return {
    user_id: 'u1',
    hunger: null,
    fatigue: null,
    sleep_quality: null,
    sleep_hours: null,
    stress: null,
    motivation: null,
    muscle_soreness: null,
    joint_pain: null,
    adherence_nutrition: null,
    adherence_training: null,
    energy_level: null,
    mood: null,
    notes: '',
    created_at: `${partial.checked_at}T10:00:00Z`,
    updated_at: `${partial.checked_at}T10:00:00Z`,
    ...partial,
  };
}

test('check-in history lists previous days, not today', () => {
  const rows = previousCheckins([
    checkin({ id: 'today', checked_at: '2026-09-06' }),
    checkin({ id: 'yest', checked_at: '2026-09-05' }),
    checkin({ id: 'older', checked_at: '2026-09-01' }),
  ], '2026-09-06');
  assert.deepEqual(rows.map(r => r.id), ['yest', 'older']);
});

test('CheckInPage loads recent check-ins under the daily form', () => {
  const page = src('src/components/checkin/CheckInPage.tsx');
  assert.match(page, /fetchRecent\(user\.id, 14\)/);
  assert.match(page, /CheckinHistoryList/);
  const list = src('src/components/checkin/CheckinHistoryList.tsx');
  assert.match(list, /checkin\.historyTitle/);
  assert.match(list, /previousCheckins/);
});

test('steps journal calls logSteps from Nutrition and Dashboard reads the log', () => {
  const tracker = src('src/components/nutrition/StepsTracker.tsx');
  assert.match(tracker, /logSteps/);
  assert.match(tracker, /nutrition\.steps\.title/);
  const nutrition = src('src/components/nutrition/NutritionPage.tsx');
  assert.match(nutrition, /showNutritionField\(tracking, 'steps'\)/);
  assert.match(nutrition, /<StepsTracker/);
  assert.match(nutrition, /fetchOrCreateSteps/);
  const dash = src('src/components/dashboard/Dashboard.tsx');
  assert.match(dash, /fetchOrCreateSteps/);
  assert.match(dash, /showNutritionField\(tracking, 'steps'\)/);
  const store = src('src/stores/nutritionStore.ts');
  assert.match(store, /stepsLog/);
  assert.match(store, /from\('daily_steps'\)/);
  assert.match(store, /onConflict: 'user_id,logged_at'/);
});

test('client realtime refetches assigned program content and bumps photo epoch', () => {
  const store = src('src/stores/coachingStore.ts');
  const fn = store.slice(store.indexOf('startClientRealtime: async'));
  const body = fn.slice(0, fn.indexOf('stopClientRealtime:'));
  assert.match(body, /table: 'program_days'/);
  assert.match(body, /table: 'program_day_exercises'/);
  assert.match(body, /table: 'progress_photos'/);
  assert.match(body, /shouldRefreshClientProgramContent/);
  assert.match(body, /shouldRefreshProgressPhotos/);
  assert.match(body, /fetchMyAssignment\(user\.id\)/);
  assert.match(body, /progressPhotosEpoch/);
  const photos = src('src/components/coaching/ClientPhotosPage.tsx');
  assert.match(photos, /progressPhotosEpoch/);
});

test('realtime migration publishes program days, lifts, and progress photos', () => {
  const sql = src('supabase/migrations/20260906000004_client_program_photos_realtime.sql');
  assert.match(sql, /ALTER TABLE public\.program_days REPLICA IDENTITY FULL/);
  assert.match(sql, /ALTER TABLE public\.program_day_exercises REPLICA IDENTITY FULL/);
  assert.match(sql, /ALTER TABLE public\.progress_photos REPLICA IDENTITY FULL/);
  assert.match(sql, /ADD TABLE public\.program_days/);
  assert.match(sql, /ADD TABLE public\.program_day_exercises/);
  assert.match(sql, /ADD TABLE public\.progress_photos/);
});

test('kcal and Relancer drafts show before/after like program sends', () => {
  const draft = src('src/components/coaching/InterventionDraftPage.tsx');
  assert.match(draft, /calorieBeforeAfter/);
  assert.match(draft, /relanceBeforeAfter/);
  assert.match(draft, /caloriePreview/);
  assert.match(draft, /relancePreview/);
  assert.match(draft, /client\?\.daily_calorie_target/);
  const roster = src('src/stores/coachingStore.ts');
  assert.match(roster, /protein_target, carbs_target, fat_target/);
});

test('client restes copy exists in FR and EN', () => {
  const fr = src('src/i18n/locales/fr.ts');
  const en = src('src/i18n/locales/en.ts');
  for (const key of [
    'historyTitle:',
    'historyEmpty:',
    "title: 'Pas'",
    'relanceBefore:',
    'relanceAfter:',
  ]) {
    assert.match(fr, new RegExp(key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  for (const key of [
    'historyTitle:',
    'historyEmpty:',
    "title: 'Steps'",
    'relanceBefore:',
    'relanceAfter:',
  ]) {
    assert.match(en, new RegExp(key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});
