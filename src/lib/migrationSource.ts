import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const MIGRATIONS_DIR = 'supabase/migrations';

/**
 * Dernière définition SQL qui gagne réellement en base.
 *
 * Les migrations s'appliquent par ordre de nom de fichier : lire un nom figé
 * laisse passer une régression introduite par une migration plus récente, ce
 * qui est exactement ce qui est arrivé à `triage_coach_fleet`.
 */
export function latestFunctionSource(functionName: string): { file: string; sql: string } {
  const dir = resolve(process.cwd(), MIGRATIONS_DIR);
  const needle = `CREATE OR REPLACE FUNCTION public.${functionName}`;
  const files = readdirSync(dir).filter(name => name.endsWith('.sql')).sort();
  for (let i = files.length - 1; i >= 0; i -= 1) {
    const sql = readFileSync(join(dir, files[i]), 'utf8');
    if (sql.includes(needle)) {
      return { file: `${MIGRATIONS_DIR}/${files[i]}`, sql };
    }
  }
  throw new Error(`no migration defines ${functionName}`);
}

/** Le corps de la dernière définition, sans les migrations plus anciennes du même fichier. */
export function latestFunctionBody(functionName: string): string {
  const { sql } = latestFunctionSource(functionName);
  return sql.slice(sql.lastIndexOf(`CREATE OR REPLACE FUNCTION public.${functionName}`));
}
