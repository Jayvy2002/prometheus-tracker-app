# P1.1 — Capacité Coach indépendante

## Contrat et sources

`user_capabilities(user_id, 'coach')` est la source serveur de la capacité professionnelle.
`coach_client_links` actif détermine l'état personnel Solo/Coaché. `get_my_account_context`
lit les deux axes dans un snapshot limité au compte authentifié. Le workspace reste une
préférence UI, sans effet sur les grants, RLS ou RPC.

La capacité appartient au domaine compte ; les données personnelles restent propriété de
l'athlète. Le Coach lit/modifie les ressources autorisées par leur ownership et la relation
active. L'activation professionnelle n'autorise ni lecture d'un autre dossier ni modification
de son propre plan coaché. Les primitives existantes sont réutilisées, sans nouveau moteur.

## Inventaire des usages legacy (baseline 90e977d)

- **Autorisation** : `coach-fleet-round`, `_shared/coachAgent`, dernière définition de
  `triage_coach_fleet`, policy `questionnaire_versions_create_owner`,
  `assign_questionnaire_complements`. Migrés vers la capacité serveur ; l'accès personnel
  de l'agent et `is_self_coach` dépend de l'absence de lien actif, y compris pour un Coach.
- **Navigation** : `accountContext`, `useAccountContext`, gardes de routes,
  `ProgramsPage`, `ProgramEditorPage`, `ClientsPage`, `ClientSetupPage`,
  `InterventionDraftPage`. La capacité du snapshot fait foi. `useAuthenticatedSession`
  conserve le rôle comme indice historique d'intention initiale (skip onboarding),
  jamais comme autorisation serveur.
- **Affichage** : helpers `coachRole` utilisés par workout, routines, check-in, nutrition,
  dashboard, objectifs et onboarding ; le lien personnel n'est plus ignoré pour un Coach.
  `AssignedQuestionnaireProvider`, `SoloWeeklyReview`, `KinesiologyIntakeFlow` retirent
  leurs exclusions professionnelles. Le toggle du profil est accessible au Coaché.
  `telemetryRole` reste une classification analytique historique à trois valeurs ; aucun droit.
- **Compatibilité historique** : type `CoachingRole`, clés de rôle mémorisé/intention,
  `readAccountRole` (fallback seulement si RPC absent), `set_coaching_role`,
  `choose_account_intent`, trigger `sync_legacy_coach_capability`, projections dans
  acceptation d'invitation / activation marketplace / fin de relation.
  Une écriture privilégiée legacy `coach` peut toujours activer pour les anciens parcours.
  Une mutation vers `client`/`none` ne révoque plus la capacité. La désactivation explicite
  passe par `set_coach_capability(false)` et refuse un roster actif.
- **Logique métier** : `roleSlice` lit/persiste le snapshot confirmé, `clientsSlice` conserve
  la capacité à la fin du lien personnel, `trackingSlice` applique les modules de la relation,
  `realtimeSlice` et `messagesSlice` choisissent le flux du workspace. Les compteurs/messages
  personnels et professionnels sont séparés à la sélection du workspace.
- **SQL historique** : les anciennes définitions restent immuables. Les derniers corps
  actifs ont été inspectés, dont `upsert_coach_intervention`, `activate_coaching_relationship`
  et `transition_client_to_solo`. Le garde legacy redondant de l'upsert est remplacé par
  le garde relationnel existant. Le trigger historique de notification d'onboarding conserve
  son filtre legacy (dette du chantier IA, pas une permission interactive).
- **Fixtures/tests** : les écritures privilégiées de rôles dans les fixtures existantes
  restent compatibles ; les nouvelles preuves exercent la RPC authentifiée et une capacité
  présente avec un rôle legacy différent.

## Migration et exploitation

Migration append-only créée par CLI : `20260917235400_independent_coach_capability.sql`.
Aucune migration historique modifiée. Aucun déploiement production dans cette PR.
La migration conserve les grants existants sur les fonctions remplacées et protège la
nouvelle RPC par `auth.uid()`, `search_path` vide et EXECUTE authenticated uniquement.
Le verrou utilisateur sérialise les changements avec les transitions personnelles.

`schema_migrations.lock.json` reste le constat production (112 versions).
`migrations.pending.json` déclare séparément la migration candidate. Les vérificateurs
exigent le baseline complet et n'acceptent que les versions candidates explicites, uniques
et postérieures. Le replay local exige baseline + candidats. Après un déploiement autorisé,
rafraîchir le lock avec l'état observé et retirer la ligne pending correspondante.

Les changements Edge (`coach-agent`/`ask-second` via shared, `coach-fleet-round`) nécessiteront
un déploiement explicite après approbation. Le lock Edge n'est pas falsifié pour la PR.
Rollback : migration corrective append-only ; ne pas supprimer une capacité acquise par
un Coach lui-même Coaché. Les anciens clients utilisent toujours l'adaptateur legacy.

## Réseau et preuves

L'activation est online et n'affiche un succès qu'après le snapshot de la RPC persistée.
Une erreur/absence de contexte ne peut pas donner la capacité depuis une préférence UI.
Le snapshot périmé d'un autre compte est ignoré. Les séances offline existantes restent
inchangées. Aucun nouveau texte produit, FR/EN existants conservés.

Tests : matrice de contexte exhaustive (capacité × lien × rôle legacy × workspace), SQL
`independent_coach_capability.sql`, tests de départ/consentement/RLS existants, parcours
`test-coach-capability-browser.mjs` (quatre combinaisons, activation depuis Coaché, switch,
roster et départ). Résultats finaux et CI : voir `CHANTIER.md`.

Hors scope : P1.2 permissions générales, P1.3 calendrier Coaché, P1.4 confirmation marketplace,
P1.5 durées commerciales, refonte IA et facturation.
