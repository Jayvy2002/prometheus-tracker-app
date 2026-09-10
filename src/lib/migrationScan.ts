import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export function migrationFiles(): string[] {
  const dir = resolve(process.cwd(), 'supabase/migrations');
  return readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
}

export function latestMigrationContaining(needle: string | RegExp): { file: string; sql: string } {
  const dir = resolve(process.cwd(), 'supabase/migrations');
  const files = migrationFiles();
  for (let i = files.length - 1; i >= 0; i--) {
    const sql = readFileSync(resolve(dir, files[i]), 'utf8');
    const hit = typeof needle === 'string' ? sql.includes(needle) : needle.test(sql);
    if (hit) return { file: files[i], sql };
  }
  throw new Error(`no migration contains ${String(needle)}`);
}

export function migrationsSql(): string {
  const dir = resolve(process.cwd(), 'supabase/migrations');
  return migrationFiles().map((f) => readFileSync(resolve(dir, f), 'utf8')).join('\n');
}
