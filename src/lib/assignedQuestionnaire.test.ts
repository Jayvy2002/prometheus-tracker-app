import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import {
  isIncompleteAssignedQuestionnaire,
  shouldSkipKinesiologyForAssignedQuestionnaire,
} from './assignedQuestionnaire';
import { i18nLocaleSource } from './i18nLocaleSource';

function src(rel: string): string {
  if (rel === 'src/i18n/locales/fr.ts') return i18nLocaleSource('fr');
  if (rel === 'src/i18n/locales/en.ts') return i18nLocaleSource('en');
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

test('incomplete means a response without completed_at', () => {
  assert.equal(isIncompleteAssignedQuestionnaire(null), false);
  assert.equal(isIncompleteAssignedQuestionnaire({ completed_at: '2026-09-15T00:00:00.000Z' }), false);
  assert.equal(isIncompleteAssignedQuestionnaire({ completed_at: null }), true);
});

test('kinesiology wall is skipped for an assigned questionnaire, load, or fetch failure', () => {
  assert.equal(shouldSkipKinesiologyForAssignedQuestionnaire({
    status: 'ready', response: { completed_at: null },
  }), true);
  assert.equal(shouldSkipKinesiologyForAssignedQuestionnaire({
    status: 'loading', response: null,
  }), true);
  assert.equal(shouldSkipKinesiologyForAssignedQuestionnaire({
    status: 'failed', response: null,
  }), true);
  assert.equal(shouldSkipKinesiologyForAssignedQuestionnaire({
    status: 'ready', response: null,
  }), false);
  assert.equal(shouldSkipKinesiologyForAssignedQuestionnaire({
    status: 'idle', response: null,
  }), false);
});

test('coach questionnaire no longer prisons the app; kiné lock stays', () => {
  const app = src('src/App.tsx') + src('src/app/bootstrap/useAuthenticatedSession.ts') + src('src/app/guards/RouteGuards.tsx') + src('src/app/router/AppRoutes.tsx');
  assert.doesNotMatch(app, /activeAssignment\?\.response && !activeAssignment\.response\.completed_at/);
  assert.doesNotMatch(app, /path="\*" element=\{<div className="p-4 max-w-2xl mx-auto">/);
  assert.match(app, /shouldSkipKinesiologyForAssignedQuestionnaire/);
  assert.match(app, /AssignedQuestionnaireProvider/);
  assert.match(app, /assignedQuestionnaireContext/);
  assert.match(app, /path="\/questionnaire"/);
  const kinéLock = app.slice(app.indexOf('shouldForceKinesiologyIntake'));
  assert.match(kinéLock, /path="\*" element=\{<KinesiologyIntakeFlow/);
  const onboardingLock = app.slice(app.indexOf('!profile?.onboarding_completed'));
  assert.match(onboardingLock, /path="\*" element=\{<OnboardingFlow/);
});

test('hub link, banner, draft, and audience-before-medical are wired', () => {
  const profile = src('src/components/profile/ProfilePage.tsx');
  assert.match(profile, /to="\/questionnaire"/);
  assert.match(profile, /coachQuestionnaire\.myTitle/);
  assert.match(profile, /to="\/intake"/);

  const layout = src('src/app/layout/AppLayout.tsx');
  assert.match(layout, /AssignedQuestionnaireBanner/);

  const banner = src('src/components/onboarding/AssignedQuestionnaireBanner.tsx');
  assert.match(banner, /to="\/questionnaire"/);
  assert.match(banner, /status === 'failed'/);
  assert.doesNotMatch(banner, /path="\*"/);

  const panel = src('src/components/onboarding/ClientQuestionnairePanel.tsx');
  assert.match(panel, /save\(false\)/);
  assert.match(panel, /coachQuestionnaire\.saveDraft/);
  assert.match(panel, /coachQuestionnaire\.myTitle/);
  assert.match(panel, /questionnaire-summary/);

  const fields = src('src/components/onboarding/CoachQuestionnaireFields.tsx');
  assert.match(fields, /coachQuestionnaire\.audience/);
  assert.match(fields, /coachQuestionnaire\.sensitiveNotice/);
  assert.match(fields, /firstMedicalId/);

  const browser = src('scripts/test-questionnaire-browser.mjs');
  assert.match(browser, /Advanced settings/);
  assert.match(browser, /incomplete questionnaire must not prison the home/);
  assert.match(browser, /goto\(origin\+'\/questionnaire'\)/);
  assert.match(browser, /questionnaire-summary/);
  assert.match(browser, /questionnaire-edit-section_1/);
  assert.match(browser, /completed answers stay on the summary/);

  const fr = src('src/i18n/locales/fr.ts');
  const en = src('src/i18n/locales/en.ts');
  assert.match(fr, /myTitle: 'Mon questionnaire'/);
  assert.match(en, /myTitle: 'My questionnaire'/);
  assert.doesNotMatch(fr, /60 secondes/);
  assert.doesNotMatch(en, /60 seconds/);
});
