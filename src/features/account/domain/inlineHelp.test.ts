import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { i18nLocaleSource } from '../../../lib/i18nLocaleSource';
import { mobileTabs } from '../../../app/navigation/navConfig';

function src(rel: string): string {
  if (rel === 'src/i18n/locales/fr.ts') return i18nLocaleSource('fr');
  if (rel === 'src/i18n/locales/en.ts') return i18nLocaleSource('en');
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

const trackingOn = {
  track_workouts: true,
  track_checkins: true,
  track_nutrition: true,
  track_weight: true,
};

test('UX67 is inline copy next to controls — not a help product', () => {
  const routes = src('src/app/router/AppRoutes.tsx');
  assert.doesNotMatch(routes, /path="\/help"/);
  assert.doesNotMatch(routes, /HelpCenter|HelpPage|AidePage/);
  const nav = src('src/app/navigation/navConfig.ts');
  assert.doesNotMatch(nav, /\/help|labelKey: 'nav.help'/);
  assert.match(nav, /Pas de 6ᵉ onglet/);
  assert.equal(mobileTabs('solo', trackingOn).length, 4);
  assert.equal(mobileTabs('coached', trackingOn).length, 5);
  assert.equal(mobileTabs('coaching', trackingOn).length, 5);
  for (const persona of ['solo', 'coached', 'coaching'] as const) {
    const tabs = mobileTabs(persona, trackingOn);
    assert.equal(tabs.some(item => item.path === '/prometheus'), false);
    assert.equal(tabs.some(item => item.path === '/help'), false);
  }
});

test('UX67 phrases sit beside the control (photos, questionnaire, units, data)', () => {
  const photos = src('src/components/coaching/ClientPhotosPage.tsx');
  assert.match(photos, /data-testid="ux67-inline-hint"/);
  assert.match(photos, /athletePhotoSubtitleKey/);

  const fields = src('src/components/onboarding/CoachQuestionnaireFields.tsx');
  assert.match(fields, /coachQuestionnaire\.audience/);
  assert.match(fields, /coachQuestionnaire\.sensitiveNotice/);
  assert.match(fields, /data-testid="ux67-inline-hint"/);

  const panel = src('src/components/onboarding/ClientQuestionnairePanel.tsx');
  assert.match(panel, /data-testid="questionnaire-summary"/);
  assert.match(panel, /coachQuestionnaire\.audience/);
  assert.match(panel, /data-testid="ux67-inline-hint"/);

  const units = src('src/components/profile/UnitsForm.tsx');
  assert.match(units, /profile\.units\.displayOnlyHint/);
  assert.match(units, /profile\.units\.autoStartRestHint/);
  assert.match(units, /data-testid="ux67-inline-hint"/);

  const data = src('src/components/profile/DataControlPanel.tsx');
  assert.match(data, /data-testid="data-audience"/);
  assert.match(data, /data-ux67="inline-hint"/);

  const fr = src('src/i18n/locales/fr.ts');
  const en = src('src/i18n/locales/en.ts');
  assert.match(fr, /displayOnlyHint: 'Changer d’unité change l’affichage, pas ce qui est enregistré\.'/);
  assert.match(en, /displayOnlyHint: 'Changing unit changes the display, not the stored value\.'/);
  assert.match(fr, /Visible seulement par toi/);
  assert.match(fr, /Les questions suivantes concernent ta santé/);
  assert.doesNotMatch(fr, /Centre d’aide|centre d'aide/);
  assert.doesNotMatch(en, /Help center|Help Centre/);
});
