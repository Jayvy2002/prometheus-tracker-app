// Lot 17b — découvre tous les src/**/*.test.ts et les lance.
// Ne pas revenir à une liste manuelle dans package.json : un test hors liste
// n'était jamais exécuté (ARCH09).
import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

const SRC = join(process.cwd(), 'src');

function collectTestFiles(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) collectTestFiles(full, out);
    else if (entry.name.endsWith('.test.ts')) out.push(full);
  }
  return out;
}

const files = collectTestFiles(SRC).sort();
if (files.length === 0) {
  console.error('run-unit-tests: aucun src/**/*.test.ts trouvé');
  process.exit(1);
}

console.log(`run-unit-tests: ${files.length} fichier(s) src/**/*.test.ts`);
const result = spawnSync(process.execPath, ['--import', 'tsx', '--test', ...files], {
  stdio: 'inherit',
  env: process.env,
});

if (result.error) {
  console.error(result.error);
  process.exit(1);
}
process.exit(result.status === null ? 1 : result.status);
