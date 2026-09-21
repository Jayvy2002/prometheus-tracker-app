# P4.2 — Matching expliqué

> Shortlist éligible et compréhensible. Pas de pourcentage de compatibilité.

## Questionnaire

Exigences bloquantes : discipline, langue, format, **ville + pays** si présentiel/hybride (égalité normalisée, pas de sous-chaîne), budget **seulement** lorsqu’il est comparable.

Préférences importantes : fréquence de contact, style, autonomie, expérience.

Préférences secondaires : notes libres, non classantes.

## Disciplines

Valeurs retenues (SQL + TypeScript + FR/EN) :

- `strength` (musculation)
- `bodybuilding`
- `hypertrophy` (hypertrophie)
- `powerlifting`
- `general_fitness` (valeur historique conservée)

## Budget / tarif

Offre Coach : `indicative_price_cents` + `indicative_price_period` (`on_request` / `session` / `month` / `program`) + `indicative_price_currency` (**bêta : EUR / USD / CAD** ou vide).

Intention Athlète : `budget_max_cents` + `budget_period` + `budget_currency`.

`marketplace_listed_rate_decision` :

- informations manquantes ou période/devise différentes → `missing_information` (`price`), **pas** d’exclusion ;
- montant + période + devise comparables et tarif > budget → inéligible ;
- aucune devise universelle n’est inférée. Pas de `€` hardcodé dans la logique produit.

## Moteur

`explain_marketplace_matches()` (serveur) et `evaluateCoachMatch` (client) renvoient pour chaque Coach éligible :

- `eligible`
- `matched_requirements`
- `matched_preferences`
- `missing_information`
- `reasons`

L’annuaire reste parcourable librement. La shortlist se limite à **5** Coachs éligibles. Un ensemble vide reste vide.

`save_my_coach_profile` refuse `published` / `accepting_clients` si `coach_relationship_is_open` est faux (`coach_account_closed`). `explain_marketplace_matches` (P4.4) ne liste que `marketplace_coach_discoverable`.

## Migration

Candidate Git `20260921021923_p4_explained_matching`. Ne pas restamper `20260920014500`. Pas de paiement / Stripe.
