import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

test('nutrition targets are never invented as 150 / 250 / 65 / 2000', () => {
  const files = [
    'src/components/nutrition/MacroSummary.tsx',
    'src/components/dashboard/Dashboard.tsx',
    'src/components/stats/StatsPage.tsx',
  ];
  for (const file of files) {
    const text = src(file);
    assert.doesNotMatch(text, /protein_target \?\? 150/);
    assert.doesNotMatch(text, /carbs_target \?\? 250/);
    assert.doesNotMatch(text, /fat_target \?\? 6[57]/);
    assert.doesNotMatch(text, /daily_calorie_target \?\? 2000/);
    assert.match(text, /nutritionTargetsFromProfile/);
  }
});

test('finishing a workout does not mark leftover sets as completed', () => {
  const form = src('src/components/workout/WorkoutForm.tsx');
  assert.doesNotMatch(form, /\.update\(\{ completed: true \}\)/);
  assert.match(form, /shouldConfirmIncompleteFinish/);
  assert.match(form, /workout\.finishAnyway/);
});

test('auth, invite and intention are human first-run surfaces', () => {
  const auth = src('src/components/auth/AuthPage.tsx');
  assert.match(auth, /autoComplete=\{mode === 'register' \? 'new-password' : 'current-password'\}/);
  assert.match(auth, /auth\.showPassword/);
  assert.match(auth, /htmlFor="auth-email"/);
  const invite = src('src/components/coaching/InvitePage.tsx');
  assert.match(invite, /coaching\.invite\.titleNoName/);
  assert.match(invite, /coaching\.invite\.humanBody/);
  const intention = src('src/components/onboarding/EntryIntentionPage.tsx');
  assert.match(intention, /cta: 'soloCta'/);
  assert.match(intention, /<article/);
});

test('error boundary never prints Error.name to the user', () => {
  const boundary = src('src/components/ErrorBoundary.tsx');
  assert.doesNotMatch(boundary, /error\?\.name/);
  assert.doesNotMatch(boundary, /error\?\.message/);
  assert.match(boundary, /errors\.dataSafe/);
});

test('mobile and desktop nav share Aujourd’hui and use NavLink', () => {
  const bottom = src('src/components/layout/BottomNav.tsx');
  const side = src('src/components/layout/SideNav.tsx');
  assert.match(bottom, /from 'react-router-dom'/);
  assert.match(bottom, /NavLink/);
  assert.match(bottom, /t\('nav\.today'\)/);
  assert.doesNotMatch(bottom, /t\('nav\.home'\)/);
  assert.match(side, /NavLink/);
  assert.match(side, /t\('nav\.today'\)/);
});
