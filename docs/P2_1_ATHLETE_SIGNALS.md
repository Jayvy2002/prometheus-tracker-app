# P2.1 — Modèle de signaux persistants

## Audit

`coach_interventions` est une inbox de propositions Coach (`pending` / `sent` / `kept` /
`dismissed`) avec un `payload` d’action. Ce n’est pas une hypothèse suivie d’une semaine
à l’autre (`evidence_for` / `evidence_against`, `next_review_at`, confiance qualitative).

`solo_weekly_reviews` est **une** décision nutrition par couple `(user_id, week_start)`.
Pas de statut `waiting`, pas de domaines multiples, pas de réévaluation.

Une table dédiée n’est donc pas redondante.

## Contrat

```text
observation
→ hypothèse
→ preuves pour / contre
→ confiance qualitative (low | medium | high)
→ open | waiting | resolved | not_relevant
→ prochaine réévaluation
```

- Propriétaire : l’athlète (`athlete_id`).
- Lecture : l’athlète, ou un Coach avec relation **active** (`is_coach_of`).
- Écriture : RPC métier (`save_athlete_weekly_review`, Watch `correct`). Les primitives `upsert_athlete_signal` / `resolve_athlete_signal` ne sont plus exécutables via Data API (Hotfix B).
- Le workspace UI n’accorde aucun droit.
- L’IA prépare ; rien n’est auto-appliqué (pas d’écriture programmes, cibles, logs).
- Une fermeture conserve l’historique ; un nouvel `open` du même `(domain, type)` est une
  nouvelle ligne.

Domaines : `training`, `nutrition`, `recovery`, `weight`, `goal`, `adherence`.

## Hors scope

P2.3 journal des décisions humaines (même PR #190). P2.4 écran
« Ce que Prometheus surveille ». Fleet / `coach-agent` LLM. Stripe / P6.

## Livraison

PR [#190](https://github.com/Jayvy2002/prometheus-tracker-app/pull/190) mergée dans `new-JV`
(`c51d5f49`). Migration `20260918185709_athlete_signals` appliquée en production
le 19 septembre 2026 (lock **122**, `migrations.pending.json` vide).
