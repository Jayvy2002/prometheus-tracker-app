import assert from 'node:assert/strict';
import { test } from 'node:test';
import { programListStatus, programUsageById } from './programListStatus';

test('a program without a saved revision is a draft, not an active program', () => {
  assert.deepEqual(programListStatus({ active_revision_no: null, scheduled_revision_no: null, scheduled_activates_on: null }), { kind: 'draft' });
  assert.deepEqual(programListStatus({ active_revision_no: 0 }), { kind: 'draft' });
});

test('a saved program shows its version, and a scheduled change with its date', () => {
  assert.deepEqual(programListStatus({ active_revision_no: 3 }), { kind: 'version', revision: 3 });
  assert.deepEqual(
    programListStatus({ active_revision_no: 3, scheduled_revision_no: 4, scheduled_activates_on: '2026-10-05' }),
    { kind: 'scheduled', revision: 3, nextRevision: 4, on: '2026-10-05' },
  );
  // A stale scheduled number (already active) is not an upcoming change.
  assert.deepEqual(programListStatus({ active_revision_no: 4, scheduled_revision_no: 4 }), { kind: 'version', revision: 4 });
});

test('usage counts active and paused clients; ended assignments are history', () => {
  const usage = programUsageById([
    { program_id: 'p1', status: 'active' },
    { program_id: 'p1', status: 'active' },
    { program_id: 'p1', status: 'paused' },
    { program_id: 'p1', status: 'completed' },
    { program_id: 'p2', status: 'ended' },
  ]);
  assert.deepEqual(usage, { p1: { active: 2, paused: 1 } });
});
