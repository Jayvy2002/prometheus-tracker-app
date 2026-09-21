# P4.3 — Prospect dans la messagerie

> Conversation après `coach_accepted`. Le prospect n’est pas un client Coaché.

## Droits

| État | Messages | `is_coach_of` | Dossier / photos / programme |
|---|---|---|---|
| `pending` | non | non | non |
| `coach_accepted` | oui (`prospect` / `reply`) | non | non |
| `athlete_confirmed` | oui (fil inchangé) | oui | selon la relation |

`marketplace_open_prospect(coach, client)` est vrai seulement pour une partie de la demande `coach_accepted`. Elle n’accorde pas `is_coach_of`.

## Fil

Même table `coach_messages`, clé `(coach_id, client_id)`. Pas de nouveau thread à l’activation.

## Migration

Candidate Git `20260921023720_p4_prospect_messaging`. Ne pas restamper `20260920014500`.
