import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import {
  parseWeeklyWhyParams,
  parseWeeklyWhyReason,
  WEEKLY_WHY_ADJUST_REASONS,
  weeklyNutritionWhyKey,
} from './weeklyNutritionWhy';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

test('one mapping: self keeps soloReview voice, coach uses weeklyWhy.coach', () => {
  assert.equal(weeklyNutritionWhyKey('keep', 'self'), 'soloReview.keep');
  assert.equal(weeklyNutritionWhyKey('keep', 'coach'), 'weeklyWhy.coach.keep');
  for (const reason of WEEKLY_WHY_ADJUST_REASONS) {
    assert.equal(weeklyNutritionWhyKey(reason, 'self'), `soloReview.adjust.${reason}`);
    assert.equal(weeklyNutritionWhyKey(reason, 'coach'), `weeklyWhy.coach.adjust.${reason}`);
  }
  assert.equal(weeklyNutritionWhyKey('relance', 'self'), null);
  assert.equal(weeklyNutritionWhyKey('unknown', 'coach'), null);
});

test('parseWeeklyWhyParams reads payload.why and ignores a bare cause', () => {
  assert.equal(parseWeeklyWhyReason({ reason: 'cut_gain', cause: 'short' }), 'cut_gain');
  assert.equal(parseWeeklyWhyParams({ cause: 'short', reason: 'cut_gain' }), null);
  assert.deepEqual(parseWeeklyWhyParams({
    reason: 'cut_gain',
    why: {
      from: 2200,
      to: 2000,
      delta: '+0.4',
      pct: 99,
      pctWeek: 0.4,
      avg: 2180,
      loggedDays: 12,
      window: 14,
      carbs: 180,
    },
  }), {
    delta: '+0.4',
    pct: 99,
    pctWeek: 0.4,
    avg: 2180,
    loggedDays: 12,
    window: 14,
    from: 2200,
    to: 2000,
    carbs: 180,
  });
});

test('solo copilot and calorie draft share the mapping; coach copy is not tutoiement', () => {
  assert.match(src('src/lib/soloCopilot.ts'), /weeklyNutritionWhyKey\(proposal\.reason, 'self'\)/);
  const draft = src('src/components/coaching/InterventionDraftPage.tsx');
  assert.match(draft, /weeklyNutritionWhyKey\(parseWeeklyWhyReason\(row\.payload\), 'coach'\)/);
  assert.match(draft, /whyText \? \(/);
  const fr = src('src/i18n/locales/fr.ts');
  const en = src('src/i18n/locales/en.ts');
  assert.match(fr, /weeklyWhy: \{/);
  assert.match(en, /weeklyWhy: \{/);
  assert.match(fr, /keep: 'Trajectoire correcte : \{\{delta\}\} kg sur \{\{window\}\} jours, moyenne \{\{avg\}\} kcal/);
  const coachKeep = fr.match(/weeklyWhy:\s*\{[\s\S]*?coach:\s*\{[\s\S]*?keep:\s*'([^']+)'/);
  assert.ok(coachKeep?.[1]);
  assert.doesNotMatch(coachKeep[1], /\b(tu|ta|tes)\b/);
  assert.match(fr, /medicalAck: 'J’ai lu les drapeaux médicaux/);
  assert.match(en, /medicalAck: 'I have read the medical flags/);
});
