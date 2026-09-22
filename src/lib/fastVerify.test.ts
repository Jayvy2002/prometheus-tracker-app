import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { SECOND_PING_KINDS, isSecondPingKind } from './coachSecond';
import {
  FAST_VERIFY_BONUS_TIMEOUT_MS,
  FAST_VERIFY_VENDOR,
  completedProductWrite,
  foodLookupSource,
  isSecondFoodOrExerciseKind,
  parseAnalyzeProductResponse,
  parseVerifyExerciseResponse,
  shouldCallAnalyzeProductApi,
  shouldCallVerifyExerciseApi,
} from './fastVerify';

function source(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

test('barcode already in food_products skips the vision API', () => {
  assert.equal(shouldCallAnalyzeProductApi({ dbHit: true, offHit: false }), false);
  assert.equal(foodLookupSource({ dbHit: true, offHit: false }), 'food_products');

  const src = source('supabase/functions/analyze-product/index.ts');
  const dbIdx = src.indexOf('.from("food_products")');
  const apiIdx = src.indexOf('api.openai.com');
  assert.ok(dbIdx >= 0, 'looks up food_products');
  assert.ok(apiIdx > dbIdx, 'food_products lookup happens before OpenAI');
  assert.match(src, /skip API/);
});

test('Open Food Facts hit skips the vision API', () => {
  assert.equal(shouldCallAnalyzeProductApi({ dbHit: false, offHit: true }), false);
  assert.equal(foodLookupSource({ dbHit: false, offHit: true }), 'open_food_facts');
});

test('miss / photo calls the API and completes product_requests in the same 200', () => {
  assert.equal(shouldCallAnalyzeProductApi({ dbHit: false, offHit: false }), true);
  assert.equal(foodLookupSource({ dbHit: false, offHit: false }), 'analyze_product');

  const outcome = parseAnalyzeProductResponse(
    { product: { id: 'p1', name: 'Yaourt grec' }, confidence: 92, status: 'completed' },
    200,
  );
  assert.equal(outcome.kind, 'ready');
  if (outcome.kind !== 'ready') throw new Error('expected ready');
  assert.equal(outcome.product.id, 'p1');
  assert.equal(outcome.confidence, 92);
  assert.equal(outcome.kind === 'ready', true);

  const write = completedProductWrite('p1');
  assert.equal(write.status, 'completed');
  assert.equal(write.result_product_id, 'p1');

  const src = source('supabase/functions/analyze-product/index.ts');
  assert.match(src, /status:\s*"completed"/);
  assert.match(src, /result_product_id/);
  assert.match(src, /from\("food_products"\)[\s\S]*insert/);
  assert.doesNotMatch(src, /status:\s*202/);
});

test('unknown exercise stays pending: catalog hit does not insert, miss does not approve', () => {
  assert.equal(shouldCallVerifyExerciseApi({ libraryHit: true }), false);
  assert.equal(shouldCallVerifyExerciseApi({ libraryHit: false }), true);

  const matched = parseVerifyExerciseResponse(
    { exercise: { id: 'e1', name: 'Pendlay row' }, status: 'matched', applied: false },
    200,
  );
  assert.equal(matched.kind, 'approved');
  if (matched.kind !== 'approved') throw new Error('expected catalog match');
  assert.equal(matched.exercise.id, 'e1');

  const pending = parseVerifyExerciseResponse({ status: 'pending', applied: false }, 200);
  assert.equal(pending.kind, 'pending');

  const src = source('supabase/functions/verify-exercise/index.ts');
  const libIdx = src.indexOf('resolve_exercise_catalog');
  const apiIdx = src.indexOf('api.openai.com');
  assert.ok(libIdx >= 0 && apiIdx > libIdx, 'catalog lookup happens before OpenAI');
  assert.match(src, /applied:\s*false/);
  assert.doesNotMatch(src, /\.from\("exercises"\)[\s\S]{0,80}insert/);
  assert.doesNotMatch(src, /status:\s*"approved"/);
  assert.doesNotMatch(src, /status:\s*202/);
});

test('food and exercise paths never ping Second', () => {
  assert.equal(isSecondFoodOrExerciseKind('analyze_product'), true);
  assert.equal(isSecondPingKind('analyze_product'), false);
  assert.equal(isSecondPingKind('verify_exercise'), false);
  assert.ok(!SECOND_PING_KINDS.includes('analyze_product' as typeof SECOND_PING_KINDS[number]));

  for (const rel of [
    'supabase/functions/analyze-product/index.ts',
    'supabase/functions/verify-exercise/index.ts',
  ]) {
    const src = source(rel);
    assert.match(src, /OPENAI_API_KEY/);
    assert.match(src, /api\.openai\.com/);
    assert.equal(FAST_VERIFY_VENDOR, 'openai');
    assert.doesNotMatch(src, /Deno\.env\.get\("GROK_BOT_WEBHOOK_URL"\)/);
    assert.doesNotMatch(src, /Deno\.env\.get\("GROK_BOT_WEBHOOK_SECRET"\)/);
    assert.doesNotMatch(src, /Deno\.env\.get\("NOTIFY_SECRET"\)/);
    assert.doesNotMatch(src, /kind:\s*"analyze_product"/);
    assert.doesNotMatch(src, /kind:\s*"verify_exercise"/);
    assert.doesNotMatch(src, /webhookUrl/);
  }

  const askSecond = source('supabase/functions/ask-second/index.ts');
  assert.doesNotMatch(askSecond, /GROK_BOT_WEBHOOK_URL/, 'retired alias must not ping Second');
  assert.match(askSecond, /status: 410/);
  assert.doesNotMatch(askSecond, /handleCoachAgentHttp/);
});

test('client treats 200 + id as done and does not wait 90s on Second', () => {
  assert.ok(FAST_VERIFY_BONUS_TIMEOUT_MS < 90_000);
  assert.ok(FAST_VERIFY_BONUS_TIMEOUT_MS <= 8_000);

  const processing = parseAnalyzeProductResponse({ status: 'processing', request_id: 'r1' }, 202);
  assert.equal(processing.kind, 'poll');

  const ready = parseAnalyzeProductResponse({ product: { id: 'p2' } }, 200);
  assert.equal(ready.kind, 'ready');

  const verifyReady = parseVerifyExerciseResponse({ exercise: { id: 'e2' } }, 200);
  assert.equal(verifyReady.kind, 'approved');

  const store = source('src/stores/nutritionStore.ts');
  assert.match(store, /FAST_VERIFY_BONUS_TIMEOUT_MS/);
  assert.doesNotMatch(store, /90_000/);

  const picker = source('src/components/workout/ExercisePicker.tsx');
  assert.match(picker, /propose_exercise/);
  assert.doesNotMatch(picker, /90_000/);
  assert.doesNotMatch(picker, /verify-exercise/);
});

test('daily limit and rejected exercise stay on the fast 200/429 contract', () => {
  const limit = parseAnalyzeProductResponse({ error: 'DAILY_LIMIT_REACHED' }, 429);
  assert.equal(limit.kind, 'error');
  if (limit.kind === 'error') assert.equal(limit.key, 'scanner.dailyLimitReached');

  const rejected = parseVerifyExerciseResponse({ rejected: true, reason: 'pas un exercice' }, 200);
  assert.equal(rejected.kind, 'rejected');
  if (rejected.kind === 'rejected') assert.equal(rejected.reason, 'pas un exercice');
});
