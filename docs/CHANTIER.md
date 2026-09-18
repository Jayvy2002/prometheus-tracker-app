# Chantier — Prometheus

> **SOURCE DE VÉRITÉ DU TRAVAIL RESTANT**
>
> Ce document décrit l’ordre d’exécution, les écarts entre le produit actuel et `docs/VISION.md`, les critères de fin et les dépendances.
>
> Git conserve l’historique. Ce fichier ne doit pas devenir un journal de PR ni une accumulation de lots obsolètes.
>
> **Règle agents :** ne pas reconstruire ce qui existe déjà. Avant chaque chantier, inspecter le code/migrations actuels et vérifier si le problème est réellement fonctionnel, architectural ou simplement non raccordé.

**Mis à jour : 18 septembre 2026.**

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

> **CURRENT IMPLEMENTATION GATE — P1.2 : Permissions par ressource/action.**
>
> P1.1 est terminé, mergé, déployé et vérifié. P1.2 est en cours (PR ouverte, en attente du feu vert de Jean-Vincent). Un agent ne commence que la tâche indiquée dans ce bloc, puis s’arrête à la PR verte jusqu’au feu vert explicite de Jean-Vincent. **Ce bloc est l’unique pointeur de “prochaine tâche” à maintenir.** Les autres documents doivent le lire plutôt que dupliquer un numéro de chantier.

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
| **P1** | Identité, capacités, permissions, lifecycle | **EN COURS — P1.1 terminé ; P1.2 PR ouverte, pas de P1.3 sans feu vert** | Faire correspondre le modèle métier à la Vision |
| **P2** | Cerveau Prometheus | À faire après P1 | Unifier revue hebdo + signaux + mémoire + décisions |
| **P3** | Planification avancée | À faire après contrats P1 | Phases/cycles + séquence de séances |
| **P4** | Marketplace complète | À faire après lifecycle P1.4 | Matching, qualifications, prospect → confirmation athlète |
| **P5** | Adoption Coach | À faire | Imports, bibliothèque exercices, admin ciblé |
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

P1.2 est en cours. Le calendrier Coaché (P1.3) reste le chantier suivant, uniquement après merge et feu vert.

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

**🟡 PR OUVERTE — en attente de revue, CI verte et feu vert de Jean-Vincent. Ne pas merger. Ne pas commencer P1.3.**

Inventaire, contrat et câblage : [P1.2 — permissions ressource/action](P1_2_RESOURCE_PERMISSIONS.md).

- Module de décisions `src/features/account/domain/resourcePermissions.ts`.
- `/stats` (lire son historique) n’est plus masqué parce que la persona est Coachée.
- Programme assigné : lecture Coaché, écriture Solo uniquement ; proposition existante conservée.
- Dossier client : capacité Coach + relation active, jamais soi-même.
- Roster : `fetchClients` filtre `coach_id` de l’acteur ; un Coach Coaché ne s’y liste pas.
- Workspace UI jamais utilisé comme grant.
- `/calendar` reste bloqué (P1.3). Aucune migration nouvelle.

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

Le calendrier existe mais est encore bloqué pour le Coaché.

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
- conversation prospect possible après acceptation ;
- activation uniquement après confirmation de l’athlète ;
- vérifier qu’aucun autre Coach actif n’existe au moment transactionnel de l’activation ;
- fermer proprement les demandes incompatibles après activation.

### Sécurité

Avant activation, le Coach ne voit que les informations explicitement consenties pour la demande.

### Terminé quand

Aucune action Coach seule ne peut créer `coach_client_links.active` pour une demande marketplace.

## P1.5 — Règles commerciales constantes

Centraliser les décisions actuelles :

- essai Solo = **14 jours** ;
- grâce Coach = **7 jours** ;
- prix = non décidés.

Éliminer les anciennes constantes 30 jours lorsqu’elles portent le même concept métier.

### Terminé quand

Une seule définition métier est utilisée et testée pour chaque durée.

---

# P2 — Cerveau Prometheus : analyse, signaux et mémoire

## Objectif

Faire évoluer les briques IA actuelles vers un moteur commun qui apprend du contexte dans le temps sans auto-appliquer.

