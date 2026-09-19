# P2.4 — Explicabilité et correction de contexte

## Livré

Vision 8.4 / 8.5. Lecture seule : « Ce que Prometheus surveille » (`#191`, `b404281`)
puis correction traçable (`#192`, `9b8a7ab`).

Aucun second moteur. Aucune auto-application. Observation = type + fingerprint
structuré + i18n. État actuel ≠ dernière décision humaine. Indisponible ≠ vide.
Les mesures sources (nutrition, séances, pesées, programmes, cibles) ne sont
pas réécrites.

La correction (`corrected`) clôt le signal ouvert en `not_relevant`.
Un refus de proposition P2.5 n’est pas une correction : le signal reste ouvert.

## Contrat

- Composant unique `PrometheusWatchPanel`.
- Permissions = ressource + relation + action
  (`canReadAthleteWatch` / `canCorrectAthleteWatchContext`).
- Workspace UI n’accorde rien. Un Coaché ne corrige pas son propre dossier.
- Token vu à l’écran : `signal.updated_at` + fingerprint → `stale_context`.
- RPC `correct_athlete_watch_context` : `resolve_athlete_signal` + journal
  `corrected` dans la même TX. Pas de nouvelle table. Pas de 14ᵉ Edge Function.

## Hors scope

- modifier une donnée source ;
- appliquer des cibles ou un programme depuis ce panneau
  (`commit_solo_weekly_review_decision` et `apply_intervention` restent les chemins d’effet durable).

## Livraison

PR [#191](https://github.com/Jayvy2002/prometheus-tracker-app/pull/191) (lecture)
et [#192](https://github.com/Jayvy2002/prometheus-tracker-app/pull/192) (correction)
mergées dans `new-JV`. Migration `20260919134856_watch_context_correction`
appliquée en production le 19 septembre 2026 (lock **124**, aucun restamp).
