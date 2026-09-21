# P4.4 — Signalement / modération minimale

> File de signalement marketplace. Pas d’étoiles, pas de console admin, pas de fin de relation silencieuse.

## Contrat

| Surface | Règle |
|---|---|
| Signalement | `submit_marketplace_report` — membre authentifié, pas soi-même |
| Lecture | le reporter voit **ses** dossiers ; la cible ne voit pas l’identité du reporter |
| Revue | `review_marketplace_report` — `service_role` uniquement |
| Actions | `acknowledge` / `dismiss` / `resolve` / `suspend_directory` / `restore_directory`, journalisées |
| Annuaire | `directory_suspended` masque le profil publié et la shortlist matching |
| Relation | la suspension **ne** touche **pas** `coach_client_links` / `is_coach_of` |

États : `open → in_review → resolved | dismissed`.

Un Coach peut rester utilisable pour un client déjà actif pendant une retenue d’annuaire.

## Hors scope

- étoiles / avis Coach ;
- produit « bloquer » (VISION §31, distinct) ;
- console admin SPA (VISION §32 / P5.4) ;
- Stripe / paiement / commissions.

## Migration

Candidate Git `20260921024426_p4_marketplace_moderation`. Ne pas restamper `20260920014500`.
