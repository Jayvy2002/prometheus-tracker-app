import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { build } from 'esbuild';
import {
  computeSoloWeeklyReview,
  type SoloReviewInputs,
  type SoloWeeklyReview,
} from '../lib/soloCopilot';

type RpcError = { code?: string; message?: string } | null;
type Call = { kind: string; args: unknown[] };

interface SoloCopilotTestTransport {
  calls: Call[];
  rpcResult: { data: unknown; error: RpcError };
  supabase: {
    rpc: (name: string, args?: unknown) => Promise<{ data: unknown; error: RpcError }>;
    from: (table: string) => Record<string, unknown>;
  };
  profileStore: {
    getState: () => {
      updateProfile: (...args: unknown[]) => Promise<{ error: null }>;
      applyRemoteTargets: (...args: unknown[]) => void;
    };
  };
  track: (...args: unknown[]) => void;
}

const g = globalThis as typeof globalThis & { __soloCopilotTest?: SoloCopilotTestTransport };

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

function daysBack(n: number): string {
  const ms = Date.parse('2026-09-03T00:00:00Z') - n * 86_400_000;
  return new Date(ms).toISOString().slice(0, 10);
}

function stallReview(): SoloWeeklyReview {
  const nutritionLogs: SoloReviewInputs['nutritionLogs'] = [];
  for (let i = 0; i < 10; i++) {
    nutritionLogs.push({ logged_at: daysBack(i), calories: 1200 });
    nutritionLogs.push({ logged_at: daysBack(i), calories: 800 });
  }
  const weights: SoloReviewInputs['weights'] = [
    { measured_at: daysBack(13), weight_kg: 80 },
    { measured_at: daysBack(8), weight_kg: 80 },
    { measured_at: daysBack(4), weight_kg: 80 },
    { measured_at: daysBack(0), weight_kg: 80 },
  ];
  const review = computeSoloWeeklyReview({
    today: '2026-09-03',
    goal: 'cut',
    calorieTarget: 2000,
    proteinTarget: 160,
    carbsTarget: 190,
    fatTarget: 60,
    weightKg: 80,
    trainingFrequency: 3,
    nutritionLogs,
    weights,
    workouts: [],
  });
  assert.equal(review.proposal.action, 'calorie_adjustment');
  assert.ok(review.proposal.draft);
  return review;
}

function makeTransport(rpcResult: { data: unknown; error: RpcError }): SoloCopilotTestTransport {
  const calls: Call[] = [];
  const transport: SoloCopilotTestTransport = {
    calls,
    rpcResult,
    supabase: {
      rpc: async (name, args) => {
        calls.push({ kind: 'rpc', args: [name, args] });
        return transport.rpcResult;
      },
      from: (table) => {
        calls.push({ kind: 'from', args: [table] });
        const chain: Record<string, unknown> = {};
        for (const method of ['select', 'eq', 'neq', 'insert', 'update', 'upsert', 'delete', 'order', 'limit']) {
          chain[method] = (...args: unknown[]) => {
            calls.push({ kind: method, args: [table, ...args] });
            return chain;
          };
        }
        chain.maybeSingle = async () => {
          calls.push({ kind: 'maybeSingle', args: [table] });
          return { data: null, error: null };
        };
        return chain;
      },
    },
    profileStore: {
      getState: () => ({
        updateProfile: async (...args: unknown[]) => {
          calls.push({ kind: 'updateProfile', args });
          return { error: null };
        },
        applyRemoteTargets: (...args: unknown[]) => {
          calls.push({ kind: 'applyRemoteTargets', args });
        },
      }),
    },
    track: (...args: unknown[]) => {
      calls.push({ kind: 'track', args });
    },
  };
  return transport;
}

async function loadStore(transport: SoloCopilotTestTransport) {
  g.__soloCopilotTest = transport;
  const bundle = await build({
    stdin: {
      contents: "export { useSoloCopilotStore } from './src/stores/soloCopilotStore.ts';",
      resolveDir: process.cwd(),
    },
    bundle: true,
    write: false,
    platform: 'node',
    format: 'esm',
    plugins: [{
      name: 'solo-copilot-test-transport',
      setup(pluginBuild) {
        pluginBuild.onResolve(
          { filter: /(lib\/supabase|profileStore|lib\/telemetryClient)$/ },
          (args) => ({ path: args.path, namespace: 'solo-copilot-test' }),
        );
        pluginBuild.onLoad({ filter: /.*/, namespace: 'solo-copilot-test' }, (args) => {
          if (args.path.endsWith('supabase')) {
            return {
              contents: `
                export const supabase = {
                  rpc: (...args) => globalThis.__soloCopilotTest.supabase.rpc(...args),
                  from: (...args) => globalThis.__soloCopilotTest.supabase.from(...args),
                };
              `,
            };
          }
          if (args.path.endsWith('profileStore')) {
            return {
              contents: `
                export const useProfileStore = {
                  getState: () => globalThis.__soloCopilotTest.profileStore.getState(),
                };
              `,
            };
          }
          return { contents: 'export function track(...args) { globalThis.__soloCopilotTest.track(...args); }' };
        });
      },
    }],
  });
  const href = 'data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64')
    + `#${Date.now()}-${Math.random()}`;
  return import(href) as Promise<{ useSoloCopilotStore: {
    getState: () => {
      decidedWeek: string | null;
      decide: (userId: string, review: SoloWeeklyReview, decision: 'accepted' | 'kept' | 'dismissed') => Promise<{ error: string | null }>;
      clear: () => void;
    };
  } }>;
}

