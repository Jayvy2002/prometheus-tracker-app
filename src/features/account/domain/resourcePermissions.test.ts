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
  canCorrectAthleteWatchContext,
  canDecideAthleteWatchProposal,
  canEditClientDossier,
  canLogOwnSession,
  canOpenPersonalCalendarRoute,
  canProposeAssignedProgramChange,
  canReadAssignedProgram,
  canReadAthleteWatch,
  canReadClientDossier,
  canReadOwnAssignedProgram,
  canReadOwnCalendar,
  canReadOwnHistory,
  canUpdateAssignedProgram,
  canUpdateCoachOwnedTargets,
  canUpdateOwnAssignedProgram,
  canUpdateOwnPersonalData,
  canUsePersonalTools,
  canImportCoachSpreadsheet,
  canImportPersonalHistory,
  canPrepareProvisionalDossier,
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

test('P2.4 watch: read is owner or active Coach; correction stays with Solo or the athlete’s Coach', () => {
  const own = { athleteId: 'A' };
  const client = { athleteId: 'C', hasActiveRelationship: true };
  const ended = { athleteId: 'C', hasActiveRelationship: false };

  for (const person of [solo(), coached(), coachSolo(), coachCoached(), coachCoached('coaching')]) {
    assert.equal(canReadAthleteWatch(person, own), true);
  }
  assert.equal(canCorrectAthleteWatchContext(solo(), own), true);
  assert.equal(canDecideAthleteWatchProposal(solo(), own), true);
  assert.equal(canCorrectAthleteWatchContext(coachSolo(), own), true);
  assert.equal(canDecideAthleteWatchProposal(coachSolo(), own), true);
  assert.equal(canCorrectAthleteWatchContext(coached(), own), false);
  assert.equal(canDecideAthleteWatchProposal(coached(), own), false);
  assert.equal(canCorrectAthleteWatchContext(coachCoached(), own), false);
  assert.equal(canDecideAthleteWatchProposal(coachCoached(), own), false);
  assert.equal(canCorrectAthleteWatchContext(coachCoached('coaching'), own), false);
  assert.equal(canDecideAthleteWatchProposal(coachCoached('coaching'), own), false);

  for (const person of [coachSolo(), coachSolo('coaching'), coachCoached(), coachCoached('coaching')]) {
    assert.equal(canReadAthleteWatch(person, client), true);
    assert.equal(canCorrectAthleteWatchContext(person, client), true);
    assert.equal(canDecideAthleteWatchProposal(person, client), true);
    assert.equal(canReadAthleteWatch(person, ended), false);
    assert.equal(canCorrectAthleteWatchContext(person, ended), false);
    assert.equal(canDecideAthleteWatchProposal(person, ended), false);
  }
  assert.equal(canReadAthleteWatch(solo(), client), false);
  assert.equal(canReadAthleteWatch(coached(), client), false);
  assert.equal(canCorrectAthleteWatchContext(solo(), client), false);
  assert.equal(canDecideAthleteWatchProposal(solo(), client), false);
  assert.equal(canReadAthleteWatch(coachSolo(), { athleteId: 'C' }), false);
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
  assert.equal(
    canReadAthleteWatch(personal, { athleteId: 'C', hasActiveRelationship: true }),
    canReadAthleteWatch(coaching, { athleteId: 'C', hasActiveRelationship: true }),
  );
  assert.equal(
    canDecideAthleteWatchProposal(personal, { athleteId: 'C', hasActiveRelationship: true }),
    canDecideAthleteWatchProposal(coaching, { athleteId: 'C', hasActiveRelationship: true }),
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

test('importing one\'s own history is personal: Solo, Coached and Coach alike', () => {
  for (const person of [solo(), coached(), coachSolo(), coachCoached('coaching')]) {
    assert.equal(canImportPersonalHistory(person), true);
  }
  const blocked = actorFromAccount(null, resolveAccountContext('none', null, true, null));
  assert.equal(canImportPersonalHistory(blocked), false);
});

test('P5.1 import is coach-only for self or an active client; workspace does not grant', () => {
  const client = { subjectUserId: 'C', hasActiveRelationship: true };
  const ended = { subjectUserId: 'C', hasActiveRelationship: false };
  for (const person of [coachSolo(), coachSolo('coaching'), coachCoached(), coachCoached('coaching')]) {
    assert.equal(canImportCoachSpreadsheet(person), true);
    assert.equal(canImportCoachSpreadsheet(person, { subjectUserId: 'A' }), true);
    assert.equal(canImportCoachSpreadsheet(person, client), true);
    assert.equal(canImportCoachSpreadsheet(person, ended), false);
  }
  assert.equal(canImportCoachSpreadsheet(solo(), client), false);
  assert.equal(canImportCoachSpreadsheet(coached(), client), false);
  const blocked = actorFromAccount(null, resolveAccountContext('none', null, true, null));
  assert.equal(canImportCoachSpreadsheet(blocked), false);
  const owned = { provisionalDossierId: 'D', ownsProvisionalDossier: true };
  const foreign = { provisionalDossierId: 'D', ownsProvisionalDossier: false };
  for (const person of [coachSolo(), coachSolo('coaching'), coachCoached(), coachCoached('coaching')]) {
    assert.equal(canPrepareProvisionalDossier(person), true);
    assert.equal(canImportCoachSpreadsheet(person, owned), true);
    assert.equal(canImportCoachSpreadsheet(person, foreign), false);
  }
  assert.equal(canPrepareProvisionalDossier(solo()), false);
  assert.equal(canPrepareProvisionalDossier(coached()), false);
  assert.equal(canImportCoachSpreadsheet(solo(), owned), false);
  assert.equal(canImportCoachSpreadsheet(blocked, owned), false);
});

test('server enforces owner writes, leftover coached save_program, nutrition targets and dossier isolation', () => {
  const save = latestMigrationContaining(/CREATE OR REPLACE FUNCTION public\.save_program\(/);
  assert.equal(save.file, '20260919225507_program_phases.sql');
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

test('stats, calendar and routines are personal surfaces, not persona-gated', () => {
  const app = src('src/app/router/AppRoutes.tsx');
  assert.match(app, /path="\/stats" element=\{<CoachTrackerRedirect><StatsPage/);
  assert.doesNotMatch(app, /path="\/stats" element=\{<CoachTrackerRedirect><CoachedAthleteRedirect>/);
  assert.match(app, /path="\/calendar" element=\{<CoachTrackerRedirect><CalendarPage/);
  assert.doesNotMatch(app, /path="\/calendar" element=\{<CoachTrackerRedirect><CoachedAthleteRedirect>/);
  // Routines are personal tools for Solo and Coaché (Vision §7.1). Checked on the
  // route line itself so a guard elsewhere in the file cannot satisfy it.
  const routinesRoute = app.split('\n').find(line => line.includes('path="/routines"')) ?? '';
  assert.match(routinesRoute, /<CoachTrackerRedirect><TrackingGate module="workouts"><RoutinesPage \/>/);
  assert.doesNotMatch(routinesRoute, /Coached/);
  assert.match(src('src/app/guards/RouteGuards.tsx'), /canUsePersonalTools/);
  assert.match(src('src/app/guards/RouteGuards.tsx'), /canActAsCoach/);
  const progress = src('src/components/workout/ExerciseProgressPage.tsx');
  assert.match(progress, /canReadOwnHistory/);
  assert.match(progress, /canOpenPersonalCalendarRoute/);
  const nav = src('src/app/navigation/navConfig.ts');
  assert.match(nav, /persona === 'coached'/);
  assert.match(nav, /stats/);
  assert.match(nav, /calendar/);
  assert.match(progress, /to="\/stats"/);
  assert.match(progress, /to="\/calendar"/);
  // Suivi hosts the calendar and the summary as its own sub-pages (layout routes),
  // shown only to who may open them; logging pages live in Corps.
  const suivi = src('src/components/navigation/SuiviHub.tsx');
  assert.match(suivi, /canOpenPersonalCalendarRoute/);
  assert.match(suivi, /canReadOwnHistory/);
  assert.doesNotMatch(suivi, /NutritionPage/);
  const suiviLayout = app.slice(app.indexOf('<Route element={<CoachTrackerRedirect><SuiviHub />'), app.indexOf('<Route path="/profile"'));
  assert.match(suiviLayout, /<CalendarPage/);
  assert.match(suiviLayout, /<StatsPage/);
  assert.doesNotMatch(suiviLayout, /NutritionPage/);
  assert.doesNotMatch(src('src/components/profile/ProfilePage.tsx'), /to="\/stats"/);
  const program = src('src/components/programs/ClientProgramPage.tsx');
  assert.match(program, /canUpdateOwnAssignedProgram/);
  assert.match(program, /canProposeAssignedProgramChange/);
  assert.doesNotMatch(program, /isSoloAthlete/);
  const roster = src('src/features/coaching/model/clientsSlice.ts');
  assert.match(roster, /\.eq\('coach_id', coachId\)/);
  assert.match(roster, /\.neq\('client_id', coachId\)/);
  assert.match(src('src/components/coaching/ClientsPage.tsx'), /canReadClientDossier/);
});
