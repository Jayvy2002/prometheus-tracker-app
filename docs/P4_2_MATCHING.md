# P4.2 — Matching expliqué

> Shortlist éligible et compréhensible. Pas de pourcentage de compatibilité.

## Questionnaire

Exigences bloquantes : discipline, langue, format, zone si présentiel, budget maximal lorsqu’un tarif indicatif existe.

Préférences importantes : fréquence de contact, style, autonomie, expérience.

Préférences secondaires : notes libres, non classantes.

## Moteur

`explain_marketplace_matches()` (serveur) et `evaluateCoachMatch` (client) renvoient pour chaque Coach éligible :

- `eligible`
- `matched_requirements`
- `matched_preferences`
- `missing_information`
- `reasons`

Un tarif non renseigné avec un budget demandé = information manquante, pas une exclusion.

L’annuaire reste parcourable librement. La shortlist se limite à **5** Coachs éligibles. Un ensemble vide reste vide.

## Migration

Candidate Git `20260921021923_p4_explained_matching`. Ne pas restamper `20260920014500`. Pas de paiement / Stripe.
