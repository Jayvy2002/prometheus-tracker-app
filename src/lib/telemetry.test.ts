import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import {
  buildProductEvent,
  normalizeScreenPath,
  sanitizeEventProps,
  shouldTrackScreen,
  telemetryRole,
} from './telemetry';
import { coachingStoreSource } from './coachingStoreSource';
import { typesSource } from './typesSource';
import { marketplaceUiSource } from './marketplaceUiSource';

function src(rel: string): string {
  if (rel === 'src/stores/coachingStore.ts') return coachingStoreSource();
  if (rel === 'src/lib/types.ts') return typesSource();
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

const coach = { id: 'c1', full_name: 'Coach', avatar_url: '' };

test('telemetry role: coach / client (linked) / solo', () => {
  assert.equal(telemetryRole('coach', null), 'coach');
  assert.equal(telemetryRole('client', null), 'client');
  assert.equal(telemetryRole('none', coach), 'client');
  assert.equal(telemetryRole('none', null), 'solo');
});

test('screen paths drop ids, tokens and query strings', () => {
  assert.equal(normalizeScreenPath('/dashboard'), '/dashboard');
  assert.equal(normalizeScreenPath('/'), '/');
  assert.equal(
    normalizeScreenPath('/clients/3f2a1b4c-9d8e-4f00-a1b2-c3d4e5f60718/draft/9b1c2d3e-4f50-4a6b-8c7d-0e1f2a3b4c5d?tab=x'),
    '/clients/:id/draft/:id',
  );
  assert.equal(normalizeScreenPath('/invite/0123456789abcdef0123456789abcdef'), '/invite/:id');
  assert.equal(normalizeScreenPath('/workout/new'), '/workout/new');
  assert.equal(normalizeScreenPath('/nutrition?add=1#top'), '/nutrition');
});

test('one screen_view per distinct screen in a row', () => {
  assert.equal(shouldTrackScreen(null, '/dashboard'), true);
  assert.equal(shouldTrackScreen('/dashboard', '/dashboard'), false);
  assert.equal(shouldTrackScreen('/dashboard', '/clients'), true);
});

test('props stay structural and short; no row without a user', () => {
  assert.deepEqual(
    sanitizeEventProps({ kind: 'adherence', ok: true, n: 3, none: null, nan: NaN, obj: { a: 1 }, long: 'x'.repeat(200) }),
    { kind: 'adherence', ok: true, n: 3, none: null, long: 'x'.repeat(80) },
  );
  assert.equal(buildProductEvent({ userId: null, coachingRole: 'none', myCoach: null, event: 'screen_view' }), null);
  assert.deepEqual(
    buildProductEvent({ userId: 'u1', coachingRole: 'coach', myCoach: null, event: 'fleet_round_run', props: { flagged: 2 } }),
    { user_id: 'u1', role: 'coach', event: 'fleet_round_run', props: { flagged: 2 } },
  );
});

test('telemetry table is insert-only for the app and cascades on account deletion', () => {
  const sql = src('supabase/migrations/20260905002127_product_events.sql');
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.product_events/);
  assert.match(sql, /ON DELETE CASCADE/);
  assert.match(sql, /ENABLE ROW LEVEL SECURITY/);
  assert.match(sql, /FOR INSERT TO authenticated/);
  assert.doesNotMatch(sql, /FOR SELECT/);
  assert.match(sql, /CHECK \(role IN \('coach', 'client', 'solo'\)\)/);
});

test('track() is wired on the loops that matter (coach, client, solo)', () => {
  const layout = src('src/app/layout/AppLayout.tsx');
  assert.match(layout, /trackScreen\(location\.pathname\)/);
  const intake = src('src/components/onboarding/KinesiologyIntakeFlow.tsx');
  assert.match(intake, /track\('intake_completed'/);
  const store = src('src/stores/coachingStore.ts');
  for (const event of [
    'invite_created', 'invite_accepted', 'intervention_resolved', 'coach_message_sent',
    'client_reply_sent', 'tracking_config_saved', 'nutrition_targets_set', 'fleet_round_run', 'agent_asked',
  ]) {
    assert.match(store, new RegExp(`track\\('${event}'`), event);
  }
  assert.match(src('src/stores/programStore.ts'), /track\('program_assigned'/);
  assert.match(src('src/stores/programStore.ts'), /track\('program_saved'/);
  assert.match(src('src/stores/programStore.ts'), /track\('program_deleted'/);
  assert.match(src('src/stores/workoutStore.ts') + src('src/features/workout/data/loadFullWorkout.ts') + src('src/features/workout/data/replayOfflineOp.ts') + src('src/features/workout/data/offlineIds.ts'), /track\('workout_completed'/);
  assert.match(src('src/stores/checkinStore.ts'), /track\('checkin_saved'/);
  assert.match(src('src/components/auth/AuthPage.tsx'), /track\('account_created'/);
  assert.match(src('src/components/dashboard/SoloProgramProposal.tsx'), /track\('solo_program_accepted'/);
  assert.match(src('src/components/dashboard/SoloProgramProposal.tsx'), /track\('solo_program_dismissed'/);
  assert.match(src('src/components/coaching/ProgramSessionEditor.tsx') + src('src/features/programs/hooks/useProgramEditorTracking.ts') + src('src/features/programs/hooks/useProgramNlEdit.ts'), /track\('solo_program_nl_asked'/);
  assert.match(src('src/components/coaching/ClientSetupPage.tsx'), /track\('setup_targets_choice'/);
  assert.match(src('src/lib/types.ts'), /'setup_targets_choice'/);
  assert.match(src('src/lib/types.ts'), /'coaching_request_accepted'/);
  assert.match(src('src/lib/types.ts'), /'marketplace_athlete_confirmed'/);
  assert.match(marketplaceUiSource(), /track\('coaching_request_accepted'/);
  assert.match(marketplaceUiSource(), /track\('marketplace_athlete_confirmed'/);
  const client = src('src/lib/telemetryClient.ts');
  assert.match(client, /from\('product_events'\)/);
  assert.doesNotMatch(client, /await supabase/);
});
