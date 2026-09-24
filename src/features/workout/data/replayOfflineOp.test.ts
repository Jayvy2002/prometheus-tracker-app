import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';
import type { OfflineOp } from '../../../lib/offlineQueue';

/**
 * Vision §26 — the offline session is the absolute priority: queued writes
 * replay later WITHOUT duplicates. This drives the real replayOfflineOp against
 * an in-memory table that enforces the same `client_op_id` uniqueness as the DB.
 */

type Row = Record<string, unknown> & { id: string };
type Failure = { message: string; code?: string };

interface FakeDb {
  tables: Record<string, Row[]>;
  /** Next write fails with this error before touching the table (network down). */
  failNextWrite: Failure | null;
  /** Next insert is stored but its response is lost (partial success). */
  loseNextResponse: boolean;
  seq: number;
}

const g = globalThis as unknown as { __replayTest: { db: FakeDb } };

function fakeSupabase() {
  const db = () => g.__replayTest.db;
  return {
    from(table: string) {
      const rows = () => (db().tables[table] ??= []);
      let filters: Array<[string, unknown]> = [];
      let mode: 'select' | 'insert' | 'update' | 'delete' = 'select';
      let payload: Record<string, unknown> = {};
      const run = async (): Promise<{ data: unknown; error: Failure | null }> => {
        if (mode !== 'select' && db().failNextWrite) {
          const error = db().failNextWrite;
          db().failNextWrite = null;
          return { data: null, error };
        }
        const match = (r: Row) => filters.every(([k, v]) => r[k] === v);
        if (mode === 'insert') {
          const op = payload.client_op_id;
          if (op && rows().some(r => r.client_op_id === op)) {
            return { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint' } };
          }
          const row = { ...payload, id: `srv-${++db().seq}` } as Row;
          rows().push(row);
          if (db().loseNextResponse) {
            db().loseNextResponse = false;
            return { data: null, error: { message: 'Failed to fetch' } };
          }
          return { data: row, error: null };
        }
        if (mode === 'update') {
          rows().filter(match).forEach(r => Object.assign(r, payload));
          return { data: null, error: null };
        }
        if (mode === 'delete') {
          db().tables[table] = rows().filter(r => !match(r));
          return { data: null, error: null };
        }
        return { data: rows().find(match) ?? null, error: null };
      };
      const chain = {
        insert(row: Record<string, unknown>) { mode = 'insert'; payload = row; return chain; },
        update(values: Record<string, unknown>) { mode = 'update'; payload = values; return chain; },
        delete() { mode = 'delete'; return chain; },
        select() { return chain; },
        eq(col: string, value: unknown) { filters = [...filters, [col, value]]; return chain; },
        maybeSingle: run,
        then(resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) { return run().then(resolve, reject); },
      };
      return chain;
    },
  };
}

async function loadReplay() {
  const bundle = await build({
    stdin: {
      contents: "export { replayOfflineOp } from './src/features/workout/data/replayOfflineOp.ts';",
      resolveDir: process.cwd(),
    },
    bundle: true,
    write: false,
    platform: 'node',
    format: 'esm',
    plugins: [{
      name: 'replay-test-supabase',
      setup(pluginBuild) {
        pluginBuild.onResolve({ filter: /lib\/supabase$/ }, args => ({ path: args.path, namespace: 'replay-test' }));
        pluginBuild.onLoad({ filter: /.*/, namespace: 'replay-test' }, () => ({
          contents: 'export const supabase = globalThis.__replayFake;',
        }));
      },
    }],
  });
  (globalThis as unknown as { __replayFake: unknown }).__replayFake = fakeSupabase();
  const href = 'data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64')
    + `#${Math.random()}`;
  return (await import(href)) as {
    replayOfflineOp: (op: OfflineOp, mapId: (id: string) => string) => Promise<{
      error?: string; transport?: boolean; realId?: string;
    }>;
  };
}

function freshDb(): FakeDb {
  return { tables: {}, failNextWrite: null, loseNextResponse: false, seq: 0 };
}

function op(id: string, type: OfflineOp['type'], payload: Record<string, unknown>): OfflineOp {
  return { id, accountId: 'athlete-1', type, payload, createdAt: '2026-09-23T10:00:00Z', attempts: 0, lastError: null, status: 'pending' };
}

const identity = (id: string) => id;

test('a queued workout replays once, and a retry after a lost response finds the same row', async () => {
  g.__replayTest = { db: freshDb() };
  const { replayOfflineOp } = await loadReplay();
  const create = op('op-w1', 'workout.create', { workout: { user_id: 'athlete-1', name: 'Push' } });

  // The server stored the row but the answer never came back (tunnel, gym basement).
  g.__replayTest.db.loseNextResponse = true;
  const first = await replayOfflineOp(create, identity);
  assert.equal(first.transport, true);
  assert.equal(g.__replayTest.db.tables.workouts.length, 1);

  // The queue retries the same op: no second workout, the real id is recovered.
  const retry = await replayOfflineOp(create, identity);
  assert.equal(retry.realId, 'srv-1');
  assert.equal(g.__replayTest.db.tables.workouts.length, 1);
});

test('a network failure keeps the op for later instead of dropping it as an error', async () => {
  g.__replayTest = { db: freshDb() };
  const { replayOfflineOp } = await loadReplay();
  g.__replayTest.db.failNextWrite = { message: 'TypeError: Failed to fetch' };
  const result = await replayOfflineOp(op('op-s1', 'set.add', { exerciseId: 'ex-1', set: { reps: 8, weight_kg: 60 } }), identity);
  assert.deepEqual(result, { transport: true });
  assert.equal((g.__replayTest.db.tables.workout_sets ?? []).length, 0);
});

test('a real server refusal is an error, not a silent success or an endless retry', async () => {
  g.__replayTest = { db: freshDb() };
  const { replayOfflineOp } = await loadReplay();
  g.__replayTest.db.failNextWrite = { message: 'new row violates row-level security policy', code: '42501' };
  const result = await replayOfflineOp(op('op-s2', 'set.add', { exerciseId: 'ex-1', set: { reps: 5 } }), identity);
  assert.equal(result.transport, undefined);
  assert.match(result.error ?? '', /row-level security/);
});

test('sets created offline land on the server exercise once its temporary id is mapped', async () => {
  g.__replayTest = { db: freshDb() };
  const { replayOfflineOp } = await loadReplay();
  const map = new Map([['tmp-ex-1', 'srv-ex-9']]);
  const result = await replayOfflineOp(
    op('op-s3', 'set.add', { exerciseId: 'tmp-ex-1', set: { reps: 10, weight_kg: 40 } }),
    id => map.get(id) ?? id,
  );
  assert.ok(result.realId);
  assert.equal(g.__replayTest.db.tables.workout_sets[0].exercise_id, 'srv-ex-9');
  assert.equal(g.__replayTest.db.tables.workout_sets[0].client_op_id, 'op-s3');
});
