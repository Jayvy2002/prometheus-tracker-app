import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import {
  parseAccountSnapshot,
  resolveAccountContext,
  resolveLegacyAccountContext,
} from '../../../lib/accountContext';
import { latestMigrationContaining } from '../../../lib/migrationScan';
import { i18nLocaleSource } from '../../../lib/i18nLocaleSource';
import {
  actorFromAccount,
  canActAsCoach,
  canEditClientDossier,
  canLogOwnSession,
  canOpenPersonalCalendarRoute,
  canProposeAssignedProgramChange,
  canReadAssignedProgram,
  canReadClientDossier,
  canReadOwnAssignedProgram,
  canReadOwnCalendar,
  canReadOwnHistory,
  canUpdateAssignedProgram,
  canUpdateCoachOwnedTargets,
  canUpdateOwnAssignedProgram,
  canUpdateOwnPersonalData,
  canUsePersonalTools,
  type PermissionActor,
} from './resourcePermissions';

function src(rel: string): string {
  if (rel === 'src/i18n/locales/fr.ts') return i18nLocaleSource('fr');
  if (rel === 'src/i18n/locales/en.ts') return i18nLocaleSource('en');
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

function snapshot(input: {
  capability: boolean;
  coachId: string | null;
  role?: 'none' | 'client' | 'coach';
}) {
  return parseAccountSnapshot({
    user_id: 'A',
    coach_capability: input.capability,
    active_coach_id: input.coachId,
    legacy_coaching_role: input.role ?? (input.capability ? 'coach' : input.coachId ? 'client' : 'none'),
  }, 'A');
}

function actor(input: {
  capability: boolean;
  coachId: string | null;
  workspace?: 'personal' | 'coaching';
  role?: 'none' | 'client' | 'coach';
}): PermissionActor {
  const context = resolveAccountContext(
    input.role ?? (input.capability ? 'coach' : input.coachId ? 'client' : 'none'),
    input.coachId ? { id: input.coachId } : null,
    true,
    snapshot(input),
    input.workspace,
  );
  return actorFromAccount('A', context);
}

const solo = () => actor({ capability: false, coachId: null });
const coached = () => actor({ capability: false, coachId: 'B' });
const coachSolo = (workspace: 'personal' | 'coaching' = 'personal') =>
  actor({ capability: true, coachId: null, workspace });
const coachCoached = (workspace: 'personal' | 'coaching' = 'personal') =>
  actor({ capability: true, coachId: 'B', workspace });

test('P1.2 matrix: own history, session log and personal data stay with the athlete', () => {
  for (const person of [solo(), coached(), coachSolo(), coachCoached(), coachCoached('coaching')]) {
    assert.equal(canReadOwnHistory(person), true);
    assert.equal(canLogOwnSession(person), true);
    assert.equal(canUpdateOwnPersonalData(person), true);
    assert.equal(canReadOwnAssignedProgram(person), true);
    assert.equal(canReadAssignedProgram(person), true);
    assert.equal(canReadOwnCalendar(person), true);
  }
});

test('P1.2 matrix: assigned-plan write vs propose, including Coach who is coached', () => {
  assert.equal(canUpdateOwnAssignedProgram(solo()), true);
  assert.equal(canUpdateCoachOwnedTargets(solo()), true);
  assert.equal(canProposeAssignedProgramChange(solo()), false);

  assert.equal(canUpdateOwnAssignedProgram(coached()), false);
  assert.equal(canUpdateCoachOwnedTargets(coached()), false);
  assert.equal(canProposeAssignedProgramChange(coached()), true);

  assert.equal(canUpdateOwnAssignedProgram(coachSolo()), true);
  assert.equal(canProposeAssignedProgramChange(coachSolo()), false);

  assert.equal(canUpdateOwnAssignedProgram(coachCoached()), false);
  assert.equal(canUpdateOwnAssignedProgram(coachCoached('coaching')), false);
  assert.equal(canProposeAssignedProgramChange(coachCoached()), true);
  assert.equal(canUpdateCoachOwnedTargets(coachCoached()), false);
});

test('P1.2 matrix: a Coach edits a client dossier, never their own, and workspace does not grant', () => {
  const client = { clientId: 'C', hasActiveRelationship: true };
  const clientPlan = { ownerId: 'A', clientId: 'C', hasActiveRelationship: true };
  for (const person of [coachSolo(), coachSolo('coaching'), coachCoached(), coachCoached('coaching')]) {
    assert.equal(canReadClientDossier(person, client), true);
    assert.equal(canEditClientDossier(person, client), true);
    assert.equal(canReadClientDossier(person, { clientId: 'A', hasActiveRelationship: true }), false);
    assert.equal(canReadClientDossier(person, { clientId: 'C', hasActiveRelationship: false }), false);
    assert.equal(canReadAssignedProgram(person, clientPlan), true);
    assert.equal(canUpdateAssignedProgram(person, clientPlan), true);
    assert.equal(canUpdateAssignedProgram(person, { ownerId: 'A', clientId: 'C' }), false);
    assert.equal(canUpdateAssignedProgram(person, { ownerId: 'A', clientId: 'C', hasActiveRelationship: false }), false);
    assert.equal(canReadAssignedProgram(person, { clientId: 'C', hasActiveRelationship: false }), false);
  }

  assert.equal(canReadClientDossier(coached(), client), false);
  assert.equal(canReadClientDossier(solo(), client), false);
  assert.equal(canActAsCoach(coached()), false);
  assert.equal(canActAsCoach(coachSolo('personal')), true);
  assert.equal(canReadAssignedProgram(coached(), clientPlan), false);
  assert.equal(canUpdateAssignedProgram(coached(), { ownerId: 'B', clientId: 'A', hasActiveRelationship: true }), false);
});

test('workspace preference is ignored when deciding grants', () => {
  const personal = coachCoached('personal');
  const coaching = coachCoached('coaching');
  assert.notEqual(personal.activeWorkspace, coaching.activeWorkspace);
  assert.equal(canReadOwnHistory(personal), canReadOwnHistory(coaching));
  assert.equal(canUpdateOwnAssignedProgram(personal), canUpdateOwnAssignedProgram(coaching));
  assert.equal(canActAsCoach(personal), canActAsCoach(coaching));
  assert.equal(
    canReadClientDossier(personal, { clientId: 'C', hasActiveRelationship: true }),
    canReadClientDossier(coaching, { clientId: 'C', hasActiveRelationship: true }),
  );
});

test('unresolved or unready context fails closed', () => {
  const blocked = actorFromAccount(null, resolveAccountContext('none', null, true, null));
  assert.equal(canReadOwnHistory(blocked), false);
  const waiting = actorFromAccount('A', resolveAccountContext('coach', null, false, snapshot({
    capability: true, coachId: null,
  })));
  assert.equal(canUsePersonalTools(waiting), false);
  assert.equal(canActAsCoach(waiting), false);
  const legacyCoach = actorFromAccount('A', resolveLegacyAccountContext('coach', null, true));
  assert.equal(legacyCoach.personalToolsAvailable, false);
  assert.equal(canReadOwnHistory(legacyCoach), false);
  assert.equal(canActAsCoach(legacyCoach), true);
});

test('calendar resource read and route are allowed for Solo and Coached personal tools', () => {
  assert.equal(canReadOwnCalendar(solo()), true);
  assert.equal(canReadOwnCalendar(coached()), true);
  assert.equal(canOpenPersonalCalendarRoute(solo()), true);
  assert.equal(canOpenPersonalCalendarRoute(coached()), true);
  assert.equal(canOpenPersonalCalendarRoute(coachSolo()), true);
  assert.equal(canOpenPersonalCalendarRoute(coachCoached()), true);
  const blocked = actorFromAccount(null, resolveAccountContext('none', null, true, null));
  assert.equal(canOpenPersonalCalendarRoute(blocked), false);
});

test('server enforces owner writes, leftover coached save_program, nutrition targets and dossier isolation', () => {
  const save = latestMigrationContaining(/CREATE OR REPLACE FUNCTION public\.save_program\(/);
  assert.equal(save.file, '20260918103748_program_write_coached_owner.sql');
  assert.match(save.sql, /Not program owner/);
  assert.match(save.sql, /Coached client cannot edit assigned program/);
  assert.match(save.sql, /coached_client_cannot_edit_program/);
  const assign = latestMigrationContaining('Coached client cannot self-assign');
  assert.match(assign.sql, /Coached client cannot self-assign/);
  const targets = latestMigrationContaining('CREATE OR REPLACE FUNCTION public.protect_coach_nutrition_targets');
  assert.match(targets.sql, /daily_calorie_target/);
  assert.match(targets.sql, /daily_water_target_ml/);
  const capability = latestMigrationContaining('CREATE OR REPLACE FUNCTION public.is_self_coach');
  assert.match(capability.sql, /client_id = auth\.uid\(\) AND status = 'active'/);
});

test('stats and calendar are personal history surfaces; routines stay persona-gated', () => {
  const app = src('src/app/router/AppRoutes.tsx') + src('src/app/guards/RouteGuards.tsx');
  assert.match(app, /path="\/stats" element=\{<CoachTrackerRedirect><StatsPage/);
  assert.doesNotMatch(app, /path="\/stats" element=\{<CoachTrackerRedirect><CoachedAthleteRedirect>/);
  assert.match(app, /path="\/calendar" element=\{<CoachTrackerRedirect><CalendarPage/);
  assert.doesNotMatch(app, /path="\/calendar" element=\{<CoachTrackerRedirect><CoachedAthleteRedirect>/);
  assert.match(app, /path="\/routines"[\s\S]*CoachedAthleteRedirect/);
  assert.match(src('src/app/guards/RouteGuards.tsx'), /canUsePersonalTools/);
  assert.match(src('src/app/guards/RouteGuards.tsx'), /canActAsCoach/);
  const progress = src('src/components/workout/ExerciseProgressPage.tsx');
  assert.match(progress, /canReadOwnHistory/);
  assert.match(progress, /canOpenPersonalCalendarRoute/);
  const nav = src('src/app/navigation/navConfig.ts');
  assert.match(nav, /persona === 'coached'/);
  assert.match(nav, /stats/);
  assert.match(nav, /calendar/);
  const profile = src('src/components/profile/ProfilePage.tsx');
  assert.match(profile, /to="\/stats"/);
  assert.match(profile, /to="\/calendar"/);
  const program = src('src/components/programs/ClientProgramPage.tsx');
  assert.match(program, /canUpdateOwnAssignedProgram/);
  assert.match(program, /canProposeAssignedProgramChange/);
  assert.doesNotMatch(program, /isSoloAthlete/);
  const roster = src('src/features/coaching/model/clientsSlice.ts');
  assert.match(roster, /\.eq\('coach_id', coachId\)/);
  assert.match(roster, /\.neq\('client_id', coachId\)/);
  assert.match(src('src/components/coaching/ClientsPage.tsx'), /canReadClientDossier/);
});
