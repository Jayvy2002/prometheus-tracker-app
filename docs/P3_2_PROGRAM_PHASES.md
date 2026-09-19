# P3.2 — Phases optionnelles

> Contrat durable. Un programme simple et un programme périodisé partagent le **même**
> moteur `programs` → `program_days` → prescriptions → workouts. Il n’existe pas de
> `mesocycles` / `program_cycles` / logger de phase.

## Modèle

```text
Program
→ session_organization (P3.1)
→ optional program_phases
→ program_days (session templates, phase_id nullable)
→ program_day_exercises
→ workouts (stamp at start)
```

`program_phases` :

| Champ | Rôle |
|---|---|
| `name` | 1–80 caractères |
| `order_index` | unique par programme |
| `duration_weeks` | 1–52 ou `NULL` |
| `description` | optionnelle |

Un programme **sans** lignes de phase reste un split classique. Deload / taper sont
des phases avec d’autres prescriptions, pas un moteur spécial.

## Exécution

Un seul logger : `start_workout_from_template`.

Au start, le workout reçoit `program_phase_id` + `prescribed_phase_name` depuis le
jour courant. Un changement futur de phase **ne réécrit pas** les séances déjà loggées.

La phase « actuelle » affichée est dérivée côté client :

- durées + `start_date` → marche des semaines (durée nulle = 1 ; dernière phase tient) ;
- sinon → phase de la prochaine séance.

## Calendrier / séquence

P3.1 inchangé. `planMarkForDate` n’invente un jour prévu qu’en `fixed_days`.
En `in_order`, seulement l’historique réel. La phase peut s’afficher sur une séance
planifiée ou loggée ; elle ne crée pas de dates.

## Snapshots E01

`snapshot_program_revision` enveloppe `{ session_organization, phases, days }`.
Les snapshots tableau historiques restent lisibles (zéro phase). Restaurer passe
par `save_program` (nouvelle révision, `p_phases` du snapshot).

## Permissions

Inchangées P1.2 : owner, leftover Coaché, Coach actif via relation, fail-closed.
`sync_program_phases` / `save_program` 8-arg / `create_program_complete` 8-arg
conservent `coached_client_cannot_edit_program`. Le workspace UI n’accorde rien.
`GRANT authenticated`, `REVOKE PUBLIC, anon`.

## UX

Le chemin principal ne mentionne pas les phases. Elles sont derrière
« Options avancées — phases (optionnel) ».

## Migration

Candidate Git `20260919225507_program_phases` (pending jusqu’à apply production).
Ne pas restamper. Ne pas appliquer avant merge CI verte. Pas de RPC
`apply_athlete_watch_minimum`. Versions / activation = P3.3.
