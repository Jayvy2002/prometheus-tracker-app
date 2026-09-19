import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { coachingStoreSource } from './coachingStoreSource';

/**
 * Guards for link/message/assignment write locks, including Hotfix A identity immutability.
 *
 * Column grants after 20260905135151 blocked client_id/coach_id, but status stayed writable
 * and the UPDATE policy did not freeze identity. Hotfix A adds a trigger and allowlists
 * authenticated to SELECT + UPDATE (last_visited_at, last_nudged_at). These tests read
 * the last grant/policy in migration order.
 */

const MIGRATIONS = resolve(process.cwd(), 'supabase/migrations');

function migrationsInOrder(): Array<{ file: string; sql: string }> {
  return readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((file) => ({ file, sql: readFileSync(resolve(MIGRATIONS, file), 'utf8') }));
}

/** Last GRANT statement that gives `authenticated` UPDATE on `table`, across all migrations. */
function lastUpdateGrant(table: string): string {
  const re = new RegExp(
    `GRANT\\s+[^;]*?UPDATE[^;]*?\\s+ON\\s+(?:TABLE\\s+)?(?:public\\.)?${table}\\s+TO\\s+authenticated\\s*;`,
    'gi',
  );
  let last = '';
  for (const { sql } of migrationsInOrder()) {
    for (const m of sql.matchAll(re)) last = m[0];
  }
  assert.ok(last, `no UPDATE grant found for ${table}`);
  return last;
}

/** Last `CREATE POLICY … ON <table>` block per policy name, in migration order. */
function policiesOn(table: string): Map<string, string> {
  const re = new RegExp(
    `(?:DROP POLICY IF EXISTS\\s+"([^"]+)"\\s+ON\\s+(?:public\\.)?${table}\\s*;)|(CREATE POLICY\\s+"([^"]+)"\\s+ON\\s+(?:public\\.)?${table}[\\s\\S]*?;)`,
    'gi',
  );
  const out = new Map<string, string>();
  for (const { sql } of migrationsInOrder()) {
    for (const m of sql.matchAll(re)) {
      if (m[1]) out.delete(m[1]);
      else out.set(m[3], m[2]);
    }
  }
  return out;
}

function latestProtectTrigger(): string {
  let last = '';
  for (const { sql } of migrationsInOrder()) {
    const marker = 'CREATE OR REPLACE FUNCTION public.protect_coach_client_link_identity()';
    const at = sql.indexOf(marker);
    if (at >= 0) last = sql.slice(at, sql.indexOf('$$;', at) + 3);
  }
  assert.ok(last, 'no migration defines protect_coach_client_link_identity');
  return last;
}

/** Column keys written by every `.from('<table>').update({ … })` in a source file. */
function updatedColumns(file: string, table: string): Set<string> {
  const src = file === 'src/stores/coachingStore.ts'
    ? coachingStoreSource()
    : readFileSync(resolve(process.cwd(), file), 'utf8');
  const re = new RegExp(`from\\('${table}'\\)\\s*\\.update\\(\\s*\\{([^}]*)\\}`, 'g');
  const cols = new Set<string>();
  for (const m of src.matchAll(re)) {
    for (const part of m[1].split(',')) {
      const key = part.split(':')[0].trim();
      if (key) cols.add(key);
    }
  }
  return cols;
}

test('coach_client_links: authenticated may only UPDATE bookkeeping columns, never identity or status', () => {
  const grant = lastUpdateGrant('coach_client_links');
  assert.match(grant, /GRANT\s+UPDATE\s*\(/, `table-level UPDATE grant is back: ${grant}`);
  const cols = grant.match(/\(([^)]*)\)/)![1].split(',').map((c) => c.trim()).sort();
  assert.deepEqual(cols, ['last_nudged_at', 'last_visited_at']);

  const written = updatedColumns('src/stores/coachingStore.ts', 'coach_client_links');
  assert.ok(written.size > 0, 'expected the store to update coach_client_links somewhere');
  for (const c of written) assert.ok(cols.includes(c), `store writes ungranted column ${c}`);

  const policies = policiesOn('coach_client_links');
  const update = [...policies.values()].filter((p) => /FOR UPDATE/i.test(p));
  assert.equal(update.length, 1, 'exactly one UPDATE policy on coach_client_links');
  assert.match(update[0], /USING\s*\(\s*coach_id\s*=\s*\(select auth\.uid\(\)\)\s*AND\s+status\s*=\s*'active'\s*\)/i,
    'an ended link must not be re-activatable by the coach');
  assert.match(update[0], /WITH CHECK\s*\(\s*coach_id\s*=\s*\(select auth\.uid\(\)\)\s*AND\s+status\s*=\s*'active'\s*\)/i,
    'bookkeeping must not flip status');
  assert.equal([...policies.values()].some((p) => /FOR (INSERT|DELETE|ALL)/i.test(p)), false,
    'links are created/deleted only through SECURITY DEFINER RPCs');

  const identity = latestProtectTrigger();
  assert.match(identity, /coach_client_link_identity_immutable/);
  assert.match(identity, /NEW\.coach_id IS DISTINCT FROM OLD\.coach_id/);
  assert.match(identity, /NEW\.client_id IS DISTINCT FROM OLD\.client_id/);
});

