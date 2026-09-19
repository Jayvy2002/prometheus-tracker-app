# Hotfix B — Autorité des primitives P2

> Contrat durable. Les écritures signaux / journal / outbox ne passent plus
> par le Data API. Les chemins métier existants restent les seules portes
> publiques.

## Finding

En production (lock **126**, 19 septembre 2026), `authenticated` avait
`EXECUTE` sur :

- `upsert_athlete_signal`
- `resolve_athlete_signal`
- `record_athlete_decision` (11 et 13 arguments)
- `enqueue_athlete_decision_outbox`
- `queue_and_record_athlete_decision`

`record_athlete_decision_replay` était déjà réservé à `service_role`.

Un Solo ou un Coach authentifié pouvait donc écrire un signal, un journal ou
une intention d’outbox **sans** passer par `save_athlete_weekly_review`,
`commit_solo_weekly_review_decision`, `apply_intervention`,
`correct_athlete_watch_context` ou `decide_athlete_watch_proposal`.

## Inventaire des call sites

| Primitive | Appels SQL DEFINER (conservés) | Data API / frontend |
|---|---|---|
| `upsert_athlete_signal` | `save_athlete_weekly_review` | aucun appel UI ; wrappers client retirés |
| `resolve_athlete_signal` | `save_athlete_weekly_review`, `correct_athlete_watch_context` | aucun appel UI ; wrappers client retirés |
| `record_athlete_decision` | `queue_and_record_athlete_decision` (via replay interne) | fallback client retiré |
| `enqueue_athlete_decision_outbox` | `queue_and_record_athlete_decision` | fallback client retiré |
| `queue_and_record_athlete_decision` | `commit_solo_weekly_review_decision`, `apply_intervention`, trigger `coach_intervention_queue_decision`, Watch (`correct` / `decide`) | duplicate Coach `journalInterventionDecision` retiré |

Chemins **inchangés** (toujours `authenticated`) :

- `save_athlete_weekly_review` (revue Solo/Coach, Edge `coach-fleet-round`)
- `commit_solo_weekly_review_decision` (carte Solo)
- `apply_intervention` + trigger d’inbox (Coach actif)
- `correct_athlete_watch_context` / `decide_athlete_watch_proposal` (Watch)
- `drain_athlete_decision_outbox` (worker de reprise client + Edge)

Le panneau Watch n’appelle toujours pas les cinq primitives. Watch n’applique
pas. Aucune auto-application.

## Garanties serveur

- `REVOKE ALL … FROM PUBLIC, anon, authenticated` sur les six signatures.
- `GRANT EXECUTE … TO service_role` uniquement (backend / replay).
- Corps d’autorisation inchangé : JWT + `is_coach_of` ; `auth.uid()` NULL
  reste le chemin service pour upsert/enqueue.
- Les RPC `SECURITY DEFINER` métier continuent d’appeler les primitives en
  tant que propriétaire.
- Candidate Git **`20260919214423_p2_primitive_authority`**. Ne pas restamper.
  Ne pas appliquer avant feu vert.

## Hors scope

Pas d’améliorations analytiques P2. Pas de P3.2 / P3.3 / P4. Pas de
réécriture Vision. Pas de 14ᵉ Edge Function. Tracking Solo canonique = chantier
suivant après close B.
