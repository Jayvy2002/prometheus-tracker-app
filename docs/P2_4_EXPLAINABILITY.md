# P2.4 — Explicabilité et correction

## Slice lecture (mergé `#191`, `b404281`)

Lecture seule : « Ce que Prometheus surveille ».

Aucun second moteur. Aucune auto-application. Observation = type + fingerprint
structuré + i18n. État actuel ≠ dernière décision humaine. Indisponible ≠ vide.

## Slice correction (mergé `#192`, `9b8a7ab`)

Écriture traçable : marquer une interprétation **non pertinente** ou **incorrecte**,
avec un motif humain obligatoire.

Réutilise les tables P2.1 / P2.3. Une RPC atomique
`correct_athlete_watch_context` clôt le signal ouvert en `not_relevant` et
append un journal `corrected`. Pas de nouvelle table. Pas de 14ᵉ Edge Function.
Les mesures sources (nutrition, séances, pesées, programmes) ne sont pas
réécrites.

Inventaire du moteur déjà actif : [P2.1](P2_1_ATHLETE_SIGNALS.md),
[P2.2](P2_2_WEEKLY_REVIEW.md), [P2.3](P2_3_DECISION_LOG.md).

## Audit

P2.1–P2.3 fournissent déjà :

- `athlete_signals` (hypothèse, preuves, statut, confiance qualitative) ;
- `athlete_weekly_reviews` (`aggregates`, `data_quality`, décision de revue) ;
- `athlete_decision_log` (`proposal`, `why`, `data_used`, `human_reason`,
  `applied_effect`, `actor_role`) ;
- `isProposalSuppressed` / `decisionEvidenceChanged` (kcal ±150, séances ±2).

`resolve_athlete_signal` seul ne suffisait pas : la revue suivante ré-upsertait
les types connus du moteur. D’où `isContextCorrectionHeld` + décision
`corrected`.

## Contrat de ce slice

```text
humain (Solo ou Coach actif) + motif
→ RPC atomique : resolve not_relevant + journal corrected
→ si le journal n’est pas créé : not_persisted (rollback du resolve)
→ rejeu identique (même action + même motif) : idempotent
→ rejeu différent : idempotency_conflict
→ token immuable : signal updated_at + fingerprint vus à l’écran
  sinon stale_context (n’écrase pas la nouvelle interprétation)
→ l’historique n’est pas effacé
→ la revue suivante n’ouvre pas le même (domaine, type)
  tant que les preuves n’ont pas changé
→ un refus de proposition n’est pas une correction :
  le signal reste ouvert, seule la proposition est retenue
→ Coaché (y compris Coach lui-même Coaché sur son dossier) : lecture seule
→ workspace UI n’accorde rien
→ succès UI seulement après persistance
```

- Composant unique `PrometheusWatchPanel` : dashboard personnel (Solo **et**
  Coaché) + fiche Coach.
- Permissions = ressource + relation + action :
  `canReadAthleteWatch` / `canCorrectAthleteWatchContext`.
- Le Coaché lit ; il ne récupère pas les droits de correction du Coach.
- Un Coach lui-même Coaché lit son dossier perso et celui de ses clients.
  Il corrige les dossiers clients, pas son propre dossier coaché.
- `data_used` du journal est reconstruit côté serveur depuis le fingerprint
  du signal (pas depuis un payload client).
- Pas de JSON brut, pas de score artificiel, pas d’auto-application.

## Surfaces

- Lecture inchangée : `listAthleteSignalsForWatch`,
  `listLatestAthleteDecisionsForWatch`,
  `listLatestAthleteWeeklyReviewForWatch` (`WatchQueryResult`).
- Écriture : `correctAthleteWatchContext` → RPC
  `correct_athlete_watch_context` uniquement.
- Le panneau n’appelle pas `upsert_athlete_signal`, `resolve_athlete_signal`
  ou `record_athlete_decision` directement.

Les wrappers `BestEffort` restent pour le moteur / la revue (fail-open).
Le panneau d’explicabilité ne les utilise pas.

## Hors scope

- modifier une donnée source (nutrition, séance, pesée) ;
- appliquer des cibles ou un programme depuis ce panneau
  (`commit_solo_weekly_review_decision` / `apply_intervention` restent les
  chemins d’effet durable). Aucune auto-application depuis Watch.

P2.5 (accepter / modifier / refuser la proposition courante) est livré :
[P2.5](P2_5_WATCH_PROPOSAL.md).

## Livraison

PR [#191](https://github.com/Jayvy2002/prometheus-tracker-app/pull/191) (lecture)
et [#192](https://github.com/Jayvy2002/prometheus-tracker-app/pull/192) (correction)
mergées dans `new-JV` (`9b8a7ab`). Migrations
`20260919134856_watch_context_correction` et
`20260919141146_watch_proposal_decision` appliquées en production le
19 septembre 2026 (lock **124**, pending **0**, aucun restamp).
