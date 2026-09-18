import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const applied: Array<{ version: string }> = JSON.parse(readFileSync('supabase/schema_migrations.lock.json', 'utf8')).applied;
const pending: Array<{ version: string }> = JSON.parse(readFileSync('supabase/migrations.pending.json', 'utf8')).pending;
function accepted(script: string, input: string): boolean {
  const dir = mkdtempSync(join(tmpdir(), 'p11-migrations-'));
  try {
    const file = join(dir, 'proof.txt');
    writeFileSync(file, input);
    return spawnSync(process.execPath, ['scripts/' + script, file], { encoding: 'utf8' }).status === 0;
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

test('migration list allows reviewed candidates but rejects production drift and missing history', () => {
  const baseline = applied.map(row => `${row.version} | ${row.version}`);
  const candidate = pending.map(row => `${row.version} | `);
  const complete = [...baseline, ...candidate];
  assert.equal(accepted('assert-migration-list.mjs', complete.join('\n')), true);
  assert.equal(accepted('assert-migration-list.mjs', complete.slice(1).join('\n')), false);
  assert.equal(accepted('assert-migration-list.mjs', [...complete, '20990101000000 | '].join('\n')), false);
  assert.equal(accepted('assert-migration-list.mjs', complete.join('\n').replace(`${applied[0].version} | ${applied[0].version}`, `${applied[0].version} | 20000101000000`)), false);
});

test('dry-run never accepts replaying an applied migration or an undeclared candidate', () => {
  assert.equal(accepted('assert-db-push-dry-run.mjs', 'Remote database is up to date'), true);
  assert.equal(accepted('assert-db-push-dry-run.mjs', 'Would push: ' + pending.map(row => row.version).join('\n')), true);
  assert.equal(accepted('assert-db-push-dry-run.mjs', 'Would push: ' + applied[0].version), false);
  assert.equal(accepted('assert-db-push-dry-run.mjs', 'Would push: 20990101000000'), false);
});
