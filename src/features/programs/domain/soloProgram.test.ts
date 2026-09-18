import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { isSoloAthlete } from '../../../lib/coachRole';
import {
  isSoloProgramKind,
  pendingSoloProgramDraft,
  programDaysToDraft,
  soloDraftEdited,
  soloDraftWhy,
} from './soloProgram';
import { muscleLabel } from '../../../lib/muscleLabels';
import type { CoachIntervention } from '../../../lib/types';
import { i18nLocaleSource } from '../../../lib/i18nLocaleSource';

function src(rel: string): string {
  if (rel === 'src/i18n/locales/fr.ts') return i18nLocaleSource('fr');
  if (rel === 'src/i18n/locales/en.ts') return i18nLocaleSource('en');
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

function row(partial: Partial<CoachIntervention>): CoachIntervention {
  return {
    id: 'i1',
    coach_id: 'solo',
    client_id: 'solo',
    kind: 'onboarding_plan',
    title: 'Base novice',
    rationale: 'Jours dispo lun/mer/ven',
    payload: {
      notes: '3 jours, haltères',
      program: {
        name: 'Base 3j',
        description: '',
        duration_weeks: 8,
        days: [{ weekday: 1, name: 'A', exercises: [{ name: 'Squat', default_sets: 3, default_reps: 8, default_reps_min: null, default_rir: 2, default_rest_seconds: 120 }] }],
      },
    },
    status: 'pending',
    source: 'agent',
    created_at: '2026-09-06T00:00:00Z',
    updated_at: '2026-09-06T00:00:00Z',
    resolved_at: null,
    ...partial,
  };
}

test('Solo includes professional coaches without a personal coach', () => {
  assert.equal(isSoloAthlete('none', null), true);
  assert.equal(isSoloAthlete('none', { id: 'c1' }), false);
  assert.equal(isSoloAthlete('client', null), false);
  assert.equal(isSoloAthlete('coach', null), true);
});

test('pending self-coach draft is the solo looking at their own onboarding_plan / nl edit', () => {
  assert.equal(isSoloProgramKind('onboarding_plan'), true);
  assert.equal(isSoloProgramKind('program_nl_edit'), true);
  assert.equal(isSoloProgramKind('calorie_adjustment'), false);
  const hit = pendingSoloProgramDraft([row({}), row({ id: 'other', client_id: 'else' })], 'solo');
  assert.equal(hit?.id, 'i1');
  assert.equal(pendingSoloProgramDraft([row({})], 'else'), null);
  assert.equal(pendingSoloProgramDraft([row({ status: 'sent' })], 'solo'), null);
});

test('why + edited outline come from the agent payload, not a second generator', () => {
  const draft = row({});
  assert.match(soloDraftWhy(draft), /3 jours/);
  const edited = soloDraftEdited(draft);
  assert.equal(edited.programName, 'Base 3j');
  assert.equal(edited.days.length, 1);
  assert.equal(edited.patch, null);
});

test('JWT self-coach is an explicit case before is_coach_of; coached stays 403', () => {
  const http = src('supabase/functions/_shared/coachAgent.ts');
  assert.match(http, /account.active_coach_id !== null/);
  assert.match(http, /selfCoach/);
  assert.match(http, /kind !== "onboarding_plan" && kind !== "program_nl_edit"/);
  assert.match(http, /is_coach_of/);
  assert.match(http, /not_your_client/);
  const upsert = src('supabase/migrations/20260906023512_solo_self_coach.sql');
  assert.match(upsert, /CREATE OR REPLACE FUNCTION public\.is_self_coach/);
  assert.match(upsert, /Coached athletes cannot self-coach/);
  assert.match(upsert, /coach_id = \(select auth\.uid\(\)\)/);
  assert.match(upsert, /client_id = \(select auth\.uid\(\)\)/);
  assert.doesNotMatch(upsert, /is_coach_of\(auth\.uid\(\)\)/);
  assert.match(upsert, /v_coach_id := NEW\.id/);
});

test('solo home and /programs show the proposal; refuse is not auto-apply', () => {
  const app = src('src/App.tsx') + src('src/app/bootstrap/useAuthenticatedSession.ts') + src('src/app/guards/RouteGuards.tsx') + src('src/app/router/AppRoutes.tsx');
  assert.match(app, /function ProgramsHome/);
  assert.doesNotMatch(app, /Navigate to="\/workout"/);
  const dash = src('src/components/dashboard/Dashboard.tsx') + src('src/features/dashboard/hooks/useDashboardBootstrap.ts');
  assert.match(dash, /SoloProgramProposal/);
  assert.match(dash, /variant="notice"/);
  assert.doesNotMatch(dash, /ProgramSessionEditor/);
  const page = src('src/components/programs/ClientProgramPage.tsx');
  assert.match(page, /SoloProgramProposal/);
  assert.match(page, /ProgramSessionEditor/);
  assert.match(page, /isSoloAthlete/);
  assert.match(page, /presentation="athlete"/);
  assert.match(page, /programs\.soloReadFirst/);
  const editor = src('src/components/coaching/ProgramSessionEditor.tsx') + src('src/features/programs/hooks/useProgramEditorTracking.ts') + src('src/features/programs/hooks/useProgramNlEdit.ts');
  assert.match(editor, /presentation\?: 'coach' \| 'athlete'/);
  assert.match(editor, /programs\.tapToEdit/);
  assert.match(editor, /programs\.cycleDetails/);
  assert.match(editor, /formatExercisePrescription/);
  assert.doesNotMatch(page, /\/programs\/new/);
  assert.doesNotMatch(page, /createProgram/);
  const card = src('src/components/dashboard/SoloProgramProposal.tsx');
  assert.match(card, /variant === 'notice'/);
  assert.match(card, /ListRow/);
  assert.match(card, /to="\/programs"/);
  assert.match(card, /applyIntervention\(row\.id, 'sent'/);
  assert.doesNotMatch(card, /claimIntervention\(row\.id\)/);
  assert.doesNotMatch(card, /finalizeIntervention\(row\.id, claimKey, 'sent'/);
  assert.match(card, /resolveIntervention\(row\.id, 'dismissed'/);
  assert.match(card, /navigate\('\/programs'\)/);
  assert.doesNotMatch(card, /navigate\('\/routines'\)/);
  assert.match(card, /solo_program_accepted/);
  assert.match(card, /effects\.program/);
  assert.match(card, /ProgramSessionEditor/);
  const hub = src('src/components/profile/SoloHub.tsx');
  assert.doesNotMatch(hub, /\/routines/);
  const routines = src('src/components/routines/RoutinesPage.tsx');
  assert.match(routines, /Navigate to="\/programs"/);
});

test('assigned program days convert to the session-editor draft', () => {
  const draft = programDaysToDraft([
    {
      id: 'd1',
      program_id: 'p',
      weekday: 3,
      name: 'Pull',
      routine_id: null,
      order_index: 1,
      created_at: '',
      exercises: [{
        id: 'e1',
        program_day_id: 'd1',
        name: 'Row',
        default_sets: 4,
        default_reps: 8,
        default_reps_min: 6,
        default_rir: 2,
        default_rest_seconds: 90,
        default_weight_kg: null,
        order_index: 0,
        created_at: '',
      }],
    },
  ]);
  assert.equal(draft.length, 1);
  assert.equal(draft[0].weekday, 3);
  assert.equal(draft[0].exercises[0]?.name, 'Row');
  assert.equal(programDaysToDraft([]).length, 1);
  assert.equal(programDaysToDraft([]).at(0)?.exercises.length, 0);
});

test('Entraînements is the séance du jour, not a second program editor', () => {
  const page = src('src/components/workout/WorkoutPage.tsx');
  assert.match(page, /ClientGymCard/);
  assert.match(page, /startProgramDay/);
  assert.match(page, /to="\/programs"/);
  assert.doesNotMatch(page, /ProgramEditorPage/);
  assert.doesNotMatch(page, /workout\.myRoutines/);
  const profile = src('src/components/profile/ProfilePage.tsx');
  assert.match(profile, /md:hidden/);
  assert.match(profile, /<SoloHub/);
  const recipes = src('src/components/nutrition/RecipesPage.tsx');
  assert.match(recipes, /nutrition\.recipes\.title/);
  assert.match(recipes, /nutrition\.recipes\.searchPlaceholder/);
  assert.doesNotMatch(recipes, />Recipes</);
  const fr = src('src/i18n/locales/fr.ts');
  assert.match(fr, /previewHint: 'Ça ne lance pas la séance\.'/);
  assert.match(fr, /dashboardHintSolo:/);
  assert.match(fr, /subtitleSolo:/);
  assert.doesNotMatch(fr, /addWorkout: 'Ajouter une séance'/);
  assert.equal(muscleLabel('chest'), 'Pectoraux');
  assert.equal(muscleLabel('quadriceps'), 'Quadriceps');
  assert.equal(muscleLabel('upper_chest', 'en'), 'Upper chest');
});
