import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { migrationsSql } from './migrationScan';

const src = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8');

test('I03: one 14-day window, real span, dated targets — solo and fleet alike', () => {
  const solo = src('src/lib/soloCopilot.ts');
  assert.match(solo, /addDaysToDateStr\(inputs\.today, -\(SOLO_REVIEW_WINDOW_DAYS - 1\)\)/);
  assert.match(solo, /weightSpanDaysBetween\(/);
  assert.match(solo, /avgEffectiveTargetForWindow\(/);
  assert.match(solo, /targetHistory/);
  const fleet = src('src/features/coaching/domain/coachFleet.ts');
  assert.match(fleet, /effectiveCalorieTarget\(d\)/);
  assert.match(fleet, /weight_span_days \?\? FLEET_WINDOW_DAYS/);
  const mig = migrationsSql();
  assert.match(mig, /CREATE TABLE IF NOT EXISTS public\.nutrition_target_history/);
  assert.match(mig, /trg_record_target_history/);
  assert.match(mig, /CASE WHEN a\.w_id = b\.w_id THEN NULL/);
  assert.match(mig, /effective_targets AS/);
});

test('I04: declared signals only, tracked modules only, guarded profiles', () => {
  const fleet = src('src/features/coaching/domain/coachFleet.ts');
  assert.match(fleet, /FATIGUE_DECLARED_MIN/);
  assert.match(fleet, /trackingOn\(d, 'nutrition'\)/);
  assert.match(fleet, /isGuardedProfile\(d\)/);
  assert.match(fleet, /guarded: true/);
  assert.doesNotMatch(fleet, /adherenceOnFive\(d\.avg_adherence_training\)/);
  const copy = src('supabase/functions/_shared/fleetCopy.ts');
  assert.match(copy, /guardedCause/);
  const solo = src('src/components/dashboard/SoloWeeklyReview.tsx');
  assert.match(solo, /nutrition_target_history/);
  assert.match(solo, /profileHasMedicalFlags\(profile\.kinesiology_intake\)/);
});

test('D04: single product→draft contract, basis-preserving recents', () => {
  const energy = src('src/lib/foodEnergy.ts');
  assert.match(energy, /export function productLogDraft/);
  assert.match(energy, /export function normalizePerServingKcal/);
  assert.match(energy, /export function isServingBasis/);
  const store = src('src/stores/nutritionStore.ts');
  assert.match(store, /gramsFromQuantity\(qty, unit, UNIT_TO_GRAMS\)/);
  assert.doesNotMatch(store, /const scale = 100 \/ qty/);
});

test('D06: OFF full-text via cgi, explicit only, budgeted', () => {
  const off = src('src/lib/openFoodFacts.ts');
  assert.match(off, /OFF_MAX_CALLS_PER_MINUTE/);
  assert.match(off, /OffSearchError/);
  assert.match(off, /country\?: string/);
  const hook = src('src/features/nutrition/hooks/useFoodCatalogSearch.ts');
  assert.match(hook, /offStatus/);
  assert.match(hook, /AbortController/);
});
