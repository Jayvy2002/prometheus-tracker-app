import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import {
  AGENT_PING_KINDS,
  COACH_AGENT_FUNCTION,
  COACH_AGENT_LESSONS_LIMIT,
  COACH_AGENT_VENDOR,
  formatLessonsForPrompt,
  lessonFromEdit,
  lessonSnapshot,
  parseCoachAgentResponse,
  shouldRecordLesson,
} from './coachAgent';
import { classifyFleetDossier, buildFleetCard } from './coachFleet';
import type { CoachFleetDossier } from './types';

function source(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

const AGENT_PATHS = [
  'supabase/functions/coach-agent/index.ts',
  'supabase/functions/ask-second/index.ts',
  'supabase/functions/notify-onboarding-complete/index.ts',
  'supabase/functions/_shared/coachAgent.ts',
  'supabase/functions/_shared/openaiJson.ts',
];

test('coach-agent paths never ping GROK_BOT_WEBHOOK_URL', () => {
  for (const rel of AGENT_PATHS) {
    const src = source(rel);
    assert.doesNotMatch(src, /Deno\.env\.get\("GROK_BOT_WEBHOOK_URL"\)/);
    assert.doesNotMatch(src, /GROK_BOT_WEBHOOK_URL/);
  }
  const fleet = source('supabase/functions/coach-fleet-round/index.ts');
  assert.doesNotMatch(fleet, /Deno\.env\.get\("GROK_BOT_WEBHOOK_URL"\)/);
  assert.doesNotMatch(fleet, /api\.x\.ai/);
  assert.match(fleet, /OPENAI_API_KEY/);
});

test('coach-agent is sync OpenAI and returns 200 with a written draft', () => {
  assert.equal(COACH_AGENT_VENDOR, 'openai');
  assert.equal(COACH_AGENT_FUNCTION, 'coach-agent');
  const shared = source('supabase/functions/_shared/coachAgent.ts');
  assert.match(shared, /OPENAI_API_KEY|openaiJson/);
  assert.match(shared, /status:\s*"ready"/);
  assert.match(shared, /upsert_coach_intervention/);
  assert.match(shared, /p_source:\s*AGENT_SOURCE/);
  assert.doesNotMatch(shared, /status:\s*202/);
  const openai = source('supabase/functions/_shared/openaiJson.ts');
  assert.match(openai, /api\.openai\.com/);
  const store = source('src/stores/coachingStore.ts');
  assert.match(store, /COACH_AGENT_FUNCTION/);
  assert.match(store, /parseCoachAgentResponse/);
});

test('client treats 200 + intervention as done (no 90s Second poll)', () => {
  const ready = parseCoachAgentResponse(
    {
      status: 'ready',
      intervention_id: 'i1',
      intervention: { id: 'i1', kind: 'ask_prometheus', payload: { answer: 'Relance Marc' } },
    },
    200,
  );
  assert.equal(ready.kind, 'ready');
  if (ready.kind !== 'ready') throw new Error('expected ready');
  assert.equal(ready.id, 'i1');

  const poll = parseCoachAgentResponse(
    { status: 'drafting', intervention_id: 'i2', intervention: { id: 'i2', payload: { drafting: true } } },
    202,
  );
  assert.equal(poll.kind, 'poll');
});

test('edit-then-send writes a lesson; identical send does not', () => {
  const proposed = lessonSnapshot('adherence_nutrition', {
    body: 'Salut Marc, descends à 2000 kcal.',
    notes: 'Coupe calories',
  });
  const accepted = lessonSnapshot('adherence_nutrition', {
    body: 'Salut Marc, tes logs sont au-dessus des 2200. On ne touche pas encore à la cible.',
    notes: 'Relancer d’abord',
  });
  assert.equal(shouldRecordLesson(proposed, accepted), true);
  const lesson = lessonFromEdit({
    kind: 'adherence_nutrition',
    proposed,
    accepted,
    note: 'Relancer vs targets',
  });
  assert.equal(lesson.kind, 'adherence_nutrition');
  assert.equal(lesson.note, 'Relancer vs targets');
  assert.notEqual(JSON.stringify(lesson.proposed), JSON.stringify(lesson.accepted));

  assert.equal(shouldRecordLesson(accepted, accepted), false);

  const sql = source('supabase/migrations/20260829000008_coach_agent_lessons.sql');
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.coach_agent_lessons/);
  assert.match(sql, /record_coach_agent_lesson_from_send/);
  assert.match(sql, /USING \(coach_id = \(select auth\.uid\(\)\)\)/);
  assert.match(sql, /WITH CHECK \(coach_id = \(select auth\.uid\(\)\)\)/);
  assert.match(sql, /NEW\.status IN \('sent', 'kept'\)/);
});