test('coach_messages: recipients may only UPDATE read_at', () => {
  const grant = lastUpdateGrant('coach_messages');
  assert.match(grant, /GRANT\s+UPDATE\s*\(\s*read_at\s*\)/, `table-level UPDATE grant is back: ${grant}`);
  const written = updatedColumns('src/stores/coachingStore.ts', 'coach_messages');
  assert.deepEqual([...written], ['read_at']);
});

test('program_assignments: only the assigner mutates; the coached client can read but not delete', () => {
  const policies = policiesOn('program_assignments');
  const bodies = [...policies.values()];
  assert.equal(bodies.some((p) => /FOR ALL/i.test(p)), false, 'FOR ALL policy is back (client could DELETE)');
  const del = bodies.filter((p) => /FOR DELETE/i.test(p));
  assert.equal(del.length, 1);
  assert.match(del[0], /assigned_by\s*=\s*\(select auth\.uid\(\)\)/i);
  assert.match(del[0], /actor_is_actively_coached/);
  const sel = bodies.filter((p) => /FOR SELECT/i.test(p));
  // C04 adds a second SELECT policy (coach reads active clients' history) — read-only.
  assert.equal(sel.length, 2);
  assert.ok(sel.some((p) => /client_id\s*=\s*\(select auth\.uid\(\)\)/i.test(p)), 'client must still read its own assignment');
  const history = sel.find((p) => /Coaches read client assignment history/i.test(p));
  assert.ok(history, 'coach history read policy missing');
  assert.match(history as string, /is_coach_of\(client_id\)/i);
  const upd = bodies.filter((p) => /FOR UPDATE/i.test(p));
  assert.equal(upd.length, 1);
  assert.match(upd[0], /assigned_by\s*=\s*\(select auth\.uid\(\)\)/i);
  assert.match(upd[0], /is_coach_of\(client_id\)/);
  assert.match(upd[0], /actor_owns_program/);
  assert.match(upd[0], /actor_is_actively_coached/);
  const ins = bodies.filter((p) => /FOR INSERT/i.test(p));
  assert.equal(ins.length, 1);
  assert.match(ins[0], /actor_is_actively_coached/);
  assert.match(ins[0], /actor_owns_program/);
});

test('search_food_products is not callable with the anon key', () => {
  let lastRevoke = '';
  for (const { sql } of migrationsInOrder()) {
    for (const m of sql.matchAll(/REVOKE\s+ALL\s+ON\s+FUNCTION\s+(?:public\.)?search_food_products[^;]*;/gi)) lastRevoke = m[0];
  }
  assert.match(lastRevoke, /FROM\s+PUBLIC\s*,\s*anon/i);
});

test('invoke_coach_fleet_round fails loudly (job shows failed) instead of a silent no-op', () => {
  const marker = 'CREATE OR REPLACE FUNCTION public.invoke_coach_fleet_round';
  let fn = '';
  for (const { sql } of migrationsInOrder()) {
    const at = sql.indexOf(marker);
    if (at >= 0) fn = sql.slice(at, sql.indexOf('$$;', at));
  }
  assert.ok(fn, 'no migration defines invoke_coach_fleet_round');
  assert.match(fn, /FLEET_CRON_SECRET/);
  assert.doesNotMatch(fn, /GROK_BOT_WEBHOOK_SECRET/i);
  assert.doesNotMatch(fn, /RAISE WARNING[\s\S]*?RETURN NULL/, 'silent skip is back');
  assert.match(fn, /RAISE EXCEPTION 'coach-fleet-round: no FLEET_CRON_SECRET/);
  assert.match(fn, /RAISE EXCEPTION 'coach-fleet-round: pg_net missing/);
});
