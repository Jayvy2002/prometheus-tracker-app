import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';

/**
 * Guards for 20260905000003_lock_link_message_assignment_writes.
 *
 * Before it, `authenticated` could UPDATE every column of coach_client_links (a coach could point
 * its own link at any user and become is_coach_of them) and of coach_messages (a client could
 * rewrite the coach's text), and a coached client could DELETE the coach's program_assignments.
 * These tests read the migrations in order and check the LAST word on each grant / policy stays
 * column-restricted, and that the app only writes the columns that are still granted.
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

/** Column keys written by every `.from('<table>').update({ … })` in a source file. */
function updatedColumns(file: string, table: string): Set<string> {
  const src = readFileSync(resolve(process.cwd(), file), 'utf8');
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

test('coach_client_links: authenticated may only UPDATE bookkeeping columns, never client_id/coach_id', () => {
  const grant = lastUpdateGrant('coach_client_links');
  assert.match(grant, /GRANT\s+UPDATE\s*\(/, `table-level UPDATE grant is back: ${grant}`);
  const cols = grant.match(/\(([^)]*)\)/)![1].split(',').map((c) => c.trim()).sort();
  assert.deepEqual(cols, ['last_nudged_at', 'last_visited_at', 'status', 'updated_at']);

  const written = updatedColumns('src/stores/coachingStore.ts', 'coach_client_links');
  assert.ok(written.size > 0, 'expected the store to update coach_client_links somewhere');
  for (const c of written) assert.ok(cols.includes(c), `store writes ungranted column ${c}`);

  const policies = policiesOn('coach_client_links');
  const update = [...policies.values()].filter((p) => /FOR UPDATE/i.test(p));
  assert.equal(update.length, 1, 'exactly one UPDATE policy on coach_client_links');
  assert.match(update[0], /USING\s*\(\s*coach_id\s*=\s*\(select auth\.uid\(\)\)\s*AND\s+status\s*=\s*'active'\s*\)/i,
    'an ended link must not be re-activatable by the coach');
  assert.equal([...policies.values()].some((p) => /FOR (INSERT|DELETE|ALL)/i.test(p)), false,
    'links are created/deleted only through SECURITY DEFINER RPCs');
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
  assert.match(del[0], /USING\s*\(\s*assigned_by\s*=\s*\(select auth\.uid\(\)\)\s*\)/i);
  const sel = bodies.filter((p) => /FOR SELECT/i.test(p));
  assert.equal(sel.length, 1);
  assert.match(sel[0], /client_id\s*=\s*\(select auth\.uid\(\)\)/i, 'client must still read its own assignment');
  const upd = bodies.filter((p) => /FOR UPDATE/i.test(p));
  assert.equal(upd.length, 1);
  assert.match(upd[0], /USING\s*\(\s*assigned_by\s*=\s*\(select auth\.uid\(\)\)\s*\)/i);
  assert.match(upd[0], /is_coach_of\(client_id\)/);
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
