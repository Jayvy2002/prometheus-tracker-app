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
    // Mirrors start_workout_from_template_op: idempotent on the op id.
    async rpc(name: string, args: Record<string, unknown>) {
      if (db().failNextWrite) {
        const error = db().failNextWrite;
        db().failNextWrite = null;
        return { data: null, error };
      }
      if (name === 'declare_constraint') {
        const rows = (db().tables.constraints ??= []);
        if (!rows.some(r => r.client_op_id === args.p_client_op_id)) {
          rows.push({ id: `srv-c-${++db().seq}`, ...args, client_op_id: args.p_client_op_id } as Row);
        }
        if (db().loseNextResponse) {
          db().loseNextResponse = false;
          return { data: null, error: { message: 'Failed to fetch' } };
        }
        return { data: rows[0].id, error: null };
      }
      if (name !== 'start_workout_from_template_op') return { data: null, error: { message: 'unknown rpc' } };
      const rows = (db().tables.workouts ??= []);
      let workout = rows.find(r => r.client_op_id === args.p_client_op_id);
      if (!workout) {
        workout = { id: `srv-${++db().seq}`, client_op_id: args.p_client_op_id, name: args.p_name, date: args.p_date } as Row;
        rows.push(workout);
        const exercises = (args.p_exercises as Array<{ default_sets?: number }>).map((ex, i) => ({
          id: `srv-ex-${workout!.id}-${i}`, order_index: i,
          sets: Array.from({ length: ex.default_sets ?? 3 }, (_, j) => `srv-set-${workout!.id}-${i}-${j}`),
        }));
        workout.shape = { workout_id: workout.id, exercises };
      }
      const result = { data: workout.shape, error: null };
      if (db().loseNextResponse) {
        db().loseNextResponse = false;
        return { data: null, error: { message: 'Failed to fetch' } };
      }
      return result;
    },
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

test('a session started offline replays once and hands back real ids for every exercise and set', async () => {
  g.__replayTest = { db: freshDb() };
  const { replayOfflineOp } = await loadReplay();
  const start = op('op-start', 'workout.startTemplate', {
    name: 'Lower', date: '2026-09-20T09:00:00', programAssignmentId: 'a1', programDayId: 'd1',
    exercises: [{ name: 'Squat', default_sets: 2, default_reps: 5, order_index: 0 }],
  });
  g.__replayTest.db.loseNextResponse = true;
  assert.equal((await replayOfflineOp(start, identity)).transport, true);
  const replay = await replayOfflineOp(start, identity) as { realId?: string; extraMaps?: Array<[string, string]> };
  assert.equal(g.__replayTest.db.tables.workouts.length, 1);
  assert.equal(replay.realId, 'srv-1');
  const maps = new Map(replay.extraMaps);
  assert.equal(maps.get('local-op-start.e0'), 'srv-ex-srv-1-0');
  assert.equal(maps.get('local-op-start.e0.s1'), 'srv-set-srv-1-0-1');
});

test('a pain reported offline mid-session is declared once, and a session still local is not sent as an id', async () => {
  g.__replayTest = { db: freshDb() };
  const { replayOfflineOp } = await loadReplay();
  const declare = op('op-pain', 'constraint.declare', {
    userId: 'athlete-1', kind: 'pain', bodyArea: 'knee', severity: 3, persistence: 'temporary',
    exerciseName: 'Squat', workoutId: 'local-op-start',
  });
  g.__replayTest.db.loseNextResponse = true;
  assert.equal((await replayOfflineOp(declare, identity)).transport, true);
  assert.deepEqual(await replayOfflineOp(declare, identity), {});
  const rows = g.__replayTest.db.tables.constraints;
  assert.equal(rows.length, 1);
  assert.equal(rows[0].p_workout_id, null, 'an unmapped local session id never reaches the server');
  // Once the session is synced, its real id is used.
  g.__replayTest = { db: freshDb() };
  await replayOfflineOp(op('op-pain-2', 'constraint.declare', { userId: 'athlete-1', kind: 'pain', workoutId: 'local-op-start' }),
    id => (id === 'local-op-start' ? 'srv-w-1' : id));
  assert.equal(g.__replayTest.db.tables.constraints[0].p_workout_id, 'srv-w-1');
});
