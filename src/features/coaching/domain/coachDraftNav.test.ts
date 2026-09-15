import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { isHumanCoachCause, parseFleetCause } from './coachFleet';
import {
  draftBackTarget,
  interventionHref,
  isClientBoundDraft,
  openDraftHref,
} from './coachInterventions';
import type { CoachIntervention } from '../../../lib/types';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

function draft(partial: Partial<CoachIntervention> = {}): CoachIntervention {
  return {
    id: 'd1',
    coach_id: 'coach',
    client_id: 'lea',
    kind: 'program_nl_edit',
    title: 'Édition programme — brouillon',
    rationale: 'Ajustement léger proposé d’après la dernière séance.',
    payload: { cause: 'Ajustement léger proposé d’après la dernière séance.' },
    status: 'pending',
    source: 'agent',
    created_at: '2026-08-29T00:00:00Z',
    updated_at: '2026-08-29T00:00:00Z',
    resolved_at: null,
    ...partial,
  };
}

test('Today-opened drafts go back to Aujourd’hui; 360 stays a separate link', () => {
  const href = interventionHref(draft(), { from: 'today' });
  assert.equal(href, '/clients/lea/draft/d1?from=today');
  assert.equal(draftBackTarget({ from: 'today', clientId: 'lea' }).href, '/dashboard');
  assert.equal(draftBackTarget({ from: 'today', clientId: 'lea' }).kind, 'today');

  const clientBack = draftBackTarget({ from: null, clientId: 'lea' });
  assert.equal(clientBack.href, '/clients/lea?tab=overview');
  assert.equal(clientBack.kind, 'client');

  const page = src('src/components/coaching/InterventionDraftPage.tsx');
  assert.match(page, /draftBackTarget/);
  assert.match(page, /coaching\.command\.openClient/);
  assert.doesNotMatch(page, /cause \|\| row\.rationale/);

  const queue = src('src/components/coaching/CoachTodayQueue.tsx');
  assert.match(queue, /primaryQueueAction/);
  assert.match(queue, /queueActionHref/);
});

test('Ask and Demander un ajustement navigate to the editable draft, never a leftover chip', () => {
  const ask = src('src/components/coaching/AskPrometheusPage.tsx');
  assert.match(ask, /openDraftHref\(\{ kind, client_id: clientId, id: result\.id \}, \{ from: 'ask' \}\)/);
  assert.match(ask, /navigate\(href\)/);
  assert.doesNotMatch(ask, /coaching\.ask\.openDraft/);
  assert.doesNotMatch(ask, /setActiveId/);

  for (const rel of [
    'src/components/coaching/LastSessionReview.tsx',
    'src/components/coaching/RecoverySnapshotPanel.tsx',
  ]) {
    const file = src(rel);
    assert.match(file, /openDraftHref\(\{ kind: 'program_nl_edit'/);
    assert.match(file, /navigate\(href\)/);
    assert.doesNotMatch(file, /coaching\.ask\.openDraft/);
    assert.doesNotMatch(file, /setJobId/);
  }
});

test('program editor resolves both accepted and cancelled AI proposals', () => {
  const editor = src('src/components/coaching/ProgramSessionEditor.tsx');
  assert.match(editor, /resolveIntervention\(nlRow\.id, 'dismissed'/);
  assert.match(editor, /resolveIntervention\(nlRow\.id, 'kept'/);
  assert.match(editor, /editor_resolution: 'cancelled'/);
  assert.match(editor, /editor_resolution: 'applied_to_editor'/);
  assert.doesNotMatch(editor, /variant="ghost" onClick=\{\(\) => setProposal\(null\)\}/);
});

test('PROGRAM NL EDIT cause is a short French sentence, not a prompt or JSON dump', () => {
  const prompt = 'Léa a loggé Upper le 2026-08-28.\nSquat 80kg × 5\nPropose un ajustement.';
  assert.equal(isHumanCoachCause(prompt), false);
  assert.equal(isHumanCoachCause('{"kind":"program_nl_edit","sets":[1,2]}'), false);
  assert.equal(isHumanCoachCause('Error: TRACE\nat runCoachAgent'), false);
  assert.equal(
    isHumanCoachCause('Ajustement léger proposé d’après la dernière séance.'),
    true,
  );

  assert.equal(
    parseFleetCause({ cause: prompt }, prompt),
    '',
  );
  assert.equal(
    parseFleetCause(
      { cause: 'Ajustement léger proposé d’après la dernière séance.' },
      prompt,
    ),
    'Ajustement léger proposé d’après la dernière séance.',
  );

  const agent = src('supabase/functions/_shared/coachAgent.ts');
  assert.match(agent, /cause = UNE phrase courte pour le coach/);
  assert.match(agent, /function defaultNlCause/);
  assert.match(agent, /Ajustement léger proposé d’après la dernière séance/);
  assert.doesNotMatch(agent, /rationale: input\.prompt/);
});

test('App-wide cards without a client are not client-file drafts', () => {
  assert.equal(isClientBoundDraft(draft({ kind: 'ask_prometheus', client_id: null })), false);
  assert.equal(isClientBoundDraft(draft({ kind: 'program_nl_edit', client_id: 'lea' })), true);
  assert.equal(openDraftHref(draft({ client_id: null })), '/inbox/d1');

  const detail = src('src/components/coaching/ClientDetailPage.tsx');
  assert.match(detail, /pendingForClient\(/);
  const chip = detail.slice(detail.indexOf('openDraftHref(pendingForClient'));
  assert.match(chip, /pendingForClient\(pendingInterventions, id\)/);
});
