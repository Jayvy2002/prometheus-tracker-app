import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const FACADE = resolve(process.cwd(), 'src/stores/coachingStore.ts');
const MODEL_DIR = resolve(process.cwd(), 'src/features/coaching/model');

/** Concatène la façade et les modules 21c — les verrous source lisent le store entier. */
export function coachingStoreSource(): string {
  const modules = readdirSync(MODEL_DIR)
    .filter((name) => name.endsWith('.ts'))
    .sort()
    .map((name) => readFileSync(resolve(MODEL_DIR, name), 'utf8'));
  return [readFileSync(FACADE, 'utf8'), ...modules].join('\n');
}
