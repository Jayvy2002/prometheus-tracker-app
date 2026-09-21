# Chantier — Prometheus

> **SOURCE DE VÉRITÉ DU TRAVAIL RESTANT**
>
> Ce document décrit l’ordre d’exécution, les écarts entre le produit actuel et `docs/VISION.md`, les critères de fin et les dépendances.
>
> Git conserve l’historique. Ce fichier ne doit pas devenir un journal de PR ni une accumulation de lots obsolètes.
>
> **Règle agents :** ne pas reconstruire ce qui existe déjà. Avant chaque chantier, inspecter le code/migrations actuels et vérifier si le problème est réellement fonctionnel, architectural ou simplement non raccordé.

**Mis à jour : 21 septembre 2026.**

---

# 0. État général

Prometheus dispose déjà d’un socle important :

- moteur de séances ;
- programmes avec révisions ;
- nutrition ;
- check-ins ;
- dashboard personnel ;
- console Coach ;
- messagerie ;
- offline séance ;
- marketplace de base ;
- questionnaires ;
- tracking configurable ;
- IA hebdomadaire partielle ;
- RLS et RPC métier importantes.

Le travail restant n’est pas une reconstruction. Le principal enjeu est désormais de **faire converger les contrats métier et l’architecture vers la Vision de référence**.

> **CURRENT IMPLEMENTATION GATE — P4 revue pré-production en correction (P4.1–P4.4).** Candidates `20260921021231`, `20260921021923`, `20260921023720`, `20260921024426`. Production/lock **130** (`20260920014500_p3_hardening`). **Ne pas merger. Ne pas appliquer. Ne pas commencer P5.** Watch n’applique pas.
>
> Watch reste une surface d’observation, d’explicabilité, de correction de contexte et de décision humaine. Accepter, modifier ou refuser depuis Watch n’applique pas automatiquement une cible ou un programme. `commit_solo_weekly_review_decision` et `apply_intervention` restent les chemins d’effet durable. Aucune auto-application. Aucune réécriture des mesures sources. **Ce bloc est l’unique pointeur de “prochaine tâche” à maintenir.** Les autres documents doivent le lire plutôt que dupliquer un numéro de chantier.

## Protocole d’exécution obligatoire

À partir de ce baseline, l’agent travaille **par sous-chantier séquentiel**, jamais en implémentation massive parallèle.

1. partir du dernier `new-JV` vert ;
2. créer une branche dédiée nommée `agent/pX-Y-description-courte` ;
3. inspecter l’existant avant de créer une nouvelle primitive ;
4. implémenter une seule capacité cohérente ;
5. ajouter/adapter les tests nécessaires ;
6. mettre à jour ce fichier avec le statut et les preuves durables ;
7. ouvrir une PR vers `new-JV` ;
8. attendre que les checks pertinents soient verts ;
9. faire une revue finale du diff ;
10. **s’arrêter et attendre le feu vert de Jean-Vincent avant merge et avant toute sous-tâche suivante.**

**Interdit :** pousser directement une fonctionnalité sur `new-JV`, lancer plusieurs migrations concurrentes sur le même contrat, commencer P2/P3 sur une primitive P1 encore en transition, ou modifier la Vision pour simplifier une implémentation.

Le template `.github/pull_request_template.md` fait partie de la Definition of Done.

## Priorités globales

| Priorité | Chantier | Statut | But |
|---|---|---|---|
| **P0** | Stabilité dépôt | **Opérationnel** — CI verte ; protection GitHub native recommandée | Baseline fiable + protocole PR |
| **P1** | Identité, capacités, permissions, lifecycle | **P1.1–P1.5 + Hotfix A actifs en production** (128 migrations) | Faire correspondre le modèle métier à la Vision |
| **P2** | Cerveau Prometheus | **P2.1–P2.5 + Hotfix B actifs en production** (128 migrations) | Unifier revue hebdo + signaux + mémoire + décisions |
| **P3** | Planification avancée | **P3.1–P3.3 + hardening clos (130)** | Clos |
| **P4** | Marketplace complète | **P4.1–P4.4 en correction pré-production — ne pas merger/appliquer** | Qualifications, matching, prospect, signalement |
| **P5** | Adoption Coach | À faire — **ne pas commencer** | Imports, bibliothèque exercices, admin ciblé |
| **P6** | Bêta économique | À faire après entitlements P1 | Entitlements, essais, grâce, mesure coûts |
| **P7** | Intégrations et polish | Dernier | Health/wearables, offline secondaire, E2E final |

Aucun agent ne doit sauter directement à P3–P7 si P0/P1 contient un blocage qui affecte le même domaine.

---

# P0 — Remettre le dépôt sous contrôle

## P0.1 — CI verte sur `new-JV` — ✅ TERMINÉ

### Preuve vérifiée le 17 septembre 2026

Baseline : commit `cb4b12e5e4fb7fcff749238a7c966a4e32f7b307`, workflow CI run #510.

Vert :

- `npm ci` ;
- lint ;
- typecheck ;
- tous les tests unitaires ;
- régressions session/profile/service worker ;
- `verify:migrations` ;
- `verify:edges` ;
- build ;
- replay local Supabase PostgreSQL 17 ;
- matrice RLS ;
- tests relation/consentement/capacités/marketplace/programmes/questionnaires ;
- parcours navigateur questionnaire.

Le lock des migrations a aussi été comparé directement à Supabase production : **112/112 versions alignées**.

### Règle durable

P0.1 ne doit pas redevenir un chantier historique. Si la CI casse plus tard, la PR responsable corrige la régression avant de poursuivre.

## P0.2 — Gouvernance de `new-JV` — 🟡 GARDE-FOUS REPO EN PLACE

