import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { linkEndedNotice, profileLinkEndedChanged, SOLO_TRIAL_DAYS } from './soloTransition';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

const NOW = new Date('2026-09-05T12:00:00Z');

test('link-ended notice: shown to the solo once, hidden with a new coach or after ack', () => {
  const profile = { coach_link_ended_at: '2026-09-04T10:00:00Z', solo_trial_ends_at: '2026-10-04T10:00:00Z' };
  const shown = linkEndedNotice({ profile, hasCoach: false, ackedEndedAt: null, now: NOW });
  assert.equal(shown.show, true);
  assert.equal(shown.trialDaysLeft, 29);
  assert.equal(shown.trialExpired, false);

  assert.equal(linkEndedNotice({ profile, hasCoach: true, ackedEndedAt: null, now: NOW }).show, false);
  assert.equal(linkEndedNotice({ profile, hasCoach: false, ackedEndedAt: '2026-09-04T10:00:00Z', now: NOW }).show, false);
  // A later unlink re-shows even if the previous one was acknowledged.
  assert.equal(linkEndedNotice({
    profile: { ...profile, coach_link_ended_at: '2026-09-05T09:00:00Z' },
    hasCoach: false, ackedEndedAt: '2026-09-04T10:00:00Z', now: NOW,
  }).show, true);

  const never = linkEndedNotice({ profile: { coach_link_ended_at: null }, hasCoach: false, ackedEndedAt: null, now: NOW });
  assert.equal(never.show, false);
  assert.equal(never.trialDaysLeft, null);

  const expired = linkEndedNotice({
    profile: { coach_link_ended_at: '2026-07-01T00:00:00Z', solo_trial_ends_at: '2026-07-31T00:00:00Z' },
    hasCoach: false, ackedEndedAt: null, now: NOW,
  });
  assert.equal(expired.trialExpired, true);
  assert.equal(expired.trialDaysLeft, 0);
  assert.equal(SOLO_TRIAL_DAYS, 30);
});

test('realtime: only a new coach_link_ended_at value triggers the role reload', () => {
  assert.equal(profileLinkEndedChanged(null, { coach_link_ended_at: '2026-09-04T10:00:00Z' }), true);
  assert.equal(profileLinkEndedChanged({ coach_link_ended_at: '2026-09-04T10:00:00Z' }, { coach_link_ended_at: '2026-09-04T10:00:00Z' }), false);
  assert.equal(profileLinkEndedChanged({ coach_link_ended_at: null }, { daily_calorie_target: 2000 }), false);
  assert.equal(profileLinkEndedChanged({ coach_link_ended_at: null }, { coach_link_ended_at: null }), false);
  assert.equal(profileLinkEndedChanged(undefined, null), false);
});

test('end_coach_client_link hands the account back to solo and starts the trial; nothing deleted', () => {
  const sql = src('supabase/migrations/20260905002213_end_coach_link_back_to_solo.sql');
  assert.match(sql, /SET coaching_role = 'none'/);
  assert.match(sql, /DELETE FROM public\.client_tracking_config/);
  assert.match(sql, /coach_link_ended_at = now\(\)/);
  assert.match(sql, /COALESCE\(solo_trial_ends_at, now\(\) \+ interval '30 days'\)/);
  assert.match(sql, /SET status = 'paused'/);
  assert.doesNotMatch(sql, /DELETE FROM public\.(workouts|nutrition_logs|weight_measurements|daily_checkins|progress_photos|user_profiles)/);
  assert.doesNotMatch(sql, /daily_calorie_target/);

  const store = src('src/stores/coachingStore.ts');
  assert.match(store, /profileLinkEndedChanged\(/);
  const dash = src('src/components/dashboard/Dashboard.tsx');
  assert.match(dash, /<LinkEndedBanner/);
  const banner = src('src/components/dashboard/LinkEndedBanner.tsx');
  assert.match(banner, /linkEndedNotice\(/);
  assert.match(banner, /linkEndedAckKey\(/);
  assert.match(banner, /dashboard\.linkEnded\.trial/);
});
