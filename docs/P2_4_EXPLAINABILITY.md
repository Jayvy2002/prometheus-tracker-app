# P2.4 — Explicabilité et correction

## Premier slice (cette PR)

Lecture seule : « Ce que Prometheus surveille ».

Aucun second moteur. Aucune table ni RPC nouvelle. Aucune auto-application.
Aucune écriture d’interprétation (la correction de contexte est la **suite**
du chantier, pas ce slice).

Inventaire du moteur déjà actif : [P2.1](P2_1_ATHLETE_SIGNALS.md),
[P2.2](P2_2_WEEKLY_REVIEW.md), [P2.3](P2_3_DECISION_LOG.md).

## Audit

P2.1–P2.3 fournissent déjà :

- `athlete_signals` (hypothèse, preuves, statut, confiance qualitative) ;
- `athlete_weekly_reviews` (`aggregates`, `data_quality`, décision de revue) ;
- `athlete_decision_log` (`proposal`, `why`, `data_used`, `human_reason`,
  `applied_effect`, `actor_role`) ;
- `isProposalSuppressed` / `decisionEvidenceChanged` (kcal ±150, séances ±2).

Un écran d’explicabilité n’a donc pas besoin de dupliquer ces faits. Il les
traduit.

## Contrat de ce slice

```text
signaux ouverts/waiting
+ dernières décisions par (domaine, type)
+ dernière revue
→ liste courte, textes FR/EN
→ divulgation progressive
→ proposition masquée si refus/ignore et preuves inchangées
→ proposition visible à nouveau si les preuves ont bougé
→ l’historique n’est jamais réécrit
```

- Composant unique `PrometheusWatchPanel` : dashboard personnel (Solo **et**
  Coaché) + fiche Coach.
- Permissions = ressource + relation + action :
  `canReadAthleteWatch` / `canCorrectAthleteWatchContext`.
- Le Coaché lit ; il ne récupère pas les droits de correction du Coach.
- Un Coach lui-même Coaché lit son dossier perso et celui de ses clients.
  Le workspace UI n’accorde rien.
- `canCorrectAthleteWatchContext` est encodé et testé, **non branché** dans
  l’UI de ce slice.
- Pas de JSON brut, pas de score artificiel.

## Surfaces lues (existantes)

- `listOpenAthleteSignalsBestEffort` / `listAthleteSignalsForWatchBestEffort`
- `listLatestAthleteDecisionsBestEffort`
- `listLatestAthleteWeeklyReviewBestEffort` (SELECT RLS, fail-open)

Aucune de ces lectures n’appelle `upsert_athlete_signal`,
`resolve_athlete_signal`, `record_athlete_decision`, `save_athlete_weekly_review`
ou `commit_solo_weekly_review_decision`.

## Hors scope (suite P2.4)

- corriger une interprétation / un contexte (écriture traçable) ;
- modifier une donnée source (nutrition, séance, pesée) ;
- accepter / modifier / refuser une proposition depuis ce panneau ;
- P2.5 et suivants.

## Livraison

Premier vertical slice dans une PR draft vers `new-JV`. Ne pas merger sans
feu vert. Ne pas enchaîner la correction de contexte.
