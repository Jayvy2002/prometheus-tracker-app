import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import {
  CHECKIN_SCORE_MAX,
  CHECKIN_SCORE_MIN,
  CHECKIN_SCORE_VALUES,
  PAIN_WATCH_ON_TEN,
  clampCheckinScore,
  formatCheckinScore,
  invertScoreOnTen,
  isLegacyFiveScaleCheckin,
  isLegacyFiveScaleRow,
  scoreFromKey,
  scoreFromTrackRatio,
  scoreOnTen,
} from './checkinScale';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

test('0 and 10 are valid check-in scores', () => {
  assert.equal(clampCheckinScore(0), 0);
  assert.equal(clampCheckinScore(10), 10);
  assert.equal(clampCheckinScore(5), 5);
  assert.equal(clampCheckinScore(-1), null);
  assert.equal(clampCheckinScore(11), null);
  assert.deepEqual(CHECKIN_SCORE_VALUES, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.equal(CHECKIN_SCORE_MIN, 0);
  assert.equal(CHECKIN_SCORE_MAX, 10);
});

test('legacy 1–5 rows are detected; 0 or 6–10 marks the new scale', () => {
  assert.equal(isLegacyFiveScaleRow([3, 4, 2]), true);
  assert.equal(isLegacyFiveScaleRow([0, 4]), false);
  assert.equal(isLegacyFiveScaleRow([3, 8]), false);
  assert.equal(isLegacyFiveScaleRow([]), false);
  assert.equal(isLegacyFiveScaleCheckin({
    hunger: 3, fatigue: 2, sleep_quality: 4, stress: 3, motivation: 4,
    muscle_soreness: 2, joint_pain: 1, energy_level: 4, mood: 4,
  }), true);
  assert.equal(isLegacyFiveScaleCheckin({
    hunger: null, fatigue: null, sleep_quality: 8, stress: null, motivation: null,
    muscle_soreness: null, joint_pain: 2, energy_level: null, mood: null,
  }), false);
});

test('legacy 1–5 maps to 0–10 for averages without rewriting storage', () => {
  assert.equal(scoreOnTen(3, true), 6);
  assert.equal(scoreOnTen(5, true), 10);
  assert.equal(scoreOnTen(1, true), 2);
  assert.equal(scoreOnTen(7, false), 7);
  assert.equal(scoreOnTen(0, false), 0);
  assert.equal(scoreOnTen(10, false), 10);
  assert.equal(invertScoreOnTen(2, true), 6);
  assert.equal(invertScoreOnTen(8, false), 2);
});

test('formatCheckinScore: new 0–10 shows /10; old 1–5 shows the number only', () => {
  assert.equal(formatCheckinScore(null), '—');
  assert.equal(formatCheckinScore(0), '0/10');
  assert.equal(formatCheckinScore(10), '10/10');
  assert.equal(formatCheckinScore(7), '7/10');
  assert.equal(formatCheckinScore(3), '3');
  assert.equal(formatCheckinScore(3.3), '3.3');
  assert.equal(formatCheckinScore(80), '80');
  const mixedNew = {
    hunger: null, fatigue: null, sleep_quality: 8, stress: null, motivation: null,
    muscle_soreness: null, joint_pain: 3, energy_level: null, mood: null,
  };
  assert.equal(formatCheckinScore(3, mixedNew), '3/10');
});

test('pain watch on ten is ~3/5 so a new 3/10 does not false-flag like old 3/5', () => {
  assert.equal(PAIN_WATCH_ON_TEN, 6);
  assert.ok((scoreOnTen(3, false) ?? 0) < PAIN_WATCH_ON_TEN);
  assert.ok((scoreOnTen(3, true) ?? 0) >= PAIN_WATCH_ON_TEN);
});

test('track tap/drag maps 0–1 onto an integer 0–10', () => {
  assert.equal(scoreFromTrackRatio(0), 0);
  assert.equal(scoreFromTrackRatio(1), 10);
  assert.equal(scoreFromTrackRatio(0.5), 5);
  assert.equal(scoreFromTrackRatio(-0.2), 0);
  assert.equal(scoreFromTrackRatio(1.4), 10);
  assert.equal(scoreFromTrackRatio(0.74), 7);
  assert.equal(scoreFromTrackRatio(Number.NaN), 0);
});

test('client check-in form uses 0–10 sliders, not a button grid', () => {
  const page = src('src/components/checkin/CheckInPage.tsx');
  const slider = src('src/components/checkin/ScoreSlider.tsx');
  assert.match(page, /ScoreSlider/);
  assert.match(page, /checkin\.scaleHint/);
  assert.match(page, /CHECKIN_CORE_VAR_KEYS/);
  assert.match(page, /checkin\.subtitleSolo/);
  assert.match(page, /checkin\.moreDetails/);
  assert.match(page, /checkin\.moreDetailsCount/);
  assert.match(page, /checkin\.extraHint/);
  assert.match(page, /data-testid="checkin-more-details"/);
  assert.match(page, /data-testid="checkin-core"/);
  assert.match(page, /data-testid="checkin-extra"/);
  assert.match(page, /extraCount > 0/);
  assert.match(page, /showExtras = moreOpen;/);
  assert.doesNotMatch(page, /!solo \|\| moreOpen/);
  assert.doesNotMatch(page, /solo && extraVars/);
  assert.doesNotMatch(page, /\[1, 2, 3, 4, 5\]/);
  // Every 0–10 score uses the same slider with labelled ends (no even-only grid).
  assert.doesNotMatch(page, /\[0, 2, 4, 6, 8, 10\]/);
  assert.match(page, /<ScoreSlider/);
  assert.doesNotMatch(page, /CHECKIN_SCORE_VALUES\.map/);
  assert.match(slider, /role="slider"/);
  assert.match(slider, /scoreFromTrackRatio/);
  assert.match(slider, /w-7 h-7/);
  const editor = src('src/components/coaching/TrackingVarsEditor.tsx');
  assert.match(editor, /checkinCore/);
  assert.match(editor, /CHECKIN_EXTRA_VAR_KEYS/);
  assert.match(editor, /data-testid="checkin-vars-editor"/);
  assert.match(src('src/components/coaching/CheckinReviewPanel.tsx'), /CheckinFilledScores/);
  assert.match(src('src/components/coaching/ClientDetailPage.tsx'), /CheckinFilledScores/);
});

test('keyboard on a 0–10 score: first arrow answers, Delete goes back to not answered', () => {
  assert.equal(scoreFromKey(null, 'ArrowRight'), 0);
  assert.equal(scoreFromKey(null, 'ArrowLeft'), 0);
  assert.equal(scoreFromKey(4, 'ArrowUp'), 5);
  assert.equal(scoreFromKey(10, 'ArrowRight'), 10);
  assert.equal(scoreFromKey(0, 'ArrowDown'), 0);
  assert.equal(scoreFromKey(null, 'End'), 10);
  assert.equal(scoreFromKey(7, 'Home'), 0);
  assert.equal(scoreFromKey(7, 'Delete'), null);
  assert.equal(scoreFromKey(7, 'Backspace'), null);
  assert.equal(scoreFromKey(7, 'Tab'), undefined);
});

test('lot D: « not answered » never looks like 0, and the check-in form stays calm', () => {
  const slider = src('src/components/checkin/ScoreSlider.tsx');
  // Not answered: dashed neutral track, no thumb, a « tap to answer » cue, spoken as not set.
  assert.match(slider, /border-dashed/);
  assert.match(slider, /checkin\.tapToAnswer/);
  assert.match(slider, /aria-valuetext=\{set \? t\('checkin\.scoreValueText'[^}]*\}\) : unsetLabel\}/);
  assert.doesNotMatch(slider, /value \?\? CHECKIN_SCORE_MIN/, 'an unset score must not be drawn at 0');
  // Clearing is a real, named, 44 px button.
  assert.match(slider, /checkin\.clearAnswerLabel/);
  assert.match(slider, /onChange\(null\)/);
  assert.match(slider, /min-h-11/);
  assert.match(slider, /scoreFromKey/);

  const page = src('src/components/checkin/CheckInPage.tsx');
  // Sleep hours: unit, example, decimal keypad, comma accepted by the shared parser.
  assert.match(page, /parseSleepHours/);
  assert.match(page, /inputMode="decimal"/);
  assert.match(page, /checkin\.sleepHoursUnit/);
  assert.match(page, /checkin\.sleepHoursPlaceholder/);
  assert.match(page, /checkin\.sleepHoursInvalid/);
  // Scores start unset and go through clampCheckinScore: null stays null (absence ≠ 0).
  assert.match(page, /sleep_quality: null,/);
  assert.match(page, /clampCheckinScore\(scales\.sleep_quality\)/);
  // « Demander à Prometheus » is a secondary action after the save button, not the first thing.
  const save = page.indexOf("t('checkin.save')");
  const ask = page.indexOf('<SoloAskBar');
  assert.ok(save > 0 && ask > save, 'the ask bar comes after the save button');
  assert.match(page, /checkin\.askNoteAdded/);

  const fr = src('src/i18n/locales/fr/coaching.ts');
  const en = src('src/i18n/locales/en/coaching.ts');
  for (const key of ['tapToAnswer', 'clearAnswer', 'clearAnswerLabel', 'scoreValueText', 'sleepHoursUnit', 'sleepHoursPlaceholder', 'sleepHoursHint', 'askNoteAdded']) {
    assert.match(fr, new RegExp(`\\b${key}:`), `fr ${key}`);
    assert.match(en, new RegExp(`\\b${key}:`), `en ${key}`);
  }
  assert.match(fr, /notSet: 'Non renseigné'/);
});
