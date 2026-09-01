import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { latestFunctionBody } from './migrationSource';

/**
 * Contrat SQL ↔ TypeScript du dossier de tournée.
 *
 * Le 1er septembre, une migration a redéfini `triage_coach_fleet` à partir
 * d'une version périmée et a perdu 4 clés que le code lit toujours. La CI est
 * restée verte parce que les tests lisaient un nom de migration figé. Ce test
 * échoue si quelqu'un refait la même chose : tout ce qui est LU côté TypeScript
 * doit être PRODUIT par la dernière définition SQL.
 */

function source(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

/** Clés produites par les `jsonb_build_object` de la dernière définition SQL. */
function sqlProducedKeys(): Set<string> {
  const fn = latestFunctionBody('triage_coach_fleet');
  const body = fn.slice(fn.indexOf('RETURN QUERY'));
  return new Set([...body.matchAll(/'([a-z_]+)',\s/g)].map(m => m[1]));
}

/** Champs déclarés par l'interface `Dossier` du moteur de tournée. */
function dossierInterfaceKeys(engine: string): Set<string> {
  const start = engine.indexOf('export interface Dossier {');
  assert.ok(start >= 0, 'interface Dossier introuvable');
  const block = engine.slice(start, engine.indexOf('\n}', start));
  return new Set([...block.matchAll(/^\s{2}([a-z_]+)\??:/gm)].map(m => m[1]));
}

/** Champs réellement lus par le parseur (`dossierRaw.x`, `ev.x`, `row.x`). */
function parsedKeys(engine: string): Set<string> {
  const start = engine.indexOf('export function mapDossier(');
  const end = engine.indexOf('export function offGoal(');
  assert.ok(start >= 0 && end > start, 'parseur de dossier introuvable');
  const block = engine.slice(start, end);
  return new Set([...block.matchAll(/\b(?:dossierRaw|ev|row)\.([a-z_]+)\b/g)].map(m => m[1]));
}

test('chaque clé lue par le moteur de tournée est produite par le SQL', () => {
  const engine = source('supabase/functions/_shared/fleetEngine.ts');
  const produced = sqlProducedKeys();
  const read = new Set([...dossierInterfaceKeys(engine), ...parsedKeys(engine)]);
  assert.ok(read.size >= 30, `attendu ≥30 clés lues, vu ${read.size}`);
  const missing = [...read].filter(key => !produced.has(key)).sort();
  assert.deepEqual(missing, [], `clés lues mais jamais produites par le SQL : ${missing.join(', ')}`);
});

test('les 4 clés perdues le 1er septembre sont de nouveau produites', () => {
  const produced = sqlProducedKeys();
  for (const key of ['last_coach_message_at', 'last_keep_in_touch_at', 'pending_fleet', 'fleet_handled']) {
    assert.ok(produced.has(key), `clé absente du SQL : ${key}`);
  }
  // La CTE `program_frequency` du 1er septembre est un vrai apport : on la garde.
  const fn = latestFunctionBody('triage_coach_fleet');
  assert.match(fn, /program_frequency AS \(/);
  assert.match(fn, /COUNT\(DISTINCT pd\.weekday\)/);
  // Sans cette directive, PL/pgSQL prend `client_id` pour un paramètre OUT dans les CTE.
  assert.match(fn, /#variable_conflict use_column/);
  assert.match(fn, /REVOKE ALL ON FUNCTION public\.triage_coach_fleet\(uuid\) FROM PUBLIC, anon;/);
  assert.match(fn, /GRANT EXECUTE ON FUNCTION public\.triage_coach_fleet\(uuid\) TO authenticated, service_role;/);
});

test('les valeurs de garde-fou lues côté SQL ne sont pas des null silencieux', () => {
  const engine = source('supabase/functions/_shared/fleetEngine.ts');
  // idleDays(null) vaut +Infinity : sans ces clés, keep-in-touch et cooldown ne filtrent plus rien.
  assert.match(engine, /Number\.POSITIVE_INFINITY/);
  const keepInTouch = engine.slice(engine.indexOf('export function shouldOfferKeepInTouch('));
  assert.match(keepInTouch, /d\.last_coach_message_at/);
  assert.match(keepInTouch, /d\.last_keep_in_touch_at/);
  const plan = engine.slice(engine.indexOf('export function planWrite('));
  assert.match(plan, /d\.pending_fleet/);
  assert.match(plan, /d\.fleet_handled/);
});

test('le moteur de tournée reste pur : ni Deno, ni npm:, ni réseau', () => {
  const engine = source('supabase/functions/_shared/fleetEngine.ts');
  assert.doesNotMatch(engine, /\bDeno\./);
  assert.doesNotMatch(engine, /from "(npm:|jsr:|https:)/);
  assert.doesNotMatch(engine, /\bfetch\(/);
  assert.doesNotMatch(engine, /createClient/);
  const core = source('supabase/functions/_shared/coachAgentCore.ts');
  assert.doesNotMatch(core, /\bDeno\./);
  assert.doesNotMatch(core, /from "(npm:|jsr:|https:)/);
});
