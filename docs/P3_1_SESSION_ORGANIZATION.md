# P3.1 — Organisation des séances

> Contrat durable. Un programme simple et un programme avancé partagent le **même** moteur
> `programs` → `program_days` → `program_day_exercises` → workouts. Il n’existe pas de
> `calendar_programs` / `sequence_programs`.

## Modes

`programs.session_organization` :

| Valeur | UI | Comportement |
|---|---|---|
| `fixed_days` | Jours fixes | La séance est liée à un `weekday` 0–6. Unique `(program_id, weekday)` si renseigné. |
| `in_order` | Dans l’ordre | La prochaine séance est la suivante dans `order_index` (A→B→C, wrap). `weekday` est `NULL`. |

Legacy : `DEFAULT 'fixed_days'`. Les programmes existants ne sont pas réinterprétés.

UI : « Organisation des séances » — pas de jargon `sequence_mode` / `weekday_mode`.

## Exécution

Un seul logger : `startWorkoutFromTemplate` avec `program_day_id` + `program_assignment_id`.

- `fixed_days` : `pickNextTrainingDay` par jour de semaine (comportement historique).
- `in_order` : `pickNextInOrder` à partir du dernier workout **complété** lié à un `program_day_id` de l’attribution. S’entraîner mercredi après un lundi A donne B, pas un « raté » de mardi.

L’historique est le workout réel. Le planning prescrit n’est jamais falsifié pour coller à l’exécution.

## Calendrier

`planMarkForDate` n’invente un jour **prévu** que si `fixed_days` **et** la fenêtre P1.3
(`start_date` + `duration_weeks`). En `in_order`, seules les séances réellement
commencées / terminées apparaissent. Prometheus n’attribue pas « mardi prochain » à
une estimation.

## Snapshots E01

`snapshot_program_revision` enveloppe `{ session_organization, days }`. Les snapshots
historiques tableau restent lisibles (`fixed_days`). Restaurer passe par `save_program`
(nouvelle révision). Les workouts ne sont pas réécrits.

## Permissions

Inchangées P1.2 : owner, leftover Coaché, Coach actif via relation, fail-closed.
`save_program` / `sync_program_days` / `create_program_complete` conservent
`coached_client_cannot_edit_program`. Le workspace UI n’accorde rien.

## Migration

Appliquée en production le 19 septembre 2026 : `20260919194159_program_session_organization`
(lock **125**, pending vide, **même timestamp Git**). Ne pas appliquer `20260919181919`.
Pas de RPC `apply_athlete_watch_minimum`.
