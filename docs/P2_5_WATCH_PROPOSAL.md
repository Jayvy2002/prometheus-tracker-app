# P2.5 — Décision humaine sur la proposition courante

## Livré

Vision 8.6 : accepter / modifier / refuser **la proposition courante** depuis
« Ce que Prometheus surveille ».

Aucun troisième moteur d’apply. Aucune auto-application. Le signal reste
ouvert. Les mesures sources (nutrition, séances, pesées, programmes, cibles)
ne sont pas réécrites par cette décision (`applied_effect = {}`).

La correction de contexte (P2.4, `corrected`) reste un autre acte : elle clôt
le signal. Un refus de proposition n’est pas une correction.

## Audit

P2.1–P2.4 fournissent déjà :

- la proposition courante (`reviewProposesFor` + signal `open` + non
  supprimée) ;
- le journal `athlete_decision_log` (`accepted` | `modified` | `refused` |
  `ignored` | `corrected`) ;
- Solo `commit_solo_weekly_review_decision` (effet calorie, carte ISO) ;
- Coach `apply_intervention` (effet programme / message).

Le snapshot P2.5 **réutilise** `proposeWeeklyNutrition` (fichier partagé
`weeklyNutritionProposal.ts` : Solo, fleet, Edge, revue). Il ne recalcule
pas une approximation parallèle.

## Contrat

```text
proposition courante = revue.decision propose
  + upsert open medium/high pour CE (domaine, type)
  + objet proposal = sérialisation du builder canonique
humain Solo (pas Coaché) ou Coach actif du dossier
→ accepted | modified | refused
→ motif obligatoire pour modified / refused (1–500)
→ applied_effect = {}
→ token immuable : review id + updated_at + proposal + evidence
  sinon stale_proposal
→ signal inchangé (reste open)
```

- `isWatchProposalSettled` empêche la revue suivante de `propose` tant
  que les preuves n’ont pas bougé.
- Un Coaché ne peut pas `save_athlete_weekly_review`.
- Le panneau n’appelle pas `commit_solo_weekly_review_decision` ni
  `apply_intervention` pour journaliser.

## Hors scope (P2.6)

- appliquer des cibles calories ou un programme depuis ce panneau ;
- réécrire une donnée source ;
- P2.7 et suivants.

## Livraison

PR [#192](https://github.com/Jayvy2002/prometheus-tracker-app/pull/192) mergée
dans `new-JV` (`9b8a7ab`). Migration `20260919141146_watch_proposal_decision`
appliquée en production le 19 septembre 2026 (lock **124**, aucun restamp).
