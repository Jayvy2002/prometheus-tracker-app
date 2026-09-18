# P1.3 — Calendrier personnel pour Solo + Coaché

## Contrat

Lire son calendrier est un droit d’outil personnel, pas un déni de persona. Solo et Coaché
consultent passé et futur. Modifier le programme assigné reste interdit pour un Coaché
(`canUpdateOwnAssignedProgram` / RPC leftover). Le workspace UI n’accorde aucun droit.

## Vérité temporelle du plan

`planMarkForDate` n’invente un jour **prévu** que dans la fenêtre prescrite :

- à partir de `start_date` ;
- jusqu’à `start_date + duration_weeks * 7` (exclu) ;
- si l’attribution est `paused` / `completed`, pas après le jour civil de `updated_at`
  (fin de relation / fin d’attribution).

Les séances **commencées / terminées** déjà loggées restent visibles, y compris hors fenêtre.
Un programme de 8 semaines ne génère donc plus de « prévu » au 9ᵉ semaine. Une attribution
paused (ex. `transition_client_to_solo`) reste lisible dans l’historique et n’affiche plus
de séances prévues dans le futur.

## Câblage

- Route `/calendar` : `CoachTrackerRedirect` seulement (`canUsePersonalTools`).
- `canOpenPersonalCalendarRoute` = `canReadOwnCalendar` = outils personnels.
- Desktop Coaché : Calendrier dans la section Entraîner, à côté de Stats.
- Hub progression : carte Historique visible dès que la route est autorisée.
- Profil Coaché : lien Calendrier à côté de Stats.
- Jours futurs sélectionnables ; états prévu / commencé / réalisé (UX47) avec la fenêtre ci-dessus.
- Un jour prévu n’ouvre pas l’éditeur de plan (`workoutId` absent → pas de navigation d’écriture).
- `/routines` reste derrière `CoachedAthleteRedirect`.

## Hors scope

Check-ins, habitudes, événements utiles et changements planifiés dans le calendrier (étape
suivante du chantier). P1.4 marketplace (clôturé). Édition du plan Coach.

## Livraison

PR [#187](https://github.com/Jayvy2002/prometheus-tracker-app/pull/187) mergée dans `new-JV`
(`e171b3268e304fc09367b3504e3d43d0146645c1`). Libellé carte prévue humanisé :
FR `Séance prévue. Elle n’a pas encore été commencée.` /
EN `Scheduled workout. It hasn't been started yet.`
