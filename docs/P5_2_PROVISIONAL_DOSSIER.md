# P5.2 — Dossier provisoire d’un client sans compte

> Implémenté. Migration `20260922223000_p5_provisional_dossiers` en pending tant qu’elle n’est pas observée en production. Ne pas déclarer P5.2 clos avant le lock.

## Parcours

```text
Coach crée un dossier minimal
→ import CSV via le pipeline P5.1 (sujet = dossier)
→ invitation par e-mail (jeton montré une fois)
→ la personne crée ou connecte son compte
→ aperçu explicite des séances et pesées
→ confirmation des données, séparée du consentement de coaching
→ rattachement atomique au compte réel
→ le dossier ne sert plus
```

## Ce qui n’existe pas

- aucun faux compte Auth ;
- `coach_client_links` n’est pas utilisé pour représenter une personne sans compte ;
- aucune relation active avant `p_accept_coaching = true` ;
- aucune séance ni pesée réelle avant la confirmation ;
- le Coach ne peut pas importer dans le dossier d’un autre Coach.

## Sujet d’import

`coach_imports.subject_user_id` peut être nul. Exactement un des deux est renseigné : `subject_user_id` ou `provisional_dossier_id`.

`preview_coach_import(uuid, text, text, jsonb, text)` reste la signature accordée aux comptes. Le dossier passe par `preview_provisional_import`. Le commit reste `commit_coach_import` : il écrit dans les tables provisoires tant que le dossier n’est pas rattaché, et dans `workouts` / `weight_measurements` pour un vrai sujet.

## Rattachement

`confirm_provisional_claim` est serveur, atomique et idempotent pour le même compte. Un second appel ne copie pas une seconde fois. Un autre compte reçoit `invite_consumed`. Un e-mail de compte différent de l’invitation reçoit `invite_email_mismatch` sans voir les séances.

Une pesée déjà présente ce jour-là est ignorée et comptée. Elle n’est pas écrasée. Les séances sont copiées avec leur nom et leurs exercices en texte libre.

`activate_coaching_relationship` n’est appelée que si la personne coche le suivi. `already_coached`, `coach_unavailable` et `invalid_target` n’annulent pas le rattachement des données. Toute autre erreur annule toute la transaction.

Mutex `20014507` : une confirmation et un commit du même dossier se sérialisent. Après rattachement, le commit échoue avec `dossier_closed`.

## Provenance

`coach_provisional_claims` conserve le coach (`user:<uuid>`), l’e-mail, les comptes et le statut de coaching. Les identifiants provisoires restent dans les tables de rattachement même après suppression du staging.
