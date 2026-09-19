import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = (path: string) => readFileSync(path, 'utf8');

test('repository agent contract keeps one execution gate and an always-on Cursor rule', () => {
  const cursorRule = read('.cursor/rules/prometheus.mdc');
  const agents = read('AGENTS.md');
  const claude = read('CLAUDE.md');
  const chantier = read('docs/CHANTIER.md');

  assert.match(cursorRule, /alwaysApply:\s*true/);
  assert.match(cursorRule, /docs\/VISION\.md/);
  assert.match(cursorRule, /docs\/CHANTIER\.md/);
  assert.match(cursorRule, /CURRENT IMPLEMENTATION GATE/);
  assert.match(cursorRule, /STOP|stop and wait/i);

  assert.match(agents, /CURRENT IMPLEMENTATION GATE/);
  assert.match(claude, /CURRENT IMPLEMENTATION GATE/);
  assert.match(agents, /Do not merge|without explicit user approval/i);
  assert.match(claude, /avant merge|feu vert explicite/i);

  const gates = [...chantier.matchAll(/CURRENT IMPLEMENTATION GATE/g)];
  assert.equal(gates.length, 1, 'docs/CHANTIER.md must contain exactly one authoritative current-task gate');
  assert.match(chantier, /P2\.6 adapter le minimum nécessaire \(en cours\)/);
  assert.match(chantier, /n.enchaîne pas P2\.7/);
  assert.match(chantier, /pas d.auto-application|aucune auto-application/i);
  const gate = chantier.slice(
    chantier.indexOf('CURRENT IMPLEMENTATION GATE'),
    chantier.indexOf('CURRENT IMPLEMENTATION GATE') + 1300,
  );
  assert.doesNotMatch(gate, /ne commence P1\.5/);
  assert.doesNotMatch(gate, /n.enchaîne pas P2\.2/);
  assert.doesNotMatch(gate, /n.enchaîne pas P2\.3/);
  assert.doesNotMatch(gate, /n.enchaîne pas P2\.4/);
  assert.doesNotMatch(gate, /n.enchaîne pas P2\.5/);
  assert.doesNotMatch(gate, /n.enchaîne pas P2\.6/);
  assert.doesNotMatch(gate, /ne commence P2\.4/);
  assert.doesNotMatch(gate, /n.enchaîne pas la correction de contexte/);
});

test('complete product vision preserves the final non-negotiable decisions', () => {
  const vision = read('docs/VISION.md');

  const required: Array<[string, RegExp]> = [
    ['independent Coach capability', /Coach = capacité professionnelle indépendante|capacité Coach.*indépendante/i],
    ['no paused coaching relationship', /relation de coaching.*n.?a pas d.?état.*paused|n.?a pas d.?état de pause pour la relation/i],
    ['no global progression score', /Pas de score global/i],
    ['progress photos excluded from AI', /L’IA n’analyse jamais les photos de progression|photos de progression.*jamais analysées par IA/i],
    ['athlete final marketplace confirmation', /confirmation.*athlète|athlète confirme explicitement/i],
    ['software billing, coaching payment outside Prometheus', /facture le logiciel.*pas le coaching|paiement.*hors Prometheus/i],
    ['no full product export', /export complet.*n’est pas une fonctionnalité produit|aucun export complet produit/i],
    ['Solo trial 14 days', /Essai Solo\s*:\s*\*\*14 jours\*\*|Essai Solo.*14 jours/i],
    ['Coach grace 7 days', /Grâce.*Coach.*\*\*7 jours\*\*|Grâce Coach.*7 jours/i],
    ['weekly AI review', /revue hebdomadaire globale.*une fois par semaine|revue IA globale existe chaque semaine/i],
  ];

  for (const [label, pattern] of required) {
    assert.match(vision, pattern, `missing product decision: ${label}`);
  }
});