Le dépôt impose désormais le protocole PR dans `AGENTS.md`, `CLAUDE.md` et le template de PR. `new-JV` est la branche d’intégration stable ; les agents doivent travailler sur `agent/pX-Y-...`.

### Renforcement GitHub recommandé

La protection native de branche doit être activée dans les réglages GitHub lorsque l’accès administrateur le permet :

- PR obligatoire vers `new-JV` ;
- checks CI requis : `verify` et `rls-matrix (staging-like)` lorsque le changement touche le backend/sécurité ;
- interdiction de merge avec checks rouges ;
- pas de force-push sur `new-JV`.

Cette configuration est un **contrôle administrateur GitHub**, pas une modification de code. Elle ne bloque pas le démarrage de P1 si le protocole PR ci-dessus est respecté.

### Point de départ agent

P1.5–P2.5, P3 et P3 hardening (`#206`) sont en production (130 migrations). P4.1–P4.4 sont en PR (candidates pending). **P4 n’est pas livrée** : la revue contractuelle du 21 septembre 2026 doit rester verte avant tout merge/apply. Ne pas commencer P5. Watch n’applique pas.

## P0.3 — Baseline sécurité — ✅ ÉVALUÉ

Le 17 septembre 2026, les advisors Supabase production ont été relus avant le départ agent.

- aucune alerte advisor de niveau ERROR/critique bloquante ;
- certaines tables internes ont RLS activé sans policy cliente : **ne pas ajouter une policy permissive uniquement pour faire disparaître le warning** ; vérifier d’abord les grants et l’usage service/backend ;
- plusieurs RPC `SECURITY DEFINER` sont volontairement exposées aux rôles qui les utilisent : toute RPC touchée doit conserver des contrôles explicites d’identité, ownership et relation, avec tests RLS ;
- `get_coach_invite_preview` est un cas anon sensible : préserver strictement le périmètre minimal de données exposées ;
- les extensions `pg_trgm` / `pg_net` dans `public` sont une dette d’infrastructure à traiter séparément, pas pendant un chantier produit sans plan de migration ;
- la protection Supabase contre les mots de passe compromis est un réglage administrateur recommandé ;
- la CI bloque désormais toute vulnérabilité npm de niveau **critical**.

Les warnings de performance (indexes peu utilisés, policies permissives multiples) sont des pistes d’optimisation, pas une autorisation à supprimer index/policy sans mesure et tests.

---

# P1 — Contrats fondamentaux de compte et relation

C’est le chantier le plus important. Tant qu’il n’est pas terminé, les nouvelles fonctionnalités risquent de renforcer l’ancien modèle exclusif.

## P1.1 — Faire de la capacité Coach une vraie capacité indépendante

### État actuel

**✅ TERMINÉ — mergé, déployé et vérifié en production.**

