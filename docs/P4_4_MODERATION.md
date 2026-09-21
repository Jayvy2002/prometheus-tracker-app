# P4.4 — Signalement / modération minimale

> File de signalement marketplace. Pas d’étoiles, pas de console admin, pas de fin de relation silencieuse.

## Contrat

| Surface | Règle |
|---|---|
| Signalement | `submit_marketplace_report` — membre authentifié, pas soi-même |
| Lecture | le reporter voit **ses** dossiers ; la cible ne voit pas l’identité du reporter |
| Revue | `review_marketplace_report` — `service_role` uniquement |
| Actions | `acknowledge` / `dismiss` / `resolve` / `suspend_directory` / `restore_directory`, journalisées |
| Annuaire | `marketplace_coach_discoverable` (capability Coach, lifecycle P3 ouvert, published, `NOT directory_suspended`) |
| Nouvelle demande | `request_coaching` prend `lock_coach_relationship_lifecycle` (ordre P3), revalide `marketplace_coach_discoverable`, échoue `coach_unavailable` sinon |
| Hold | `directory_hold_active` par report ; mutations sérialisées par `target_user_id` (classe 20014503) ; `directory_suspended` = OR des holds actifs |
| Audit | `reporter_id` / `target_user_id` SET NULL ; `reporter_ref` / `target_ref` durables ; actions `ON DELETE RESTRICT` |
| Prospect déjà ouvert | une demande `pending` / `coach_accepted` existante **peut** continuer (messages, accept, confirm) — compatible avec le hold d’annuaire, pas une nouvelle acquisition |
| Relation | la suspension **ne** touche **pas** `coach_client_links` / `is_coach_of` |
| Provenance | `marketplace_moderation_actions.actor` et `coach_qualifications.reviewer_ref` = `marketplace_audit_actor()` (`user:<uid>` ou `role:service_role`). Jamais `CURRENT_USER` DEFINER, jamais un id client |

`directory_suspended` n’est **pas** injecté dans `marketplace_coach_eligible`, pour ne pas bloquer la confirmation d’un prospect déjà ouvert.

États : `open → in_review → resolved | dismissed`.

Un Coach peut rester utilisable pour un client déjà actif pendant une retenue d’annuaire.

## Hors scope

- étoiles / avis Coach ;
- produit « bloquer » (VISION §31, distinct) ;
- console admin SPA (VISION §32 / P5.4) ;
- Stripe / paiement / commissions.

## Migration

Appliqué en production : `20260921024426_p4_marketplace_moderation` (lock **134**, pending vide, timestamp Git, 79 statements, `created_by` null). Ne pas restamper `20260920014500` ni `20260921024426`.
