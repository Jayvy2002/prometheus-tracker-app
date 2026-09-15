# Télémétrie produit — Prometheus

> Q07. L'analytics est **rattaché au compte** (`user_id`), jamais anonyme.
> Ce document est le contrat : schéma, règles, accès, conservation, suppression.

## Table

`public.product_events` (`supabase/migrations/20260905002127_product_events.sql`).

| Colonne | Contenu |
|---|---|
| `id` | uuid |
| `user_id` | compte auteur (ON DELETE CASCADE) |
| `role` | `coach` \| `client` \| `solo` au moment de l'événement |
| `event` | nom fermé (`ProductEventName`, `src/lib/types.ts`) |
| `props` | jsonb : ids, kinds, booléens, compteurs — **jamais** de nom, e-mail, texte libre |
| `created_at` | horodatage serveur |

Accès : **INSERT seul** depuis l'app (`insert_own_product_events`, `user_id = auth.uid()`).
Aucune lecture cliente. Lecture : SQL editor / service role (admin produit).

## Événements

| Événement | props | Usage produit |
|---|---|---|
| `screen_view` | `screen` | navigation réelle |
| `account_created` | `door`, `from_invite` | acquisition (portes coach/solo/invité) |
| `intake_completed` | `revisit`, `targets_computed`, `questionnaire_id`, `questionnaire_version` (ces deux derniers uniquement pour un questionnaire coach) | fin de questionnaire (AUCUN contenu d'intake, AUCUN signal santé) |
| `invite_created` | `days`, `max_uses` | invitations coach |
| `invite_accepted` | — | activation coaché |
| `coaching_request_accepted` | — | activation via l’annuaire |
| `intervention_resolved` | `kind`, `source`, `status`, `edited` | boucle coach (propose → valide) |
| `coach_message_sent` | `template_key` | relances (jamais le corps) |
| `client_reply_sent` | — | réponses client |
| `tracking_config_saved` | 4 modules bool | setup suivi |
| `nutrition_targets_set` | `calories` | écritures de cibles (cœur du produit) |
| `fleet_round_run` | `trigger`, `seen`, `flagged`, `skipped`, `failed` | tournée |
| `agent_asked` | `kind`, `screen`, `landed` | copilote (jamais le prompt) |
| `program_assigned` | `self` | attributions |
| `program_saved` | `days`, `weeks` | sauvegarde atomique d’un programme |
| `program_deleted` | — | suppression confirmée d’un programme |
| `program_adopted` | — | reprises inter-coachs |
| `workout_completed` | `from_program`, `from_routine`, `duration_seconds` | séances |
| `checkin_saved` | `with_notes` (bool, jamais le contenu) | check-ins |
| `solo_review_decided` | `action`, `reason`, `decision`, `from_kcal`, `to_kcal` | boucle solo |
| `solo_program_accepted` | `kind`, (`edited`) | programme vivant solo |
| `solo_program_dismissed` | `kind` | refus du programme solo |
| `solo_program_nl_asked` | `has_program` | édition NL |
| `setup_targets_choice` | `choice`, `wrote`, `had_existing` | setup (AUCUN signal médical) |

## Interdits absolus dans `props`

Réponses d'intake, drapeaux médicaux (PAR-Q, douleurs, blessures), notes de
check-in ou de coach, corps de messages, prompts agent, noms, e-mails, photos.
Un signal nécessaire au produit mais sensible (ex. accusé médical) reste un
**fait de dossier** (table métier + RLS), jamais un événement analytics.

## Conservation & suppression

- Pas de purge automatique aujourd'hui (volume faible ; à définir : 13 mois glissants).
- Suppression de compte : `user_id ON DELETE CASCADE` — les événements partent
  avec le compte, sans action supplémentaire. Vérifié par le test `auditOps`
  (FK cascade) — pas de purge manuelle à maintenir.
- Export utilisateur : journaux personnels (séances, nutrition, poids, check-ins,
  photos) ; les notes privées d'un coach et les brouillons d'intervention ne
  sont ni exportés ni transférés.

## Évolutions

Tout nouvel événement : nom ajouté d'abord à `ProductEventName`, props relues
contre la liste d'interdits, ligne ajoutée au tableau ci-dessus **dans le même
commit** (le test `auditOps` verrouille la parité).
