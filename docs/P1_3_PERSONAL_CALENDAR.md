# P1.3 — Calendrier personnel pour Solo + Coaché

## Contrat

Lire son calendrier est un droit d’outil personnel, pas un déni de persona. Solo et Coaché
consultent passé et futur. Modifier le programme assigné reste interdit pour un Coaché
(`canUpdateOwnAssignedProgram` / RPC leftover). Le workspace UI n’accorde aucun droit.

## Câblage

- Route `/calendar` : `CoachTrackerRedirect` seulement (`canUsePersonalTools`).
- `canOpenPersonalCalendarRoute` = `canReadOwnCalendar` = outils personnels.
- Desktop Coaché : Calendrier dans la section Entraîner, à côté de Stats.
- Hub progression : carte Historique visible dès que la route est autorisée.
- Profil Coaché : lien Calendrier à côté de Stats.
- Jours futurs sélectionnables ; états prévu / commencé / réalisé inchangés (UX47).
- Un jour prévu n’ouvre pas l’éditeur de plan (`workoutId` absent → pas de navigation d’écriture).
- `/routines` reste derrière `CoachedAthleteRedirect`.

## Hors scope

Check-ins, habitudes, événements utiles et changements planifiés dans le calendrier (étape
suivante du chantier). P1.4 marketplace. Édition du plan Coach.
