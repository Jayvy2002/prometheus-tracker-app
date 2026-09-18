import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const TYPE_FILES = [
  'src/lib/types.ts',
  'src/shared/types.ts',
  'src/features/workout/types.ts',
  'src/features/nutrition/types.ts',
  'src/features/programs/types.ts',
  'src/features/coaching/types.ts',
  'src/features/signals/types.ts',
] as const;

/** Concatène le baril et les modules 22a — les verrous source lisent les contrats entiers. */
export function typesSource(): string {
  return TYPE_FILES.map((rel) => readFileSync(resolve(process.cwd(), rel), 'utf8')).join('\n');
}