test('next agent prompt includes last 5–10 lessons for that coach', () => {
  assert.ok(COACH_AGENT_LESSONS_LIMIT >= 5 && COACH_AGENT_LESSONS_LIMIT <= 10);
  const shared = source('supabase/functions/_shared/coachAgent.ts');
  assert.match(shared, /coach_agent_lessons/);
  assert.match(shared, /LESSONS_LIMIT/);
  assert.match(shared, /formatLessonsForPrompt/);
  assert.match(shared, /Corrections récentes de CE coach/);
  assert.match(shared, /Ne copie pas une erreur ponctuelle/);
  const formatted = formatLessonsForPrompt([
    {
      kind: 'adherence_nutrition',
      proposed: { body: 'coupe à 2000' },
      accepted: { body: 'Relancer d’abord' },
      note: 'Relancer vs targets',
    },
  ]);
  assert.match(formatted, /Relancer d’abord/);
  assert.match(formatted, /adherence_nutrition/);
  const userMsg = shared.includes('formatLessonsForPrompt(lessons)');
  assert.equal(userMsg, true);
});

test('keep_in_touch edits write the same lessons table as other Relancer cards', () => {
  const proposed = lessonSnapshot('keep_in_touch', {
    body: 'Salut Camille, tu stagnes, descends à 1700 kcal.',
  });
  const accepted = lessonSnapshot('keep_in_touch', {
    body: 'Salut Camille, petit check — comment tu vas ?',
  });
  assert.equal(shouldRecordLesson(proposed, accepted), true);
  assert.equal(lessonFromEdit({ kind: 'keep_in_touch', proposed, accepted }).kind, 'keep_in_touch');
  const fleet = source('supabase/functions/coach-fleet-round/index.ts');
  assert.match(fleet, /formatLessonsForPrompt/);
  assert.match(fleet, /keep_in_touch/);
});

test('Marc still Relancer-first — calorie cut is not the lever', () => {
  const TODAY = '2026-08-29';
  const marc: CoachFleetDossier = {
    coach_id: 'coach-id',
    client_id: 'marc-id',
    full_name: 'Marc Bouchard',
    goal: 'lose',
    onboarding_completed: true,
    has_program: true,
    setup_completed: true,
    linked_days: 40,
    training_frequency: 4,
    calorie_target: 2200,
    protein_target: 160,
    carbs_target: 200,
    fat_target: 70,
    weight_kg: 95.4,
    logged_nutrition_days: 13,
    avg_calories: 2850,
    last_nutrition_at: '2026-08-28',
    workout_count: 8,
    last_workout_at: '2026-08-28',
    checkin_count: 10,
    last_checkin_at: '2026-08-28',
    avg_adherence_nutrition: 2,
    avg_adherence_training: 4,
    weight_start_kg: 94.9,
    weight_end_kg: 95.4,
    weight_delta_kg: 0.5,
    last_message_at: null,
    last_coach_message_at: null,
    last_keep_in_touch_at: null,
    pending_fleet: false,
    fleet_handled: [],
  };
  assert.equal(classifyFleetDossier(marc, TODAY), 'adherence_nutrition');
  const card = buildFleetCard(marc, TODAY, 'off');
  assert.ok(card);
  assert.equal(card?.kind, 'adherence_nutrition');
  assert.equal(card?.payload.calories, undefined);
  const shared = source('supabase/functions/_shared/coachAgent.ts');
  assert.match(shared, /Relancer d'abord|adhérence \/ Relancer/i);
  assert.ok(AGENT_PING_KINDS.includes('onboarding_plan'));
});

test('notify-onboarding-complete keeps HMAC and runs the in-app agent', () => {
  const src = source('supabase/functions/notify-onboarding-complete/index.ts');
  assert.match(src, /GROK_BOT_WEBHOOK_SECRET|NOTIFY_SECRET/);
  assert.match(src, /runCoachAgent/);
  assert.match(src, /onboarding_plan/);
  assert.doesNotMatch(src, /GROK_BOT_WEBHOOK_URL/);
  assert.doesNotMatch(src, /fetch\(webhookUrl/);
});