PR [#182](https://github.com/Jayvy2002/prometheus-tracker-app/pull/182) mergée dans `new-JV`.
Commit de merge : `e310acd8677b7b7088206b07033187dc353df322`.
La CI finale de PR était entièrement verte ; la CI post-merge est également exigée avant de passer à P1.2.

- 673 tests unitaires ; audit npm sans critical ; lint 0 erreur (19 warnings existants).
- Typecheck, build, verify:migrations (112 appliquées + 1 candidate), 13 bundles Edge.
- Replay PostgreSQL 17, matrice RLS, départ/consentement, capacités, garde roster,
  programme atomique, intention, marketplace et questionnaires : verts.
- Navigateur : questionnaire existant et P1.1 (Solo, Coaché, Coach+Solo, Coach+Coaché,
  activation depuis Coaché, switch Personnel/Coaching, roster, départ personnel,
  mobile/desktop, erreur contexte puis reprise) : verts. Captures dans l'artefact
  `coach-capability-browser-proof` du run ; inspection visuelle effectuée.
- Revue finale du diff : pas de blocage restant identifié. Le contrôle des anciennes
  invitations/concurrence et l'isolation des réponses tardives ont été ajoutés et revalidés.

Migration append-only `20260917235400_independent_coach_capability.sql` appliquée en production via l’intégration Supabase avec **le même timestamp**. Aucune migration historique modifiée.

État production vérifié après merge :
- **113 migrations** appliquées, dernière = `20260917235400_independent_coach_capability` ;
- RPC `set_coach_capability(boolean)` présente ;
- `get_my_account_context()` présente ;
- garde `require_active_coach_capability()` et son trigger présents ;
- **13 Edge Functions ACTIVE**, dont `coach-agent` v131 et `coach-fleet-round` v138 au moment du contrôle ;
- locks Git rafraîchis à partir de l’état live ; `migrations.pending.json` vidé.

Inventaire des usages classés, contrat, compatibilité et dettes restantes :
[P1.1 — capacité Coach](P1_1_COACH_CAPABILITY.md).
La télémétrie legacy et le déclencheur historique de notification d'onboarding restent
explicitement documentés ; aucun chantier P1.2–P1.5 n'est inclus.

**Arrêt : P1.1 est clôturé. Aucun P1.2 sans le feu vert explicite de Jean-Vincent.**

### Cible

```text
user
├── personalCoachingState = solo | coached
├── coachCapability = true | false
├── activeWorkspace = personal | coaching
├── marketplacePublished = true | false
└── commercialEntitlements
```

### À faire

- identifier tous les appels directs au legacy `coaching_role` ;
- catégoriser : autorisation, navigation, compatibilité, affichage ;
- introduire/compléter la source serveur indépendante de capacité Coach ;
- migrer progressivement les décisions métier ;
- conserver une couche de compatibilité tant que nécessaire ;
- supprimer la contrainte logique `coachCapability === role === coach` lorsqu’elle n’est plus utile.

### Tests obligatoires

- Solo ;
- Coaché ;
- Coach + personnel Solo ;
- Coach + lui-même Coaché ;
- fin de relation d’un Coaché qui possède aussi la capacité Coach.

### Terminé quand

Aucune fonctionnalité nouvelle n’a besoin de l’ancien rôle exclusif pour savoir si un utilisateur peut coacher.

## P1.2 — Permissions par ressource/action

### État actuel

**✅ TERMINÉ — mergé, déployé et vérifié en production.**

PR [#185](https://github.com/Jayvy2002/prometheus-tracker-app/pull/185) mergée dans `new-JV`.
Commit de merge : `94b92ba34af5c64a7ddb8940ed6d1f78cf93bbe5`.
CI post-merge entièrement verte : [run 35338478368](https://github.com/Jayvy2002/prometheus-tracker-app/actions/runs/35338478368)
(`verify` 59s ; `rls-matrix` 3m20s ; `Supabase Preview` success).

Inventaire, contrat et câblage : [P1.2 — permissions ressource/action](P1_2_RESOURCE_PERMISSIONS.md).

- Module de décisions `src/features/account/domain/resourcePermissions.ts`.
- `/stats` (lire son historique) n’est plus masqué parce que la persona est Coachée.
- Programme assigné : lecture Coaché, écriture Solo uniquement ; proposition existante conservée.
- Dossier client : capacité Coach + relation active, jamais soi-même.
- Roster : `fetchClients` filtre `coach_id` de l’acteur ; un Coach Coaché ne s’y liste pas.
- `canUpdateAssignedProgram` / `canReadAssignedProgram` exigent `hasActiveRelationship` pour un client tiers (fail-closed si absent).
- `save_program` refuse un Coaché propriétaire d’un leftover Solo encore assigné.
- Les RPC legacy, les RLS owner et l’auto-attribution Data API sont fermés par la même règle.
- Workspace UI jamais utilisé comme grant.
- `/calendar` est un outil personnel (P1.3).

Migrations append-only `20260918102103_save_program_coached_owner.sql` et
`20260918103748_program_write_coached_owner.sql` appliquées en production via l’intégration
Supabase avec **les mêmes timestamps**. Aucune migration historique modifiée.

État production vérifié après merge :
- **115 migrations** appliquées, dernière = `20260918103748_program_write_coached_owner` ;
- helpers plpgsql `actor_is_actively_coached()`, `coached_client_cannot_edit_program(uuid)`,
  `actor_owns_program(uuid)` présents (`SECURITY DEFINER`) ;
- `save_program` / `sync_program_days` / `save_program_day_exercises` conservent le RAISE leftover ;
- RLS owner d’écriture et writes Data API `program_assignments` ferment le leftover ;
- **13 Edge Functions ACTIVE**, dont `coach-agent` v134 et `coach-fleet-round` v141 au moment du contrôle ;
- locks Git rafraîchis à partir de l’état live ; `migrations.pending.json` vidé.

**Arrêt : P1.2 est clôturé.**

### Problème

Des gardes historiques bloquent des pages entières parce que la persona est Coachée.

### Cible

Une permission répond à :

- qui possède la ressource ?
- qui agit ?
- quelle relation existe ?
- quelle action est demandée ?

### À faire

Créer/normaliser des décisions explicites telles que :

- lire son historique ;
- logger sa séance ;
- modifier ses données personnelles ;
- lire son programme assigné ;
- modifier un programme assigné ;
- proposer un changement ;
- lire le dossier client ;
- éditer le dossier client.

### Terminé quand

Le fait d’être Coaché ne masque plus arbitrairement ses propres données ou outils personnels autorisés.

## P1.3 — Calendrier personnel pour Solo + Coaché

### État actuel

**✅ TERMINÉ — mergé et vérifié. Aucune migration SQL.**

PR [#187](https://github.com/Jayvy2002/prometheus-tracker-app/pull/187) mergée dans `new-JV`.
Commit de merge : `e171b3268e304fc09367b3504e3d43d0146645c1`.
CI post-merge réellement verte (logs inspectés, pas seulement `conclusion=success`) :
[run 35345640894](https://github.com/Jayvy2002/prometheus-tracker-app/actions/runs/35345640894).

- leftover : `ROLLBACK` puis `save_program coached leftover owner guard passed` ;
- Playwright P1.3 : `assigned Upper pull scheduled, paused hides future scheduled` ;
- production `phyuijjekxtjvipjtdfv` : toujours **115** versions après #187.

Inventaire et câblage : [P1.3 — calendrier personnel](P1_3_PERSONAL_CALENDAR.md).

- `/calendar` n’est plus derrière `CoachedAthleteRedirect` ; `CoachTrackerRedirect` (outils personnels) suffit.
- Desktop Coaché : Calendrier à côté de Stats / progression.
- Hub progression et profil Coaché : lien Calendrier.
- Consultation du futur : un jour à venir est sélectionnable ; un jour **prescrit** apparaît en prévu avec son nom.
- Fenêtre du plan : `start_date` + `duration_weeks` ; une attribution `paused` ne génère plus de prévu après sa fin.
- Pas d’édition du plan Coach depuis le calendrier (`saveProgram` / éditeur absents).
- `/routines` reste bloqué.
- Libellé carte prévue : FR `Séance prévue. Elle n’a pas encore été commencée.` / EN `Scheduled workout. It hasn't been started yet.`

**Arrêt : P1.3 est clôturé.**

### À faire

- retirer le blocage persona sur `/calendar` ;
- rendre le Calendrier accessible au Coaché ;
- autoriser la consultation du futur ;
- conserver l’interdiction d’éditer directement le plan Coach ;
- afficher correctement les états prévus / en cours / réalisés ;
- préserver la navigation semaine/mois et le résumé de journée.

### Étape suivante

Ajouter progressivement : check-ins, habitudes, événements utiles et changements planifiés si disponibles.

### Terminé quand

Solo et Coaché peuvent consulter passé et futur sans élargir indûment les droits d’écriture.

## P1.4 — Lifecycle marketplace avec confirmation finale Athlète

### État actuel

**✅ TERMINÉ — mergé, déployé et vérifié en production.**

PR [#189](https://github.com/Jayvy2002/prometheus-tracker-app/pull/189) mergée dans `new-JV`.
Commit de merge : `ced733516a4351eed5bed629794fe8ff3de87621`.
CI post-merge entièrement verte : [run 35376871845](https://github.com/Jayvy2002/prometheus-tracker-app/actions/runs/35376871845)
(`verify` 1m14s ; `rls-matrix` 3m47s). Le job `verify` exige désormais les secrets
production et exécute `migration list` + `db push --dry-run` en fail-closed.

Inventaire : [P1.4 — lifecycle marketplace](P1_4_MARKETPLACE_LIFECYCLE.md).

- `respond_coaching_request(..., 'accepted')` pose `coach_accepted` : prospect, pas de `coach_client_links.active`, pas de consentement dossier.
- Seul `respond_coaching_request(..., 'confirmed')` (athlète, depuis `coach_accepted`) appelle `activate_coaching_relationship`.
- `activate_coaching_relationship` reste interne (REVOKE authenticated/anon ; execute live = `postgres` + `service_role` uniquement).
- Demandes `pending` / `coach_accepted` incompatibles retirées après confirmation.
- Replay d’une confirmation historique après départ : pas de réactivation.
- Les lignes leftover `accepted` (ancien contrat : acceptation Coach = activation) restent
  `accepted`. Elles ne sont pas réécrites en `athlete_confirmed`, ne se rejouent pas, et
  ne réactivent rien après départ. L’UI lit l’état courant dans `coach_client_links`
  (pas dans le consentement).
- `athlete_confirmed` décrit l’événement historique ; l’état actif/terminé est affiché à part.
- Télémétrie : `coaching_request_accepted` = poursuite Coach ; `marketplace_athlete_confirmed` = activation.
- Conversation prospect (messagerie sans dossier) : **P4.3**, hors de cette sous-tâche.

Migration append-only `20260918130232_marketplace_athlete_confirm` appliquée en production
avec **le même timestamp**. Aucune migration historique modifiée.

État production vérifié après merge :
- **116 migrations** appliquées, dernière = `20260918130232_marketplace_athlete_confirm` ;
- CHECK `coach_join_requests_status_check` = `pending | accepted | coach_accepted | athlete_confirmed | declined | withdrawn` ;
- `activate_coaching_relationship` non exécutable par `anon` ni `authenticated` ;
- dry-run CI : `Remote database is up to date` / `aucune migration à pousser` ;
- **13 Edge Functions ACTIVE** (P1.4 n’a pas modifié les edges) ;
- locks Git rafraîchis à partir de l’état live ; `migrations.pending.json` vidé.

**Arrêt : P1.4 est clôturé. P1.5–P2.3 sont actifs en production.**

### Contrat cible

```text
pending
→ coach_accepted
→ conversation prospect
→ athlete_confirmed
→ relation active
```

Fermetures : `declined`, `withdrawn`, autres états seulement si besoin démontré.

### Règles

- demande initiale créée par l’athlète ;
- Coach peut accepter de poursuivre ou refuser ;
- l’acceptation Coach n’active pas seule le coaching ;
- conversation prospect possible après acceptation (état `coach_accepted` ; le fil de messages est P4.3) ;
- activation uniquement après confirmation de l’athlète ;
- vérifier qu’aucun autre Coach actif n’existe au moment transactionnel de l’activation ;
- fermer proprement les demandes incompatibles après activation.

### Sécurité

Avant activation, le Coach ne voit que les informations explicitement consenties pour la demande.

### Terminé quand

Aucune action Coach seule ne peut créer `coach_client_links.active` pour une demande marketplace.

## P1.5 — Règles commerciales constantes

### État actuel

**ACTIF EN PRODUCTION** après merge `#190` (`20260918182954_commercial_durations`).

Feu vert de Jean-Vincent pour implémenter P1.5 dans la même PR que le lock-sync P1.4.
Pas de Stripe, pas d’entitlements P6, pas de prix inventés.

Inventaire : [P1.5 — règles commerciales](P1_5_COMMERCIAL_TERMS.md).

- TypeScript unique : `src/lib/commercialTerms.ts` (`SOLO_TRIAL_DAYS = 14`, `COACH_GRACE_DAYS = 7`, `COMMERCIAL_PRICES.status = 'undecided'`).
- SQL unique (`20260918182954_commercial_durations`) : `solo_trial_interval()` / `coach_grace_interval()`, `REVOKE` authenticated/anon.
- `transition_client_to_solo` tamponne `COALESCE(..., now() + public.solo_trial_interval())` — jamais raccourci.
- Les migrations historiques 30 jours restent inchangées.
- Pas de colonne `coach_grace_ends_at`, pas de mur de paiement.

**Arrêt : P1.5 est actif en production. Ne pas inverser le `COALESCE` d’essai en auto-renouvellement.**

### Cible

Centraliser les décisions actuelles :

- essai Solo = **14 jours** ;
- grâce Coach = **7 jours** ;
- prix = non décidés.

Éliminer les anciennes constantes 30 jours lorsqu’elles portent le même concept métier.

### Terminé quand

Une seule définition métier est utilisée et testée pour chaque durée.

## Hotfix A — Immutabilité `coach_client_links`

### État actuel

**CLOS EN PRODUCTION** (`#197`, lock 126, `20260919202538_coach_client_link_immutability`). Inventaire : [immutabilité du lien](P1_COACH_CLIENT_LINK_IMMUTABILITY.md).

Allowlist live : `authenticated` = SELECT + UPDATE (`last_visited_at`, `last_nudged_at`) ; `anon` / `PUBLIC` = aucun privilège. Trigger d’identité + `updated_at` serveur. Status uniquement via RPC métier.

**Arrêt : Hotfix A est clos. Prochaine tâche = Hotfix B.**

### Terminé quand

Un utilisateur authentifié ne peut pas transformer l’identité d’un lien existant, ni créer/finir/ressusciter une relation hors RPC.

## Hotfix B — Autorité primitives P2

### État actuel

**CLOS EN PRODUCTION** (`#199`, lock 127, `20260919214423_p2_primitive_authority`). Inventaire : [autorité primitives P2](P2_PRIMITIVE_AUTHORITY.md).

`authenticated` / `anon` / `PUBLIC` n’ont plus `EXECUTE` sur `upsert_athlete_signal`, `resolve_athlete_signal`, `record_athlete_decision` (11/13 args), `enqueue_athlete_decision_outbox`, `queue_and_record_athlete_decision`. `service_role` conserve `EXECUTE`. Les RPC métier (`save_athlete_weekly_review`, `commit_solo_weekly_review_decision`, `apply_intervention`, Watch `correct`/`decide`) et `drain_athlete_decision_outbox` restent publiques. Une décision Solo qui change les cibles passe uniquement par `commit_solo_weekly_review_decision` : RPC absente → fail-closed, aucune mutation locale.

**Arrêt Hotfix B : clos. Reprise P3 à P3.2 (P3.1 déjà terminé). Pas de P4.**

### Terminé quand

Les écritures P2 passent par des chemins métier autorisés ; les primitives trop permissives ne sont plus appelables depuis le Data API.

---

# P2 — Cerveau Prometheus : analyse, signaux et mémoire

## Objectif

Faire évoluer les briques IA actuelles vers un moteur commun qui apprend du contexte dans le temps sans auto-appliquer.

## P2.1 — Modèle de signaux persistants

### État actuel

**ACTIF EN PRODUCTION** (`20260918185709_athlete_signals`).

Audit : `coach_interventions` est une inbox de propositions (`pending/sent/kept/dismissed`), pas une hypothèse suivie dans le temps. `solo_weekly_reviews` est une décision nutrition par semaine ISO. Une table dédiée est nécessaire.

Inventaire : [P2.1 — signaux persistants](P2_1_ATHLETE_SIGNALS.md).

- Table `athlete_signals` : athlete_id, domain, type, hypothesis, evidence_for/against, confidence qualitative, status, first/last_seen, next_review, resolved.
- Domaines : training, nutrition, recovery, weight, goal, adherence.
- Écritures uniquement via `upsert_athlete_signal` / `resolve_athlete_signal` (REVOKE INSERT/UPDATE/DELETE authenticated).
- Lecture : athlète propriétaire ou Coach avec relation active. Le workspace n’accorde aucun droit.
- Aucune auto-application (pas d’écriture programmes / cibles / logs).

**Arrêt : P2.1 est actif en production.**

### Cible

Créer un modèle stable conceptuellement équivalent à :

```text
signal
- athlete_id
- domain
- type
- hypothesis
- evidence_for
- evidence_against
- confidence
- status
- first_seen_at
- last_seen_at
- next_review_at
- resolved_at
- resolution_reason
```

Le schéma exact doit être déterminé après audit des tables d’interventions existantes. Ne pas créer une table redondante si une primitive existante peut évoluer proprement.

### Domaines initiaux

- training ;
- nutrition ;
- recovery/checkin ;
- weight/body ;
- goal ;
- adherence/data-quality sans jugement moral.

## P2.2 — Revue hebdomadaire universelle

### État actuel

**ACTIF EN PRODUCTION** (`20260918194013_athlete_weekly_reviews`).

Inventaire : [P2.2 — revue hebdomadaire](P2_2_WEEKLY_REVIEW.md).

Audit : `solo_weekly_reviews` reste la décision nutrition Solo (tap humain). La fleet (`triage_coach_fleet` / `coach_interventions`) reste l’inbox Coach. Le moteur commun `runAthleteWeeklyReview` alimente `athlete_signals` et persiste `athlete_weekly_reviews`.

La revue commune :

1. charge les agrégats autorisés (pas les logs bruts) ;
2. évalue la qualité des données ;
3. met à jour les signaux existants ;
4. crée de nouveaux signaux si nécessaire ;
5. renforce ou diminue la confiance qualitative ;
6. décide : attendre / demander info / proposer / clôturer ;
7. produit un résumé adapté à l’autorité (athlète Solo, Coach si relation active).

### Invariant

Une semaine sans modification est un résultat valide. Un signal faible attend. Les modules désactivés n’alimentent pas de jugement. Aucune auto-application.

**Arrêt : P2.2 est actif en production.**

## P2.3 — Journal des propositions et décisions humaines

### État actuel

**ACTIF EN PRODUCTION** (`20260918201237_athlete_decision_log` + `20260918224935` + `20260918232507`).

Inventaire : [P2.3 — journal des décisions](P2_3_DECISION_LOG.md).

Audit : `solo_weekly_reviews` (`accepted` / `kept` / `dismissed`) et `coach_interventions` (`pending` / `sent` / `kept` / `dismissed`) ne couvrent pas `modified`, la raison humaine facultative, l’effet réellement appliqué, ni la consommation par la revue suivante. Table dédiée `athlete_decision_log`.

Le journal conserve :

- ce qui était proposé ;
- pourquoi ;
- quelles données étaient utilisées ;
- qui a décidé ;
- accepté / modifié / refusé / ignoré ;
- raison humaine facultative ;
- effet réellement appliqué.

Un refus ou un ignoré empêche `runAthleteWeeklyReview`, la carte Solo
(`computeSoloWeeklyReview`) et le round fleet (`planFleetRoundCard` / Edge `planWrite`)
de reproposer le même `(domaine, type)` tant que les preuves n’ont pas bougé
(seuils fleet : kcal ±150, séances ±2). Le signal continue d’être suivi. Aucune
auto-application. L’intention de journal est enregistrée dans la transaction de
l’action métier (`queue_and_record_athlete_decision`) avec les preuves utiles ;
`commit_solo` consulte l’outbox sous verrou avant toute mutation — une reprise
ne termine que la journalisation. Le contenu d’une intention est immuable.
`drain_athlete_decision_outbox` reprend les échecs sans doublon ni usurpation
d’auteur, avec backoff. Ordre total `(next_attempt_at, created_at, id)` ;
try-advisory puis outbox puis journal ; une clé occupée est sautée. Une
reprise sur un journal existant compare l’intention complète. L’outbox est
unique par `(athlete_id, idempotency_key)`.

### Invariant

La revue suivante exploite ce contexte. Un refus n’est pas un bouton sans mémoire.

**Arrêt : P2.3 est actif en production.**

## P2.4 — Explicabilité et correction

### État actuel

**✅ TERMINÉ — mergé, déployé et vérifié en production.**

Lecture `#191` (`b404281`). Correction `#192` (`9b8a7ab`). Migrations `20260919134856_watch_context_correction` et `20260919141146_watch_proposal_decision` appliquées avec **le même timestamp Git** (lock **124**).

Inventaire : [P2.4 — explicabilité](P2_4_EXPLAINABILITY.md).

Audit : P2.1–P2.3 fournissent déjà signaux, revue, journal, `data_used`, `why`, `proposal`, mémoire de proposition. Aucun second moteur. Le slice lecture traduit ces surfaces. La correction réutilise `resolve_athlete_signal` + le journal (`corrected`) via une RPC atomique `correct_athlete_watch_context`. Pas de nouvelle table. Pas de 14ᵉ Edge Function.

- Composant unique `PrometheusWatchPanel` : dashboard personnel (Solo et Coaché) + fiche Coach.
- Permissions = ressource + relation + action (`canReadAthleteWatch` / `canCorrectAthleteWatchContext`). Le Coaché lit ; il ne récupère pas les droits de correction du Coach. Un Coach lui-même Coaché lit son dossier perso et celui de ses clients, sans que le workspace UI n’accorde rien. Seuls Solo (y compris un Coach côté perso) et le Coach actif de l’athlète corrigent.
- Observation = type + fingerprint structuré + i18n (jamais `window` / `fingerprint` ni `hypothesis` moteur).
- Une correction clôt le signal ouvert en `not_relevant`, journalise `corrected` avec motif humain, et empêche la revue suivante de réouvrir le même `(domaine, type)` tant que les preuves n’ont pas bougé (kcal ±150, séances ±2). Un refus de proposition continue de laisser le signal ouvert.
- Les mesures sources (séances, nutrition, pesées) ne sont jamais réécrites.
- Indisponible ≠ vide : le panneau a loading / ready / error + retry. Une correction non persistée affiche une erreur, pas un succès.

**Arrêt : P2.4 est actif en production.**

L’utilisateur/Coach doit pouvoir comprendre :

- ce qui a été observé ;
- le niveau de certitude qualitatif ;
- pourquoi Prometheus attend ou propose ;
- quelles données manquent.

Ne pas afficher de scores de confiance pseudo-précis si le modèle ne les justifie pas.

### Terminé quand P2

- Solo et Coach partagent la même logique conceptuelle de signaux ;
- aucune auto-application ;
- mémoire inter-semaines prouvée par tests ;
- un refus humain influence une revue suivante ;
- les modules désactivés n’alimentent pas de jugement ;
- la correction de contexte reste traçable et ne falsifie pas les mesures ;
- une proposition courante peut être acceptée, modifiée ou refusée depuis le panneau, sans troisième moteur d’apply.

---

## P2.5 — Décision humaine sur la proposition courante

### État actuel

**✅ TERMINÉ — mergé, déployé et vérifié en production.**

PR [#192](https://github.com/Jayvy2002/prometheus-tracker-app/pull/192) mergée dans `new-JV` (`9b8a7ab`).

Inventaire : [P2.5 — proposition](P2_5_WATCH_PROPOSAL.md).

Le panneau montre une proposition **seulement** si la revue `propose` pour ce `(domaine, type)` exact (upsert `open` medium/high). Un signal custom ouvert n’hérite pas de la proposition d’un autre type.

Contrat :

```text
humain (Solo ou Coach actif) + proposition courante concrète
→ RPC atomique : journal accepted | modified | refused
→ le journal porte la sérialisation du builder canonique Solo/fleet
→ data_used = preuves de la revue (toutes les entrées du builder)
→ token vu à l’écran (review id/updated_at + proposal + evidence)
  sinon stale_proposal
→ le signal reste ouvert (un refus n’est pas une correction)
→ idempotence par semaine ISO + payload immuable
→ la revue suivante ne repropose pas le même (domaine, type)
  tant que les preuves n’ont pas changé
→ aucune écriture des cibles, séances, repas, programmes
→ Coaché : lecture seule ; pas de `save_athlete_weekly_review`
→ workspace UI n’accorde rien
→ succès UI seulement après persistance
```

`commit_solo_weekly_review_decision` et `apply_intervention` restent les seuls moteurs d’effet durable historiques. P2.5 ne journalise que le contexte Vision 8.6 (`applied_effect = {}`).

**Arrêt : P2.5 est actif en production. P2 est clos.**

---

# P3 — Planification avancée

## P3.1 — Séparer séance et jour de semaine

### État actuel

**TERMINÉ — mergé `#195`, appliqué en production (lock 125, `20260919194159_program_session_organization`).** Inventaire : [P3.1 — organisation des séances](P3_1_SESSION_ORGANIZATION.md).

Un seul moteur `programs` → `program_days` → prescriptions → workouts.

- `programs.session_organization` : `fixed_days` (legacy) ou `in_order`.
- `program_days.weekday` nullable ; unique seulement si renseigné.
- Mode jours fixes : prochaine séance par jour de semaine.
- Mode dans l’ordre : prochaine séance = suivante dans `order_index` après le dernier workout complété lié au `program_day_id`. S’entraîner un autre jour ne saute pas la séquence.
- Calendrier : n’invente des dates « prévues » qu’en `fixed_days`. En `in_order`, passé réel seulement.
- Un seul logger : `startWorkoutFromTemplate`.
- Permissions P1.2 inchangées (leftover Coaché, owner, Coach actif).
- `triage_coach_fleet` compte encore les weekdays distincts : 0 pour `in_order` (limite connue ; le roster utilise le nombre de séances).

### À éviter

Ne pas créer deux loggers. Ne pas inventer P2.6/P2.7. Ne pas commencer P4.

## P3.2 — Phases et cycles

**TERMINÉ** (`#201`, lock 128, `20260919225507_program_phases`). Inventaire : [P3.2 — phases](P3_2_PROGRAM_PHASES.md).

Un seul moteur `programs` → phases optionnelles → `program_days` → prescriptions → workouts.

- Programme simple = zéro phase.
- Programme périodisé = les mêmes séances, groupées par phase.
- Deload / taper = une phase avec d’autres prescriptions, pas un second logger.
- `session_organization` P3.1 inchangé (`fixed_days` / `in_order`).
- Le logger tamponne `program_phase_id` + `prescribed_phase_name` au start.
- Permissions P1.2 inchangées (leftover Coaché, owner, Coach actif).
- Activation / versions = P3.3, pas cette sous-tâche.

### UX

Le chemin principal reste : créer un programme → séances → Jours fixes ou Dans l’ordre → exercices → enregistrer. Les phases sont derrière « Options avancées ».

## P3.3 — Versions et activation

**TERMINÉ** (`#203`, lock 129, `20260919233853_program_versions`). Inventaire : [P3.3 — versions](P3_3_PROGRAM_VERSIONS.md).

Distinguer (dérivé, pas une table d’états parallèle) :

- brouillon (éditeur) ;
- version enregistrée (révision non appliquée) ;
- version active (`programs.active_revision_no`) ;
- future version planifiée (`scheduled_revision_no` + date) ;
- version historique (révision déjà appliquée, remplacée).

Le logger tamponne `program_revision_no` au start. Une version future ne mute pas le graphe live. `session_organization` P3.1 et les phases P3.2 restent sur le même moteur.

Passe transversale P3 / P3 hardening : **TERMINÉ** (`#206`, lock 130, `20260920014500_p3_hardening`). Inventaire : [P3 hardening](P3_HARDENING.md). Ce n’est pas un P3.4 officiel.

### Terminé quand P3

Un programme simple et un programme périodisé utilisent le même moteur d’exécution et le même historique. **Critère atteint.**

## P3 hardening — ✅ TERMINÉ

**TERMINÉ** (`#206`, merge `b8f6a6df02925f042ef8708b50e6521b4e1c26dc`, lock 130, `20260920014500_p3_hardening`, timestamp Git, 241 statements). Pending vide. Ne pas restamper.

---

# P4 — Marketplace complète

## P4.1 — Qualifications Coach

**En correction pré-production** — candidate `20260921021231_p4_coach_qualifications` (pending jusqu’à apply live). Inventaire : [P4.1 — qualifications](P4_1_QUALIFICATIONS.md).

Un Coach **reste visible et utilisable sans badge vérifié**. Les états sont `declared / pending / verified / rejected / expired`. La revue est `service_role` uniquement. Surface publique minimale (pas de `proof_path` / `reviewer_*` / `review_note`). Preuve liée à `auth.uid() / qualification_id / proof-<uuid>.ext` (`upsert: false`). Pas d’étoiles.

## P4.2 — Matching expliqué

**En correction pré-production** — candidate `20260921021923_p4_explained_matching` (pending jusqu’à apply live). Inventaire : [P4.2 — matching expliqué](P4_2_MATCHING.md).

Exigences bloquantes vs préférences. Disciplines Vision (`strength` / `bodybuilding` / `hypertrophy` / `powerlifting` + `general_fitness` historique). Budget comparable seulement si montant + période + devise matchent. Shortlist de Coachs **éligibles** uniquement (max 5). Pas de pourcentage. Pas de `€` hardcodé.

## P4.3 — Prospect dans la messagerie

**En correction pré-production** — candidate `20260921023720_p4_prospect_messaging` (pending jusqu’à apply live). Inventaire : [P4.3 — prospect messagerie](P4_3_PROSPECT_MESSAGING.md).

Dès `pending` : conversation prospect. Puis `coach_accepted` : même fil. Pas d’`is_coach_of`, pas de dossier / photos / programme avant `athlete_confirmed`. Snapshot prospect limité et consenti.

## P4.4 — Signalement/modération minimale

**En correction pré-production** — candidate `20260921024426_p4_marketplace_moderation` (pending jusqu’à apply live). Inventaire : [P4.4 — signalement](P4_4_MODERATION.md).

Signaler un profil ou un comportement. File `service_role` (pas de console SPA). `directory_suspended` masque l’annuaire **et** refuse une **nouvelle** `request_coaching` (`coach_unavailable`). Une relation active n’est pas terminée. Un prospect déjà ouvert peut continuer jusqu’à confirmation. Acteur d’audit durable (`marketplace_audit_actor`). **Pas d’étoiles/avis Coach.** Pas de produit « bloquer ».

### Déploiement (après feu vert explicite uniquement)

1. Edge `delete-account` corrigée (cleanup Storage fail-closed, compatible pré-P4 : le bucket `qualification-proofs` peut encore être absent) ;
2. migrations P4 ;
3. smoke tests production ;
4. frontend P4.

Ne pas inverser : cela évite une fenêtre où les preuves existent déjà et l’ancienne Edge les laisse orphelines. **Ne pas merger. Ne pas appliquer. Ne pas commencer P5.**

### Terminé quand P4

Le parcours complet : questionnaire recherche → shortlist expliquée → demande + snapshot limité → discussion prospect dès pending → Coach accepte → même conversation → Athlète confirme → client actif, sans accès prématuré au dossier. **Critère non atteint tant que la revue pré-production n’est pas corrigée et mergée/appliquée.**

---

# P5 — Adoption Coach et qualité des référentiels

## P5.1 — Import spreadsheet/CSV intelligent

Parcours :

```text
Upload
→ parsing
→ détection des colonnes
→ mapping proposé
→ ambiguïtés
→ preview
→ corrections
→ confirmation
→ transaction
```

### Règles

- jamais d’import silencieux de champs ambigus ;
- dry-run/preview obligatoire ;
- idempotence/reprise ;
- provenance des données ;
- erreurs par ligne récupérables lorsque possible.

## P5.2 — Dossier provisoire d’un client sans compte

Coach peut préparer un dossier minimal/import.

Aucune donnée personnelle ne devient définitivement rattachée à un utilisateur avant :

- invitation ;
- compte authentifié ;
- aperçu ;
- confirmation de rattachement.

## P5.3 — Bibliothèque d’exercices

Compléter l’existant avec :

- alias/synonymes ;
- recherche normalisée ;
- détection de doublons ;
- fusion conservant tous les liens historiques ;
- gouvernance des propositions.

## P5.4 — Admin minimal

Seulement les outils nécessaires pour opérer :

- qualifications ;
- propositions d’exercices ;
- merges ;
- imports problématiques ;
- signalements.

Ne pas construire un back-office générique sans besoin réel.

---

# P6 — Architecture économique de bêta

## P6.1 — Entitlements indépendants

Remplacer progressivement le modèle trop simple `free/premium` par un contrat pouvant représenter :

- Solo trial/paid/beta ;
- Coach entitlement ;
- tier/limit clients actifs ;
- grace period ;
- beta bypass ;
- billing status.

Identité, relation de coaching et entitlement restent séparés.

## P6.2 — Bêta bypass

En bêta :

- accès ouvert selon politique bêta ;
- règles d’entitlement calculables ;
- consommation mesurée ;
- aucun prix final inventé.

## P6.3 — Mesure des coûts

Mesurer par fonctionnalité :

- modèle IA ;
- tokens/units ;
- fréquence ;
- stockage ;
- services tiers ;
- contexte Solo/Coach.

Respecter `docs/TELEMETRY.md` : pas de contenu privé inutile.

## P6.4 — Billing réel

À ouvrir seulement lorsque :

- coûts mesurés ;
- hypothèses de prix décidées ;
- droits/entitlements stables ;
- bêta suffisamment testée.

L’activation Coaché ne doit pas être couplée implicitement au paiement.

---

# P7 — Intégrations et finition bêta

## P7.1 — Health / wearables

Ordre indicatif :

1. Health Connect / Apple Health selon plateforme et faisabilité ;
2. Garmin ;
3. autres sources selon demande réelle.

Conserver provenance, date, unité, déduplication et permissions.

## P7.2 — Offline secondaire

Après workout :

- données de consultation utiles ;
- nutrition locale pertinente ;
- drafts/messages sortants si bénéfice réel.

Ne pas chercher à rendre marketplace/IA entièrement offline.

## P7.3 — Parcours E2E de référence

Tester au minimum :

### Solo

signup → intention → onboarding minimal → programme/séance → nutrition → calendrier → revue → proposition → décision.

### Coaché

recherche/invite → relation → programme → calendrier → check-in → message → séance → fin de relation → retour Solo.

### Coach

activation capacité → espace Coaching → client/invite → programme → review → intervention → espace Personnel.

### Coach + Coaché

capacité Coach + Coach personnel actif → switch workspaces → aucun mélange de données/permissions.

---

# Capacités déjà présentes à préserver

Les éléments suivants existent déjà sous une forme suffisante pour être **étendus plutôt que reconstruits** :

- Dashboard personnel priorité + vue d’ensemble ;
- moteur de séances ;
- programme assigné ;
- types avancés de séries ;
- révisions de programmes ;
- individualisation/fork ;
- nutrition et portions ;
- scanner/recettes ;
- check-ins configurables ;
- messages contextualisés ;
- console Coach et fiche client ;
- offline workout ;
- marketplace opt-in de base ;
- questionnaires versionnés ;
- tracking par module ;
- revue hebdo Solo partielle ;
- fleet/triage Coach ;
- bibliothèque exercices de base ;
- RLS/RPC critiques existantes.

Un agent qui propose de réécrire l’un de ces systèmes doit démontrer une impossibilité structurelle, pas simplement préférer une architecture différente.

---

# Définition globale de « terminé »

Une tâche fonctionnelle est terminée uniquement si :

- comportement produit conforme à `VISION.md` ;
- autorisation serveur correcte ;
- état loading/empty/error/success honnête ;
- FR/EN ;
- mobile + desktop raisonnables ;
- accessibilité essentielle ;
- comportement réseau/offline défini ;
- tests unitaires/DB/E2E proportionnés ;
- télémétrie sans données privées inutiles ;
- documentation durable mise à jour si le contrat a changé ;
- CI verte.

Une UI qui « marche » avec une règle métier uniquement côté client n’est pas terminée.