const MISSING_RPC = {
  code: 'PGRST202',
  message: 'Could not find the function public.commit_solo_weekly_review_decision in the schema cache',
};

test('missing commit_solo RPC refuses without mutating targets, review row, journal, or UI success', async () => {
  const transport = makeTransport({ data: null, error: MISSING_RPC });
  const { useSoloCopilotStore } = await loadStore(transport);
  useSoloCopilotStore.getState().clear();
  const review = stallReview();
  const result = await useSoloCopilotStore.getState().decide('athlete-1', review, 'accepted');

  assert.equal(result.error, MISSING_RPC.message);
  assert.equal(useSoloCopilotStore.getState().decidedWeek, null);
  assert.equal(transport.calls.filter((call) => call.kind === 'updateProfile').length, 0);
  assert.equal(transport.calls.filter((call) => call.kind === 'from').length, 0);
  assert.equal(transport.calls.filter((call) => call.kind === 'upsert').length, 0);
  assert.equal(transport.calls.filter((call) => call.kind === 'applyRemoteTargets').length, 0);
  assert.equal(transport.calls.filter((call) => call.kind === 'track').length, 0);
  const rpcs = transport.calls.filter((call) => call.kind === 'rpc');
  assert.equal(rpcs.length, 1);
  assert.equal(rpcs[0]?.args[0], 'commit_solo_weekly_review_decision');
  assert.ok(!transport.calls.some((call) => call.kind === 'rpc' && String(call.args[0]).includes('record_athlete_decision')));
  assert.ok(!transport.calls.some((call) => call.kind === 'rpc' && String(call.args[0]).includes('queue_and_record')));
  assert.ok(!transport.calls.some((call) => call.kind === 'rpc' && String(call.args[0]).includes('drain_athlete_decision_outbox')));
});

test('composite commit_solo RPC success applies local cache only after the atomic commit', async () => {
  const transport = makeTransport({ data: { ok: true }, error: null });
  const { useSoloCopilotStore } = await loadStore(transport);
  useSoloCopilotStore.getState().clear();
  const review = stallReview();
  const result = await useSoloCopilotStore.getState().decide('athlete-1', review, 'accepted');

  assert.equal(result.error, null);
  assert.equal(useSoloCopilotStore.getState().decidedWeek, review.weekStart);
  assert.equal(transport.calls.filter((call) => call.kind === 'updateProfile').length, 0);
  assert.equal(transport.calls.filter((call) => call.kind === 'from').length, 0);
  assert.equal(transport.calls.filter((call) => call.kind === 'upsert').length, 0);
  const applied = transport.calls.filter((call) => call.kind === 'applyRemoteTargets');
  assert.equal(applied.length, 1);
  assert.equal(applied[0]?.args[0], 'athlete-1');
  assert.deepEqual(applied[0]?.args[1], {
    daily_calorie_target: review.proposal.draft?.calories,
    protein_target: review.proposal.draft?.protein,
    carbs_target: review.proposal.draft?.carbs,
    fat_target: review.proposal.draft?.fat,
  });
  assert.equal(transport.calls.filter((call) => call.kind === 'rpc').length, 1);
  assert.equal(transport.calls.filter((call) => call.kind === 'track').length, 1);
});

test('Hotfix B inventory: dead journal helpers are gone; drain stays for server intents only', () => {
  const api = src('src/features/signals/domain/decisionLogApi.ts');
  const store = src('src/stores/soloCopilotStore.ts');
  const cycle = src('src/features/signals/domain/weeklyReviewCycle.ts');
  const slice = src('src/features/coaching/model/interventionsSlice.ts');
  for (const body of [api, store, cycle, slice]) {
    assert.doesNotMatch(body, /recordAthleteDecisionDurable/);
    assert.doesNotMatch(body, /recordAthleteDecisionBestEffort/);
    assert.doesNotMatch(body, /RecordAthleteDecisionInput/);
    assert.doesNotMatch(body, /decisionIdempotencyKey/);
  }
  assert.match(api, /drainAthleteDecisionOutboxBestEffort/);
  assert.match(cycle, /drainAthleteDecisionOutboxBestEffort/);
  assert.doesNotMatch(store, /drainAthleteDecisionOutboxBestEffort/);
  assert.doesNotMatch(store, /isMissingBackendContract/);
});
