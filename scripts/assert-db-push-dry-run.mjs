#!/usr/bin/env node
/**
 * `supabase db push --dry-run` ne doit proposer aucune ancienne migration.
 * Unique pending acceptable : aucune (prod à jour) .
 */
import { readFileSync } from 'node:fs';

const allowed = JSON.parse(readFileSync('supabase/migrations.pending.json', 'utf8')).pending.map(row => row.version);
const text = readFileSync(process.argv[2] || '/dev/stdin', 'utf8');
const lower = text.toLowerCase();

if (/remote database is up to date/i.test(text) || /no new migrations/i.test(lower)) {
  console.log('db push --dry-run: aucune migration à pousser');
  process.exit(0);
}

const pending = [...text.matchAll(/\b(20\d{12})\b/g)].map((m) => m[1]);
const unique = [...new Set(pending)];
if (!unique.length) {
  // CLI parfois n'imprime que le SQL preview. Refuser si ça ressemble à un apply.
  if (/would push|pending|applying migration/i.test(text)) {
    console.error('dry-run illisible (pending sans version):\n', text.slice(0, 1200));
    process.exit(1);
  }
  console.log('db push --dry-run: aucune version pending détectée');
  process.exit(0);
}

if (unique.every(version => allowed.includes(version))) {
  console.log('db push --dry-run: only explicitly pending migrations:', unique.join(', '));
  process.exit(0);
}
console.error('db push --dry-run proposerait encore des migrations:', unique.join(', '));
console.error(text.slice(0, 2000));
process.exit(1);
