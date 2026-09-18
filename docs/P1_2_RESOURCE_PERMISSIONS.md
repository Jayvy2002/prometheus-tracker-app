# P1.2 — Permissions par ressource / action

## Contrat

Une permission répond à : qui possède la ressource, qui agit, quelle relation existe,
quelle action est demandée. Le workspace Personnel / Coaching reste une préférence d’affichage
et n’accorde aucun droit. Solo / Coaché est l’état personnel ; Coach est une capacité
indépendante.

Module : `src/features/account/domain/resourcePermissions.ts`.
Les gardes de routes et les écrans personnels consultent ces décisions. RLS / RPC restent
la source de vérité serveur.

## Décisions normalisées

| Action | Solo | Coaché | Coach + Solo | Coach + Coaché |
|---|---|---|---|---|
| Lire son historique | oui | oui | oui (espace perso) | oui (espace perso) |
| Logger sa séance | oui | oui (module tracking) | oui | oui |
| Modifier ses données personnelles | oui | oui, hors cibles Coach | oui | oui, hors cibles Coach |
| Lire le programme assigné | oui (soi) | oui (soi) | soi ; client si relation active | soi ; client si relation active |
| Modifier le programme assigné | oui (plan perso) | non | oui (plan perso) | non (son plan coaché) |
| Proposer un changement de plan | n/a (il édite) | oui | n/a | oui (son plan coaché) |
| Lire / éditer un dossier client | non | non | oui si relation active, jamais soi-même | oui si relation active, jamais soi-même |

Le Coach qui est lui-même Coaché gère ses clients dans l’espace Coaching et consulte
son propre plan en lecture dans l’espace Personnel.

## Câblage UI

- `/stats` n’est plus bloqué par la persona Coaché (`CoachTrackerRedirect` = outils personnels).
- Navigation desktop Coaché : Stats à côté de la progression. Calendrier volontairement absent.
- Hub progression et profil Coaché : lien Stats. Calendrier toujours masqué (P1.3).
- `/calendar` et `/routines` restent derrière `CoachedAthleteRedirect` jusqu’à P1.3.
- Programme assigné : édition seulement si `canUpdateOwnAssignedProgram` ; sinon lecture +
  proposition existante (Ask → message Coach).
- `canReadAssignedProgram(actor, resource)` / `canUpdateAssignedProgram(actor, resource)` :
  un Coach n’obtient le droit sur un client que si `hasActiveRelationship === true`
  (absent ou false → refus). `canReadOwnAssignedProgram` / `canUpdateOwnAssignedProgram`
  restent les raccourcis pour le plan personnel.
- Dossier client : `CoachOnly` = capacité ; `ActiveRelationshipBoundary` = relation active.
- Roster Coaching : uniquement `coach_id = acteur` et jamais soi-même (`canReadClientDossier`). Un Coach lui-même Coaché ne se voit plus dans sa liste clients.

## Serveur

- `save_program` refuse le non-propriétaire **et** refuse un Coaché qui possède encore son plan Solo assigné
  (`Coached client cannot edit assigned program`).
- Les RPC legacy `sync_program_days` / `save_program_day_exercises`, les RLS owner de
  `programs` / `program_days` / `program_day_exercises`, et les writes Data API de
  `program_assignments` partagent le même verrou leftover (`coached_client_cannot_edit_program`,
  `actor_is_actively_coached`). Un Coach lui-même Coaché continue d’écrire les plans de ses
  clients actifs. Migrations appliquées en production :
  `20260918102103_save_program_coached_owner` et
  `20260918103748_program_write_coached_owner`.
  `schema_migrations.lock.json` reflète cet état observé (115 versions) ;
  `migrations.pending.json` est vide.
- `assign_program_secure` refuse l’auto-attribution d’un Coaché.
- `protect_coach_nutrition_targets` conserve kcal / macros / eau / pas.
- `is_self_coach` / `is_coach_of` : pas de dossier sur soi-même ; accès relationnel.

TrackingGate reste un overlay de modules de la relation, pas un déni de persona.

Après merge de la PR [#185](https://github.com/Jayvy2002/prometheus-tracker-app/pull/185), la production a été vérifiée directement : les deux versions P1.2 sont présentes, les helpers plpgsql `actor_is_actively_coached` / `coached_client_cannot_edit_program` / `actor_owns_program` existent en `SECURITY DEFINER`, et `save_program` / `sync_program_days` / `save_program_day_exercises` conservent le RAISE leftover. Les locks ont été synchronisés sur cet état observé.

## Hors scope

P1.3 calendrier Coaché, P1.4 confirmation marketplace, P1.5 durées commerciales,
refonte IA, facturation. P1.2 est clôturé ; aucun P1.3 sans feu vert explicite.
