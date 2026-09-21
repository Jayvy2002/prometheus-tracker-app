# P4.3 — Prospect dans la messagerie

> Conversation dès une demande `pending` valide. Le prospect n’est pas un client Coaché.

## Flow Vision

```text
athlète initie
→ pending + conversation prospect
→ Coach accepte de poursuivre (coach_accepted) + même conversation
→ athlète confirme (athlete_confirmed)
→ même fil + relation active
```

## Droits

| État | Messages | `is_coach_of` | Dossier / photos / programme |
|---|---|---|---|
| `pending` | oui (`prospect` / `reply`) | non | non |
| `coach_accepted` | oui (`prospect` / `reply`) | non | non |
| `athlete_confirmed` | oui (fil inchangé) | oui | selon la relation |

`marketplace_open_prospect(coach, client)` est vrai pour une partie d’une demande `pending` **ou** `coach_accepted`. Elle n’accorde pas `is_coach_of`.

## Snapshot prospect

Colonne `prospect_snapshot` sur `coach_join_requests`, normalisée par `marketplace_prospect_snapshot`. Clés consenties uniquement :

`objective`, `level`, `discipline`, `language`, `expectations`, `availability`, `constraints`, `budget`, `summary`.

Ce n’est **pas** le questionnaire complet, le profil privé, ni les données live. `request_coaching(..., p_snapshot jsonb)` ; la signature 5 arguments délègue avec `{summary}`.

## Fil

Même table `coach_messages`, clé `(coach_id, client_id)`. Pas de nouveau thread à l’activation.

## Migration

Candidate Git `20260921023720_p4_prospect_messaging`. Ne pas restamper `20260920014500`.