## P2.1 — Modèle de signaux persistants

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

Faire converger :

- revue hebdo Solo ;
- fleet/triage Coach.

La revue commune doit :

1. charger les agrégats autorisés ;
2. évaluer la qualité des données ;
3. mettre à jour les signaux existants ;
4. créer de nouveaux signaux si nécessaire ;
5. renforcer ou diminuer la confiance ;
6. décider : attendre / demander info / proposer / clôturer ;
7. produire un résumé adapté à l’autorité humaine.

### Invariant

Une semaine sans modification est un résultat valide.

## P2.3 — Journal des propositions et décisions humaines

Conserver :

- ce qui était proposé ;
- pourquoi ;
- quelles données étaient utilisées ;
- qui a décidé ;
- accepté / modifié / refusé / ignoré ;
- raison humaine facultative ;
- effet réellement appliqué.

La revue suivante doit pouvoir exploiter ce contexte.

## P2.4 — Explicabilité et correction

L’utilisateur/Coach doit pouvoir comprendre :

- ce qui a été observé ;
- le niveau de certitude ;
- pourquoi Prometheus attend ou propose ;
- quelles données manquent.

Ne pas afficher de scores de confiance pseudo-précis si le modèle ne les justifie pas.

### Terminé quand P2

- Solo et Coach partagent la même logique conceptuelle de signaux ;
- aucune auto-application ;
- mémoire inter-semaines prouvée par tests ;
- un refus humain influence une revue suivante ;
- les modules désactivés n’alimentent pas de jugement.

---

# P3 — Planification avancée

## P3.1 — Séparer séance et jour de semaine

Le moteur doit supporter :

- `calendar` : séance associée à un jour/date ;
- `sequence` : prochaine séance selon ordre A→B→C.

### À éviter

Ne pas créer deux loggers.

## P3.2 — Phases et cycles

Étendre progressivement le modèle :

```text
program
→ phases
→ cycle/microcycle si utile
→ session templates
→ exercises
→ prescriptions
```

Fonctions visées :

- blocs/phases ;
- deload ;
- taper ;
- variations de volume/intensité ;
- durée variable ;
- activation future.

### UX

Le niveau avancé est progressif. Un utilisateur doit toujours pouvoir créer un simple programme de quelques séances sans configurer un mésocycle.

## P3.3 — Versions et activation

Conserver le système de révisions existant.

Distinguer :

- brouillon ;
- version enregistrée ;
- version active ;
- future version planifiée ;
- version historique.

### Terminé quand P3

Un programme simple et un programme périodisé utilisent le même moteur d’exécution et le même historique.

---

# P4 — Marketplace complète

## P4.1 — Qualifications Coach

Ajouter un contrat durable :

```text
qualification
- coach_id
- title/type
- issuer
- declared_at
- proof reference
- verification_status
- verified_at
- reviewer/admin reference
- expiration if relevant
```

États : déclaré / pending / verified / rejected / expired si nécessaire.

Un Coach reste utilisable sans badge.

## P4.2 — Matching expliqué

Structurer :

### Exigences bloquantes

Exemples : langue obligatoire, format, discipline nécessaire, zone présentielle, budget maximal si offres payantes.

### Préférences importantes

Exemples : fréquence de contact, style, autonomie, expérience spécifique.

### Préférences secondaires

Exemples : options non critiques.

Le moteur renvoie :

- éligible oui/non ;
- correspondances importantes ;
- informations manquantes ;
- raisons explicables.

Ne pas produire un pourcentage arbitraire.

## P4.3 — Prospect dans la messagerie

Raccorder la phase `coach_accepted` à la conversation sans donner accès au dossier complet.

Après `athlete_confirmed`, conserver la continuité du fil lorsque techniquement possible.

## P4.4 — Signalement/modération minimale

Prévoir :

- signaler un profil/comportement ;
- file admin ;
- état du signalement ;
- action tracée.

**Pas d’étoiles/avis Coach.**

### Terminé quand P4

Le parcours complet : questionnaire recherche → shortlist expliquée → demande → Coach accepte → échange → Athlète confirme → client actif fonctionne sans accès prématuré au dossier.

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
