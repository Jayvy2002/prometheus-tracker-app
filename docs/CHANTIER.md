# Chantier — Prometheus

> **RÔLE DE CE DOCUMENT — SOURCE UNIQUE DU TRAVAIL RESTANT**
>
> Ce document contient l’ordre des chantiers, les décisions ouvertes, les fonctionnalités à construire, les problèmes à corriger, les améliorations UX à réaliser et leurs critères de fin.
>
> **Instruction pour les agents :** ne jamais supprimer un élément parce qu’il est supposé, ancien, partiellement présent ou décrit dans la vision. Un élément sort de ce fichier uniquement après preuve de son implémentation et de sa validation, ou après une décision produit explicite de l’abandonner. Ne pas transformer ce fichier en journal de PR ou en inventaire de production. Git conserve l’historique ; le README décrit le produit actuel et `docs/VISION.md` sa destination.

**Mis à jour : 14 septembre 2026.**

Direction de référence : vision marketplace du 12 septembre 2026. La carte [CARTE_PRODUIT.md](CARTE_PRODUIT.md) décrit les parcours cibles et les écarts au code. Ce fichier reste la seule source des **statuts**. Aucun lot M1–M8 n’est livré en production tant qu’il n’a pas sa migration Git, son apply prod et sa preuve de parcours.

## Mode d’emploi

| Statut | Sens |
|---|---|
| **À décider** | Une décision produit empêche de définir correctement le travail. |
| **À concevoir** | Le résultat attendu est connu, mais le parcours ou le contrat reste à préciser. |
| **À construire** | Le besoin et les conditions de fin sont assez précis pour être implémentés. |
| **À vérifier** | Le comportement paraît présent ou a changé ; il faut le prouver dans le parcours réel. |
| **Terminé** | Code, tests nécessaires et parcours attendu ont été vérifiés. L’élément peut être retiré de ce backlog dans le même changement. |

Une CI verte ne prouve pas à elle seule qu’une expérience utilisateur est terminée. Inversement, un élément déjà satisfait par le code ne doit pas être reconstruit : le vérifier, documenter la preuve, puis le retirer.

La priorité `P1/P2/P3` de la feuille de route UX classe les améliorations **à l’intérieur du chantier UX**. Sauf défaut empêchant un parcours essentiel ou corrompant son résultat, les chantiers fonctionnels 1 à 3 restent exécutés avant cette feuille de route, conformément à la décision produit.

## Lots UX — reportés après finalisation fonctionnelle

Décision produit : reprendre les chantiers fonctionnels dans l’ordre général ci-dessous. Les lots UX sont reportés après finalisation fonctionnelle ; leurs tâches inachevées restent conservées ici. Les défauts bloquant une fonctionnalité restent à corriger dans le chantier concerné.

| Lot | Couverture partielle et travail restant | Conditions de fin |
|---|---|---|
| Accessibilité — UX62 | Les boutons Annuler/Fermer des notifications ont une cible minimale de 44 × 44 px et les textes longs peuvent se couper sans masquer ces actions. La vérification tactile en parcours reste à effectuer. Des correctifs de Button, Input, Toast et Modal sont présents dans `new-JV` : focus stable lors des saisies dans une modale, repères de focus visibles et respect du mouvement réduit. Validation navigateur encore nécessaire. Reste à vérifier et compléter les noms accessibles, le focus des modales et tiroirs, la navigation clavier, les annonces, les contrastes, le zoom, le mouvement réduit et le clavier mobile sur les parcours essentiels. | Tests automatisés pertinents et vérification navigateur clavier, lecteur d’écran, zoom et petit écran. Ne pas annoncer une accessibilité complète sur la seule base de composants corrigés. |
| Textes restants — UX11, UX65, UX67 | Une première simplification FR/EN existe dans `new-JV`. Continuer l’inventaire des textes affichés, supprimer les répétitions et remplacer le jargon. Préserver les informations utiles sur confidentialité, limites, effets des actions et erreurs. | Parité FR/EN, libellés cohérents avec les effets réels, revue en contexte des parcours et absence de suppression d’une information nécessaire au choix. |
| Messagerie fiable — UX29–31, UX63, UX68 | Correctifs intégrés à vérifier en parcours : conservation des éditions pendant un envoi, verrou anti-double-clic, sortie de l’attente après exception, retour à la ligne mobile, protection de la composition de texte, dates localisées et défilement de l’historique. Reste à compléter l’isolation des brouillons par compte et conversation, la reprise après erreur, les doubles envois, le défilement lors du chargement de l’historique et les changements de conversation. Vérifier le temps réel, la reconnexion et les états de lecture réellement persistés. | Deux comptes de test : envoi lent puis nouvelle saisie conservée ; échec et réessai sans doublon ; changement de fil sans fuite de brouillon ; historique sans saut ; reconnexion sans message manquant ; écran mobile et saisie avec composition utilisables. |

**Cadrage messagerie :** expérience de conversation intégrée inspirée de Messenger/WhatsApp, pas une connexion à ces services. Les états envoyé, distribué et lu doivent correspondre à des preuves distinctes. Pièces jointes, messages vocaux, recherche dans l’historique, réponses citées, présence et notifications sont à cadrer et prioriser après le socle fiable ; ne pas les considérer comme livrés. Aucun chiffrement de bout en bout n’est promis sans conception et validation dédiées.

**Vérification des derniers correctifs :** typecheck, build et lint ciblé réussis sur la copie locale avec les fichiers concernés actualisés. Le navigateur de test a perdu sa connexion avant les scénarios ; aucun smoke interactif n’est déclaré réussi. Les brouillons ne sont pas encore durables lors d’un changement de conversation ; la reconnexion et les accusés de lecture restent à traiter.

**Statut de validation :** les correctifs UX sont intégrés dans `new-JV`, avec CI et matrice RLS vertes avant merge. Les parcours interactifs restent à vérifier. La revue du code ne remplace pas les tests de comportement et les parcours réels. Conserver les lignes UX concernées tant que leurs critères ne sont pas vérifiés.

## Ordre général

1. **Chantier 2 — continuité, identité et marketplace** (lots M0–M5, puis M7). Livrer **un lot à la fois** : une capacité + une migration Git + apply prod + preuve de parcours.
2. **Chantier 3 — Billing**, **reporté jusqu’à ce que l’app soit prête à ouvrir**. Pas de clientèle aujourd’hui : aucun Stripe, paywall, abonnement ni commission à implémenter. Une demande marketplace « acceptée » ne crée pas de paiement.
3. **UX — vérité des actions et conservation du travail.**
4. **UX — parcours quotidiens coach, coaché et solo.**
5. **UX — autonomie, compréhension et confort.**
6. **Mesure continue de l’utilité**, appliquée aux chantiers au moment de leur réalisation.

Les travaux transversaux sont intégrés à une priorité lorsqu’ils en améliorent le résultat ou corrigent un problème mesuré.

### Règle de livraison (chantier 2)

- Une PR = une capacité observable. Pas de monolithe mélangeant départ, rôles, annuaire et invitations.
- SQL dans `supabase/migrations/` uniquement au merge. `supabase/changes/` n’est pas la production.
- Front et SQL cassant (nouvelle signature RPC) partent **ensemble**, ou en deux temps : ajouter la nouvelle signature, basculer le front, **puis** révoquer l’ancienne.
- `user_roles` reste la source d’écriture tant que M1 n’a pas basculé les droits. L’espace affiché ne donne aucun privilège.
- Réutiliser `transition_client_to_solo` / `end_coach_client_link`. Aucun second moteur de séances.
- Le questionnaire **coach** (#74, `20260911235551`) reste distinct du questionnaire **recherche**.

## Chantier 2 — Marketplace, recherche guidée et relation de coaching

**Décision produit :** un moteur commun, identité durable, capacité coach indépendante de l’accompagnement personnel, marketplace et suivi dans la même application.

**État live (13 sept. 2026) :** invitation coach, fin de lien **côté coach** (`end_coach_client_link`), questionnaire de prise en charge versionné. Pas de départ client autonome, pas de contexte de capacités, pas d’annuaire.

| Ordre | Lot | Statut | Conditions de fin |
|---|---|---|---|
| M0 | Inventaire des appels de rôles / policies vs carte | À construire | Scénarios solo, coaché, coach, coach-athlète recensés. Aucun changement de droits. |
| M1 | Projection compatible de capacités + espaces Personnel/Coaching | À construire | Backfill des coachs existants ; aucun auto-lien ; rollback UI sans supprimer les colonnes. |
| M2a | Départ autonome du client + consistance de la relation | À construire | RPC `client_end_coach_link` ; même `transition_client_to_solo` que le coach ; historique conservé ; notes privées non transférées ; notification minimale au coach ; sérialisation vs une adaptation en cours. |
| M2b | Invitation + consentement versionné | À construire | Nouvelle signature d’acceptation **en plus** de l’ancienne ; bascule du front ; puis révocation de l’ancienne. Périmètre = invitation directe. |
| M3 | Entrée par intention après identité | À construire | Login direct ; pas de rôle avant le formulaire ; OAuth seulement plus tard. |
| M4 | Profils/offres opt-in, prospects | À construire | Un coach gère ses clients **sans** publier ; publication/retrait testés. |
| M5 | Annuaire, comparaison, demandes | À construire | Filtres exacts d’abord ; « demande acceptée » ≠ lien de coaching ; pas de dossier prospect. |
| M6 | Accord, paiement, activation | **Reporté** (billing) | Une seule RPC d’activation, commune à l’invitation. Interdit tant que le chantier 3 n’est pas ouvert. |
| M7 | Accueils contextuels et boucle jusqu’à la suite d’objectif | À concevoir | Trois parcours jusqu’au bilan ; le coach garde l’autorité. |
| M8 | Ouverture graduelle | À concevoir | Pas de lancement large sur CI seule. |

### M2a — détail

Prod a déjà `end_coach_client_link(p_client_id)` **pour le coach** (refus si `p_client_id = auth.uid()`). Il manque :

- RPC `client_end_coach_link()` : `auth.uid()` est le client ; même `transition_client_to_solo` ;
- auteur et date de fin, notification privée au coach, sérialisation vs une adaptation en cours.

Aucun Stripe ni effet d’abonnement dans ce lot.

### M2b — détail

Invitation : plus d’acceptation automatique ; consentement versionné **en plus** de l’ancienne RPC, puis révocation de l’ancienne après bascule du front.

### M4–M5 — détail

- Table `coach_profiles` (opt-in, disciplines, langues, formats, disponibilité).
- Table `coach_join_requests` (pending / accepted / declined / withdrawn).
- Routes `/coaches`, `/coaches/:id`, `/coach/profile`.
- RLS : profils publics lisibles par `authenticated` seulement ; demandes visibles des deux parties.
- **Ne pas** appeler `accept_coach_invite` depuis l’acceptation d’une demande tant que M6 n’existe pas.

### Continuité

- Séparer capacité professionnelle, espace affiché, relation active et entitlement.
- Un client : un coach actif. Après départ : lien terminé, tracking retiré, programme en pause, données personnelles conservées.
- Aucun transfert des notes privées ni des conversations de l’ancien coach.

## Chantier 3 — Billing

**Fermé jusqu’à décision explicite d’ouverture.** Aucun utilisateur payant aujourd’hui. Ne pas poser Stripe, Checkout, webhook, mur d’essai ni commission.

Quand ce chantier s’ouvrira, trancher avant toute ligne de code :

- prix du solo et paliers coach ;
- essai, devise, taxes, expiration ;
- qui encaisse le coaching vs l’accès logiciel ;
- effet d’un départ ou d’un changement de coach.

Le champ `solo_trial_ends_at` existe déjà (cible 30 jours après une fin de lien) **sans mur**. Ne pas en faire une règle commerciale tant que ce chantier n’est pas ouvert.

Le futur mur, s’il existe, devra conserver un accès en lecture aux données et permettre d’accepter une invitation. Un coach au-dessus de son palier conserverait ses clients mais ne pourrait plus en ajouter.

## Travaux transversaux autorisés

À réaliser lorsqu’ils soutiennent une priorité ou corrigent un problème mesuré :

- écran interne de lecture de la télémétrie ;
- historique visuel et restauration des révisions de programme ;
- cycles, semaines, blocs et changements de phase ;
- types de prescription au-delà des répétitions ;
- extension de la file hors ligne à d’autres écritures ;
- optimisation des policies après preuve RLS : notamment fusion éventuelle des policies SELECT permissives seulement après comparaison dans la matrice ;
- activer la protection Supabase Auth contre les mots de passe compromis dès que le plan du projet le permet, puis vérifier les parcours d’inscription et de changement de mot de passe ;
- étude du déplacement de `pg_trgm` et `pg_net` hors de `public`, uniquement sur un environnement de staging avec mesure d’impact ;
- amélioration des performances fondée sur des mesures.

## Règles de livraison

- Une fonctionnalité inclut ses états chargement, vide, erreur et reprise.
- Toute copie visible est disponible en FR et EN.
- Toute écriture critique est atomique ou idempotente selon le cas.
- Une modification RLS ou `SECURITY DEFINER` inclut la matrice de sécurité correspondante.
- Une modification de télémétrie met à jour `docs/TELEMETRY.md` dans le même commit.
- Une migration appliquée n’est jamais réécrite.
- Une proposition IA exige toujours une validation humaine.

## Refonte UX/UI premium (lots 0A–16)

Décision produit : une seule app, un moteur commun, pas de Stripe, pas de second design system. Travailler lot par lot. Ne pas retirer une ligne M1–M8 de ce fichier sans preuve.

| Lot | Statut | Preuve / reste |
|---|---|---|
| **0A** i18n / finition visible | Terminé (code + tests) | Namespace `options.*` FR/EN, `auth.signOut`, repas/genres/set types, dates via `dateLocale`, plus de fallback `Workout`. Tests `optionLabels`, `uxPremium`. « Truc » = donnée prod, pas un bug code. |
| **0B** auth / intention / invite | Terminé (code + tests) | Labels Auth + `autocomplete`, cartes d’intention avec CTA, invitation avec nom/initiales. E-mail de confirmation : action Dashboard, voir [SUPABASE_EMAIL.md](SUPABASE_EMAIL.md). Intake kinesio : 7 écrans conservés (sécurité médicale) + barre sticky déjà en place. |
| **0C** vérité produit | Terminé (code + tests) | Cibles nutritionnelles sans 150/250/65 ; `Terminer` ne coche plus les séries ; confirmation si séries incomplètes ; erreurs techniques filtrées ; ErrorBoundary sans stack. |
| **1** design system | Terminé (code + tests) | Tokens, `PageHeader`, `CardLink`, `EmptyState`, `ErrorState`, `TabList`, `OverflowMenu`, `UnitToggle`. Navigation via `CardLink` / `Link` ; plus de `Card onClick` sur programmes, stats et check-ins. |
| **2** accessibilité | À vérifier | Cibles 44px étendues. `prefers-reduced-motion` annule aussi `animation-delay` : la SideNav ne reste plus à opacity 0. Inventaire 8–11 px encore partiel. Revue lecteur d’écran restante. |
| **3** navigation | Partiel | PR 87 : Aujourd’hui, hub Progression, `NavLink`, FAB safe-area. Alignement audit : `navConfig` unique, onglet coach = Compte (copilote hors tab bar), SideNav groupée, Profil suit l’espace, SoloHub allégé, avatar sticky retiré. Reste UX77 (graphe de routes / SessionShell) et smoke authentifié. |
| **4** dashboard utilisateur | À vérifier | First-run : un CTA (première séance), photos / check-in / questionnaire / intake masqués. Parcours réel à rejouer. |
| **5** Coach Today | À vérifier | Empty « Commence avec ton premier client » + « Créer un lien » confirmé en live (compte audit-coach, 14 sept. 2026). File / sévérité à rejouer avec un roster non vide. |
| **6** Client 360 | Terminé (code + tests) | Header Message 44px + label, `role=tablist`, « depuis ta dernière visite » en tête, 1 reco max, dossier derrière détails. |
| **7** Client setup wizard | Terminé (code + tests) | 4 étapes Comprendre / Suivi / Prise en charge / Vérifier. `handleConfirm` inchangé. Résumé « X recevra ». |
| **8** Messages / Prometheus | Terminé (code + tests) | Séparateurs de date, composer safe-area, retry. Prometheus contextuel. Learned sans cron/round/seen. |
| **9** Marketplace vitrine | Terminé (code) | Cartes + profil public + comparaison en cartes. Pas de prix inventé (`priceOnRequest`). Billing toujours fermé. |
| **10** Programmes / routines / builder | Terminé (code + tests) | Bibliothèque + menu … ; assignation sans premier client auto ; routines = templates ; mapping questionnaire derrière Avancé. |
| **11** Nutrition / workout / scanner | Terminé (code + tests) | CTA Ajouter + réutiliser un repas. Scanner : « Recherche du produit… » / « Produit introuvable ». Inputs séance plus grands + `inputMode`. |
| **12** Progression / photos | Terminé (code + tests) | Hub liens Résumé / Entraînement / Mesures / Historique. Photos Face/Profil/Dos + avant/après. |
| **13** Profil | Terminé (code) | Groupes Profil / Coaching / Préférences / Compte / Avancé. Déconnexion secondary. Timezone coach lisible. |
| **14** PWA / offline / errors | Terminé (code) | Icônes PNG 192/512 + maskable + apple-touch. Notifications SW en PNG. `offline.html` et ErrorBoundary déjà de marque. |
| **15** Performance | À vérifier | `UnitToggle` sorti du render. `dotColor` statique à la place de `color.replace`. Dashboard : fetches déjà groupés ; mesure live restante. |
| **16** Polish global | À vérifier | EmptyState / ErrorState / skeletons, toasts plus longs + pause hover. Revue visuelle live restante. |

## Chantiers 4 à 6 — Feuille de route UX complète

**Statut initial : à vérifier, à concevoir ou à construire selon chaque ligne.**

Cette feuille de route couvre le coach, le client coaché et le solo. Elle a été établie après revue du frontend et des propositions UX disponibles. Elle raisonne sur les chantiers 1 à 3 et les travaux transversaux comme s’ils étaient déjà réalisés, afin de définir la qualité d’usage finale attendue.

Les constats de code datent de la revue du 11 septembre 2026. Avant toute correction, vérifier le comportement sur la branche courante : une ligne peut déjà avoir été satisfaite depuis cette revue. Les critères de réussite décrivent le résultat attendu ; ils ne constituent pas la preuve qu’un test utilisateur a déjà été exécuté.

### Comment lire les priorités

| Niveau | Décision |
|---|---|
| **P1** | À traiter d’abord dans le chantier UX : risque de travail perdu, résultat trompeur, action mal comprise ou blocage fréquent d’un parcours essentiel. |
| **P2** | À traiter ensuite : gain de temps, meilleure compréhension, accès plus direct et réduction de la charge quotidienne. |
| **P3** | À tester avant de construire : personnalisation ou confort dont le bénéfice reste à démontrer. |

La priorité est un jugement produit fondé sur la gravité plausible, la fréquence du parcours et le nombre de rôles concernés. Elle ne repose pas sur des taux d’abandon mesurés. À priorité égale, commencer par les actions les plus fréquentes. Une difficulté d’accessibilité qui empêche réellement une action devient P1.

**Base** : `C` = comportement ou structure constatés dans le code, conséquence UX à confirmer au besoin ; `H` = hypothèse d’amélioration à tester ; `F` = expérience projetée d’un chantier supposé réalisé. `C` ne signifie pas que toute la solution proposée est absente. **Portée** : `I` = interface principalement ; `I+D` = interface avec état durable ou logique métier si nécessaire. Les dépendances techniques indiquées sont des moyens possibles, pas une autorisation à reconstruire le backend.

### 1. Entrée dans l’app et questionnaire

Les parcours d’authentification demandent actuellement un choix de rôle en entrée, sauf contexte d’invitation. Le questionnaire possède déjà des écrans, une progression et une reprise. Il faut améliorer la première expérience sans recréer ces mécanismes.

| ID · priorité · base/portée | Amélioration et bénéfice | Critère de réussite |
|---|---|---|
| **UX01 · P2 · C/I** | **Connexion directe pour les habitués.** Proposer « Se connecter » immédiatement ; demander l’intention coach/coaché/solo lors de l’inscription ou d’un changement volontaire. Utiliser des phrases concrètes pour expliquer les rôles. | Une personne déjà inscrite retrouve son espace sans devoir redéfinir son rôle. |
| **UX02 · P1 · H/I+D** | **Invitation compréhensible jusqu’au bout.** Garder le nom du coach et le contexte pendant connexion, création du compte et questionnaire. Expiration, compte différent ou lien déjà utilisé doivent mener à une action précise. | Aucun cas d’invitation invalide ne se termine dans un écran sans issue ; l’utilisateur sait à quel compte et coach il se rattache. |
| **UX03 · P2 · C+F/I+D** | **Questionnaire progressif par utilité.** Recueillir d’abord le nécessaire à la prochaine action, proposer le complément au moment utile. Regrouper les questions ; afficher une durée estimée seulement si elle a été mesurée. Préserver progression et reprise existantes. | On comprend pourquoi répondre maintenant, ce qui peut attendre et où reprendre ; aucune réponse n’est ressaisie après interruption. |
| **UX04 · P1 · H+F/I+D** | **Expliquer les informations sensibles et leur audience.** Dire pourquoi une question est posée, qui verra la réponse et quelles questions sont facultatives. Ne pas préremplir un ressenti actuel à partir d’une ancienne réponse. | Avant de répondre, la personne peut identifier le destinataire et les conséquences d’un refus sur le service proposé. |
| **UX05 · P2 · F/I+D** | **Résumer avant de terminer.** Montrer les réponses utiles et les engagements de suivi, permettre la correction par rubrique et éviter de répéter ce qui est déjà connu. Pour une nouvelle version du questionnaire, ne redemander que ce qui est nécessaire. | Une correction ne force pas à refaire tout le parcours ; les anciennes réponses gardent leur sens. |
| **UX06 · P3 · H/I** | **Silhouette uniquement comme aide facultative.** Si une sélection de zone corporelle apporte un gain, l’accompagner d’une liste textuelle accessible et d’une option « autre/préciser ». Aucun diagnostic automatique. | En test comparatif, la sélection devient plus claire sans exclure clavier ou lecteur d’écran ; sinon garder la liste simple. |

### 2. Accueil et navigation des trois rôles

Les fonctions solo sont notamment accessibles dans le hub du Profil sur mobile ; l’accueil coach cumule plusieurs groupes de cartes. La présence des fonctions ne garantit pas qu’on les trouve.

Diagnostic et architecture cible (chrome, IA, structure front) : [`AUDIT_NAVIGATION_UX.md`](AUDIT_NAVIGATION_UX.md), revue code du 14 septembre 2026. Ce fichier reste la source des statuts ; l’audit n’ajoute pas de priorité au-dessus des chantiers 1–3.

| ID · priorité · base/portée | Amélioration et bénéfice | Critère de réussite |
|---|---|---|
| **UX07 · P1 · H/I** | **Une action principale selon l’état.** Coach : reprendre le client à traiter. Coaché : ouvrir sa séance ou sa prochaine demande. Solo : reprendre son activité ou son programme. Donner la priorité à une tâche déjà commencée, sans ajouter de rendez-vous artificiel. | Depuis l’accueil, chacun identifie spontanément sa prochaine action ; aucune obligation n’est inventée un jour sans tâche. |
| **UX08 · P2 · C/I** | **Rendre programme et historique trouvables pour le solo.** Tester un accès direct depuis accueil et navigation, avec un espace « Suivi » ou équivalent. Réserver Profil aux informations du compte et préférences. | Trouver son programme ou une séance passée ne nécessite pas de deviner qu’ils se cachent dans Profil. |
| **UX09 · P1 · C/I** | **Préserver le contexte au retour.** Garder recherche, filtres, onglet, position de liste et client courant. Revenir à la file d’origine depuis une fiche ou une intervention. | Un coach traite plusieurs clients successivement sans reconstruire sa sélection après chaque visite. |
| **UX10 · P1 · H/I+D** | **Transformer les états d’attente en orientation utile.** Programme en préparation, bilan envoyé, demande de coaching en attente : expliquer l’état, proposer le bon contact et afficher une échéance seulement si quelqu’un l’a réellement définie. | L’utilisateur sait ce qu’il peut faire maintenant ; aucune fausse date de réponse ni fausse absence de données. |
| **UX11 · P2 · C+F/I** | **Cohérence des mots et des modules.** Employer les mêmes termes pour séance, programme, bilan, brouillon et publication. Expliquer la différence entre un modèle réutilisable et le programme actif. Rendre les modules désactivés compréhensibles sans déplacer les repères à chaque visite. | Une même action porte le même nom entre accueil, détail, notification et retour ; les anciens liens utiles restent orientés correctement. |
| **UX74 · P1 · C/I** | **Une seule source de vérité pour la navigation.** BottomNav, SideNav, SoloHub, hubs Profil et PageTransition recopient des listes divergentes (libellés Accueil/Tableau de bord, workout/workouts, marketplace primaire sur desktop seulement). Extraire un `navConfig` par persona et espace. | Un ajout de destination se fait en un endroit ; mobile et desktop enseignent la même carte avec les mêmes mots. |
| **UX75 · P1 · C/I** | **Le Profil et le chrome suivent l’espace affiché.** `ProfilePage` lit `coachingRole === 'coach'` au lieu de `activeWorkspace` : un dual-rôle en Personnel perd Objectifs et garde le hub marketplace. BottomNav coach n’a pas d’entrée Compte ; le sticky avatar n’existe que si les outils personnels sont disponibles. | Changer d’espace change vraiment Profil et onglets. Un coach mobile atteint langue, déconnexion et offre en un geste. |
| **UX76 · P2 · C/I** | **Chrome de navigation accessible.** Items en `button`+`navigate`, pas de `aria-current`, labels `text-[9px]`, badge messages hors nom accessible, palette ⌘K sans affordance. | Clavier et lecteur d’écran identifient l’onglet actif ; labels lisibles à 200 % de zoom ; cible minimale respectée. |
| **UX77 · P2 · C/I** | **Un graphe de routes, deux shells.** Marketplace a une branche `AppLayout` anticipée dans `App.tsx` ; séance/scanner/recettes vivent hors `AppLayout` via `FullPageLayout` (pas de BottomNav). Extraire gates et carte ; `AppShell` vs `SessionShell`. | Chaque path a une définition ; Recettes n’est plus une session ; une séance immersive a une sortie évidente. |

### 3. Séance : saisie, interruption et bilan

Le code distingue imparfaitement données renseignées et séries réalisées. `WorkoutForm` marque toutes les séries hors échauffement comme terminées à la clôture. La duplication ajoute une série ; elle ne remplit pas simplement la suivante prévue. Le résumé se ferme automatiquement après trente secondes. Ces trois points méritent une vérification de parcours prioritaire.

| ID · priorité · base/portée | Amélioration et bénéfice | Critère de réussite |
|---|---|---|
| **UX12 · P1 · C/I+D** | **Séparer prévu, renseigné, réalisé et non réalisé.** Terminer une séance ne doit pas transformer les séries restantes en travail effectué. Autoriser à finir une séance partielle sans culpabiliser. | Une séance interrompue conserve uniquement les réalisations explicitement confirmées ; le résumé et le coach voient la même chose. |
| **UX13 · P2 · C/I+D** | **Distinguer reprendre les valeurs et ajouter une série.** Le raccourci courant remplit la prochaine ligne prévue ; « Ajouter une série » reste une action distincte et volontaire. | Réutiliser une saisie ne change pas accidentellement le programme ou le nombre de séries. |
| **UX14 · P2 · C/I** | **Saisie adaptée au téléphone.** Clavier approprié, unités visibles, passage logique au champ suivant, action principale accessible malgré le clavier. Tester les incréments seulement s’ils réduisent les erreurs ; garder la saisie directe. | Une édition est conservée après changement de champ ; affichage et enregistrement respectent l’unité choisie. |
| **UX15 · P2 · C/I** | **Repos automatique au choix.** Conserver le démarrage manuel actuel ; proposer une préférence pour lancer le minuteur après confirmation explicite d’une série. Son et vibration sont optionnels et dépendants du support du navigateur. | Aucun minuteur ne démarre à cause d’un simple préremplissage ; le réglage se désactive facilement. |
| **UX16 · P1 · C+F/I+D** | **Reprise et synchronisation en langage courant.** « Enregistré sur cet appareil », « Synchronisation en attente », « Cette modification nécessite une action ». Nommer l’objet concerné et proposer Réessayer. Étendre cette qualité aux autres modules hors ligne supposés livrés. | Après coupure et retour du réseau, on sait ce qui est conservé et partagé, sans lire un type d’opération ou une erreur technique. |
| **UX17 · P1 · C/I** | **Bilan sous le contrôle de l’utilisateur.** Retirer la fermeture automatique, rendre le bilan retrouvable, résumer les faits sans juger une séance sur une durée ou un volume universel. Ne pas afficher une distinction non calculée comme un résultat réel. | Le bilan reste lisible jusqu’à fermeture volontaire ; une séance courte ou partielle n’entraîne pas de pression à en faire davantage. |

### 4. Exercices, programmes et modifications

Le sélecteur possède déjà recherche, détails et détection de ressemblances. L’éditeur dispose déjà d’une simplification pour certaines séances issues d’un programme. Une proposition acceptée peut être ajoutée à l’éditeur sans être encore enregistrée. L’attribution présélectionne le premier client de la liste.

| ID · priorité · base/portée | Amélioration et bénéfice | Critère de réussite |
|---|---|---|
| **UX18 · P2 · C/I** | **Trouver un exercice sans connaître son nom exact.** Exposer clairement matériel, variantes, instructions et synonymes déjà exploités par la recherche. Donner accès aux choix récents pertinents ; création personnelle après les correspondances possibles. | Une personne reconnaît la bonne variante avant sélection et peut revenir sans perdre sa recherche. |
| **UX19 · P2 · H+F/I+D** | **Remplacement d’exercice avec portée explicite.** « Pour cette séance » ou « Proposer un changement du programme », selon les droits. Conserver la raison utile et signaler le changement au coach sans modifier silencieusement les prochaines semaines. | Remplacer aujourd’hui ne réécrit pas le programme futur sans choix explicite. |
| **UX20 · P1 · C/I+D** | **Brouillon, enregistré et actif : trois états lisibles.** Renommer l’ajout IA local « Ajouter au brouillon ». Sauvegarder le brouillon et rendre visible ce qui attend encore une publication ; protéger la sortie avec modifications. | La personne peut dire si son client voit déjà les changements ; quitter et reprendre ne détruit pas le travail. |
| **UX21 · P1 · C/I+D** | **Attribution sans destinataire accidentel.** Depuis une fiche client, conserver sa cible visible ; depuis la bibliothèque, demander un choix explicite. Résumer destinataire, programme, date et éventuel remplacement avant validation. | Aucun premier client arbitraire n’est sélectionné ; une attribution à la mauvaise personne est évitée dans le scénario de test. |
| **UX22 · P2 · F/I+D** | **Semaines, cycles et prescriptions compréhensibles.** Le coach voit la structure complète ; l’athlète voit d’abord sa séance et les consignes utiles. Reporter une séance ou changer de phase explique les conséquences, sans exiger de comprendre l’arborescence. | La séance attendue reste identifiable après report ou changement de semaine ; les formats affichent uniquement leurs champs utiles. |
| **UX23 · P1 · F/I+D** | **Révisions utiles à la décision.** Avant publication ou restauration : différence avant/après, auteur, date d’effet, destinataires et séances affectées. Conserver l’historique réellement effectué. | Le coach comprend exactement ce que restaure une version ; une séance passée ou en cours n’est pas réinterprétée silencieusement. |

### 5. Bilans et relation coach–coaché

L’historique de bilans existe et le coach peut lire des scores, comparer certaines valeurs et ajouter une note privée. L’enjeu est d’alléger l’effort demandé et de rendre visible son utilité.

| ID · priorité · base/portée | Amélioration et bénéfice | Critère de réussite |
|---|---|---|
| **UX24 · P2 · C+H/I+D** | **Donner du sens aux échelles.** Ajouter des repères verbaux clairs aux valeurs ; conserver le sens et la version des anciennes réponses. Ne pas convertir silencieusement une échelle en une autre. | Deux personnes comprennent les extrêmes de façon cohérente ; l’historique ne compare pas des réponses incompatibles. |
| **UX25 · P2 · F/I+D** | **Un suivi aussi léger que possible.** Ne demander que les informations utilisées par le coach ou le solo. Fréquence convenue, champs réellement facultatifs, accès rapide au complément. Aucun ressenti actuel recopié automatiquement. | Chaque champ demandé a une utilité explicable ; l’utilisateur peut signaler qu’un suivi ne lui convient pas. |
| **UX26 · P1 · H/I+D** | **Accusé de réception honnête.** Distinguer « Enregistré », « Transmis au coach » et « Examiné » si ce dernier événement existe. Proposer correction ou complément. Afficher le prochain échange seulement s’il est convenu. | Envoi réussi ne signifie jamais lu ou approuvé ; une réponse réseau lente ne laisse pas croire à un échec définitif. |
| **UX27 · P2 · H/I+D** | **Fermer la boucle du suivi.** Relier la réponse du coach ou un changement de programme au bilan concerné. Expliquer aussi quand aucune modification n’est nécessaire, sans imposer au coach une validation quotidienne supplémentaire. | Le coaché retrouve à quoi a servi son retour et ne doit pas chercher dans plusieurs écrans. |
| **UX28 · P1 · H/I+D** | **Absence de saisie ≠ problème avéré.** Distinguer repos, indisponibilité, donnée manquante et difficulté déclarée. Rendre les messages de relance respectueux et laisser exprimer un empêchement. | Une journée sans saisie ne reçoit pas automatiquement une interprétation négative ou une conclusion de santé. |

### 6. Messagerie

Le texte est déjà conservé après échec d’envoi. En revanche, l’effet de défilement dépend du nombre total de messages ; charger les anciens messages déclenche donc aussi un retour en bas. La saisie reste modifiable pendant un envoi, puis le champ est vidé au succès : le scénario d’un second texte commencé pendant l’attente doit être vérifié.

| ID · priorité · base/portée | Amélioration et bénéfice | Critère de réussite |
|---|---|---|
| **UX29 · P1 · C/I** | **Garder la position de lecture.** Lors du chargement de l’historique, conserver l’ancrage visuel. Pour un nouveau message reçu, aller en bas uniquement si la personne y était déjà ; sinon afficher un repère. | Charger une page ancienne ne renvoie plus au dernier message. |
| **UX30 · P1 · C/I+D** | **Protéger le texte en cours.** Brouillon par conversation ; effacer uniquement le texte effectivement envoyé. Respecter la composition clavier et rendre le comportement Entrée explicite, notamment sur mobile. | Commencer un second message pendant l’envoi du premier ne le fait pas disparaître ; changer de fil préserve le bon brouillon. |
| **UX31 · P1 · C+F/I+D** | **Statut et reprise fiables.** Afficher attente, envoyé et échec au niveau du message ; Réessayer réutilise le même envoi logique. Ne montrer « Lu » que si une preuve réelle le permet. | Coupure réseau et nouvel essai ne créent ni doublon visible ni fausse confirmation de lecture. |
| **UX32 · P2 · H/I+D** | **Contexte directement dans la conversation.** Lier un message à une séance, un bilan ou une proposition, avec un résumé compréhensible et un retour au fil. | Coach et client identifient l’objet discuté sans recopier ses détails. |

### 7. Travail quotidien du coach

La file regroupe déjà des alertes par client et utilise une hiérarchie. Le besoin est de mieux expliquer l’urgence et d’achever le traitement sans perdre le contexte, pas d’ajouter une deuxième file concurrente. La fiche client contient un questionnaire détaillé et de nombreuses rubriques.

| ID · priorité · base/portée | Amélioration et bénéfice | Critère de réussite |
|---|---|---|
| **UX33 · P1 · C+H/I+D** | **Une file de travail expliquée.** Pour chaque client : pourquoi il apparaît, depuis quand, ce qui est nouveau et une action pertinente. Utiliser texte et pictogramme en plus de la couleur ; dédupliquer les sollicitations portant sur la même situation. | Le coach comprend la priorité sans ouvrir chaque fiche ; des données manquantes ne sont pas présentées comme des certitudes. |
| **UX34 · P2 · H/I+D** | **Traiter, différer ou classer sans se répéter.** Prévoir un statut utile, un report choisi et une remise en file seulement lorsqu’un fait nouveau le justifie. Reprendre le client suivant depuis la même sélection. | Une alerte déjà traitée ne réapparaît pas immédiatement sans explication ; les reports ne cachent pas les nouvelles informations importantes. |
| **UX35 · P2 · C+H/I** | **Fiche 360 centrée sur ce qui a changé.** Mettre en tête dernier échange, prochain événement, changements récents et contexte pertinent. Ranger le questionnaire complet et l’historique détaillé dans des sections accessibles. | Répondre à un bilan courant ne nécessite pas de relire le dossier entier. |
| **UX36 · P2 · C+H/I** | **Recherche et filtres directement manipulables.** Nom, état du suivi, programme, éléments non traités ; montrer les filtres actifs et un bouton d’effacement. Les demandes en langage naturel produisent des filtres visibles et éditables. | Le coach comprend pourquoi un client apparaît ou manque dans la liste. |
| **UX37 · P2 · C+F/I+D** | **Voir la charge imposée au client avant d’envoyer.** Depuis setup et réglages de suivi, prévisualiser les écrans, champs et fréquence reçus par le client. Distinguer préférences générales et exception individuelle. | Le coach ne découvre pas après coup qu’il a activé des demandes inutiles ; une modification générale annonce son périmètre. |
| **UX38 · P3 · H/I+D** | **Actions groupées limitées et contrôlables.** Commencer par classement ou report. Pour les messages, montrer destinataires et aperçu individualisé ; ne pas valider en masse des adaptations de programme nécessitant un jugement individuel. | Le gain de temps est démontré sans hausse des erreurs de destinataire ou de contenu. |

### 8. Questionnaire personnalisable du coach — projection

Le builder et son aperçu sont considérés comme livrés. Ces items ajoutent une qualité d’usage à cette base, sans redemander sa construction.

| ID · priorité · base/portée | Amélioration et bénéfice | Critère de réussite |
|---|---|---|
| **UX39 · P2 · F/I** | **Commencer par adapter un bon modèle.** Favoriser modifier/retirer/réordonner des questions utiles plutôt qu’une page vide. Montrer les questions redondantes et l’usage attendu de chaque réponse. | Un coach peut préparer un questionnaire court sans maîtriser une structure technique. |
| **UX40 · P2 · F/I** | **Aperçu qui révèle l’effort demandé.** Tester mobile, deux langues, réponses manquantes et branches conditionnelles si disponibles. Montrer nombre d’écrans et de questions obligatoires. | L’aperçu correspond au parcours reçu et révèle une traduction manquante avant publication. |
| **UX41 · P1 · F/I+D** | **Publication sans surprise pour les clients existants.** Expliquer qui reçoit la nouvelle version, ce qui reste valide et si un complément sera demandé. Éviter une notification pour chaque petite correction de présentation. | Publier une version ne force pas tous les clients à recommencer leur dossier. |

### 9. IA et autonomie du solo

Le copilote possède des suggestions de demandes, un historique local et des propositions nécessitant une décision humaine. Certaines actions « envoyer » peuvent aussi modifier un programme. L’écran des apprentissages permet déjà désactivation et suppression ; l’amélioration porte sur la compréhension de leur effet.

| ID · priorité · base/portée | Amélioration et bénéfice | Critère de réussite |
|---|---|---|
| **UX42 · P1 · C/I** | **Client et programme toujours visibles.** Avant une demande ou une proposition, afficher la cible et permettre sa correction. En cas d’ambiguïté, demander le choix. Les exemples de prompts ne doivent pas lancer une action inattendue. | Le coach peut vérifier sur qui porte la demande sans relire son texte libre. |
| **UX43 · P1 · C/I+D** | **Prévisualiser les effets, pas seulement le texte.** Séparer réponse informative, préparation de brouillon, modification du programme et message au client. Expliquer données utilisées, inconnues et portée de la validation. | « Envoyer » ne masque pas une modification de programme ; l’utilisateur comprend ce qui sera visible et quand. |
| **UX44 · P2 · C+F/I+D** | **Une attente IA que l’on peut quitter.** Conserver demande et résultat, permettre de revenir, relancer sans double action et continuer manuellement en cas d’échec. N’afficher des étapes ou un pourcentage que s’ils correspondent à un état réel. | Une génération lente ne bloque pas toute l’app et ne fait pas perdre le travail. |
| **UX45 · P2 · H+F/I** | **Solo : aide au bon endroit, détails à la demande.** Depuis le programme ou une séance, permettre de comprendre les consignes et demander une proposition liée au contexte. Rendre les réglages avancés découvrables sans imposer un second mode complet à configurer. | L’essentiel reste utilisable sans connaître le vocabulaire de préparation ; aucune suggestion n’est appliquée sans choix. |
| **UX46 · P2 · C/I+D** | **Apprentissages IA en langage humain.** Présenter ce qui a été retenu, sa source, son périmètre et son usage possible ; rendre correction et désactivation déjà disponibles compréhensibles. | Une préférence attribuée à tort peut être identifiée et désactivée sans lire des clés techniques. |

### 10. Calendrier, historique et indicateurs

Le calendrier consulte une séance unique dans le détail d’une journée alors que le cas de plusieurs séances doit être géré ; certains marqueurs ne chargent qu’une fenêtre de dates. Ces situations doivent être vérifiées avec les données autorisées par le produit. Les statistiques proposent déjà des périodes, mais une absence de données ne doit pas produire une interprétation trompeuse.

| ID · priorité · base/portée | Amélioration et bénéfice | Critère de réussite |
|---|---|---|
| **UX47 · P2 · F/I+D** | **Un calendrier qui aide à agir.** Distinguer prévu, reporté, commencé et terminé ; ouvrir directement l’élément et expliquer les conséquences d’un report. | Une modification du planning ne fait pas disparaître une réalisation passée ni perdre la prochaine séance. |
| **UX48 · P1 · C/I+D** | **Détail journalier complet et honnête.** Montrer tous les éléments autorisés d’une journée. Distinguer absence réelle, chargement hors fenêtre et erreur. Empêcher qu’une réponse tardive réaffiche le jour précédent. | Deux séances le même jour restent accessibles ; naviguer dans des dates anciennes n’affiche pas un faux vide. |
| **UX49 · P2 · C+H/I** | **Indicateurs compréhensibles sans jugement automatique.** Afficher période, source, quantité de données disponibles et sens de la comparaison. Choisir les indicateurs utiles à l’utilisateur ; une hausse n’est pas universellement positive. | Une donnée manquante n’est pas un zéro et une comparaison insuffisamment documentée n’est pas présentée comme une conclusion. |
| **UX50 · P2 · H/I+D** | **Revenir à l’événement qui explique un graphique.** Relier l’historique aux séances et notes concernées ; permettre de retrouver et corriger une erreur de saisie dans le respect du programme et des droits. | Depuis un point de suivi, on retrouve son origine et comprend pourquoi il est affiché. |

### 11. Alimentation, recettes et données personnelles sensibles

La recherche distingue déjà favoris, récents, base et source externe par des icônes. Cela ne vaut pas certification. Ici les propositions portent sur compréhension, confidentialité et organisation pratique ; elles ne visent ni davantage de comptage, ni des objectifs corporels, ni des incitations à compenser. Les photos restent facultatives.

| ID · priorité · base/portée | Amélioration et bénéfice | Critère de réussite |
|---|---|---|
| **UX51 · P2 · C/I** | **Provenance explicite des informations alimentaires.** Remplacer les seules icônes par un libellé compréhensible et préciser ce qui est connu ou incomplet. Employer « source… » plutôt que « certifié » sans validation correspondante. | L’utilisateur distingue donnée fournie par une source et information effectivement vérifiée. |
| **UX52 · P2 · H/I+D** | **Information incertaine ou produit introuvable : une issue simple.** Permettre signalement, correction personnelle et poursuite sans obligation de compléter une fiche. La lecture d’un code ne doit pas être la seule entrée. | Un produit absent ou un appareil sans permission caméra ne bloque pas l’usage général. |
| **UX53 · P2 · H/I** | **Recettes conçues pour préparer un repas.** Mettre en avant ingrédients, étapes, temps disponible et contraintes choisies ; faciliter retrouver une recette enregistrée. Garder un vocabulaire neutre. | Une personne peut choisir et suivre une recette sans devoir comprendre un tableau de mesures. |
| **UX54 · P1 · C+H/I+D** | **Contrôle des photos et suivis sensibles.** Expliquer qui peut voir, rendre ces modules facultatifs, afficher progression/échec de transfert et les conséquences de suppression. Sans notation d’apparence ni comparaison imposée. | Avant transfert, la personne connaît l’audience ; masquer ou ne pas utiliser ce module n’empêche pas les parcours essentiels. |

### 12. Trouver, rejoindre, quitter ou changer de coach — projection

L’annuaire, les demandes et le départ autonome sont supposés fonctionnels. L’objectif supplémentaire est une décision éclairée et une transition continue.

| ID · priorité · base/portée | Amélioration et bénéfice | Critère de réussite |
|---|---|---|
| **UX55 · P2 · F/I+D** | **Comparer sur des critères utiles.** Disponibilité, langue, modalités, spécialités déclarées, contenu du service et prix lorsqu’il s’applique. Expliquer la portée de toute vérification ; éviter un classement opaque présenté comme une recommandation objective. | L’utilisateur comprend ce qu’il obtiendra avant de demander un accompagnement. |
| **UX56 · P1 · F/I+D** | **Demande avec état et prochaine étape.** Demandé, accepté, refusé, expiré ou retiré ; éviter les doublons et permettre de retirer sa demande. Ne pas promettre un délai non convenu. | On retrouve l’état sans renvoyer plusieurs fois une demande identique. |
| **UX57 · P1 · F/I+D** | **Départ expliqué avant confirmation.** Présenter ce qui reste accessible, ce qui ne sera plus partagé, le devenir des messages et programmes et l’éventuel effet commercial. Ne pas faire croire que rompre le lien résilie automatiquement un abonnement si ce n’est pas vrai. | L’utilisateur peut anticiper ses accès et paiements après le départ sans contacter le support. |
| **UX58 · P1 · F/I+D** | **Continuité vers le solo ou un nouveau coach.** Conserver l’historique permis, identifier un programme en pause, proposer une reprise claire. Choisir explicitement les informations transmises au nouveau coach. | Changer de rôle ne renvoie pas à un démarrage vide et ne partage pas silencieusement l’ancien dossier. |

### 13. Abonnements et limites — projection

Le billing est supposé livré selon le modèle produit choisi. Les propositions ci-dessous ne présument ni prix ni formule commerciale.

| ID · priorité · base/portée | Amélioration et bénéfice | Critère de réussite |
|---|---|---|
| **UX59 · P1 · F/I** | **Offre et limites expliquées avant engagement.** Montrer ce qui est inclus, à qui s’applique la limite, fréquence de facturation et date d’effet. Afficher une limite avant le travail susceptible d’être bloqué. | Un coach n’apprend pas après préparation complète qu’il ne peut pas terminer l’action ; le client sait qui paie quoi. |
| **UX60 · P1 · F/I+D** | **Paiement en attente ou échoué sans perte de travail.** Garder le brouillon et distinguer abandon du paiement, confirmation en cours et échec. Une reprise ramène à l’action interrompue. | Aucun double paiement demandé parce que le retour de confirmation est lent ; le travail préparé est toujours accessible. |
| **UX61 · P1 · F/I+D** | **Gestion autonome de l’abonnement.** Trouver factures, moyen de paiement, changement de formule et résiliation. Montrer la date d’effet et les conséquences d’un dépassement ou d’une baisse de formule. | La sortie est aussi trouvable que l’entrée et aucune suppression de données n’est une surprise. |

### 14. Qualité transversale, réglages et aide

Il existe déjà des améliorations d’accessibilité, des états de notifications, des réglages de langue et des protections de suppression. Il faut vérifier la cohérence du parcours complet et combler les cas précis restants.

| ID · priorité · base/portée | Amélioration et bénéfice | Critère de réussite |
|---|---|---|
| **UX62 · P1 · C+H/I** | **Actions essentielles accessibles.** Labels persistants, focus visible, ordre clavier, lecteur d’écran, contrastes, zoom, mouvement réduit et cibles tactiles confortables. Vérifier formulaires, modales et tiroirs, pas seulement les composants isolés. | Connexion, séance, message et publication restent réalisables sans souris et avec le texte agrandi ; aucun bouton principal masqué par le clavier. |
| **UX63 · P1 · C+F/I+D** | **Erreurs et sauvegardes cohérentes.** Message près de l’action, distinction local/serveur/partagé, correction proposée, champs conservés. Ne jamais convertir un échec de chargement en écran vide ou en nouveau document silencieux. | Chaque parcours critique survit à un échec réseau sans fausse réussite ni perte des valeurs saisies. |
| **UX64 · P2 · C+H/I+D** | **Notifications utiles et maîtrisables.** Demander la permission au moment où leur bénéfice est clair ; fréquence, horaires silencieux et pause. Distinguer permission navigateur et abonnement opérationnel. Regrouper et supprimer les rappels devenus inutiles. | Un rappel ouvre l’objet concerné ; une tâche terminée n’est plus relancée et un état en cours de vérification ne s’affiche pas comme actif. |
| **UX65 · P2 · C/I+D** | **Réglages compréhensibles dans les deux langues.** Vérifier libellés, dates, unités, aide, messages d’erreur et notifications. Remplacer la saisie brute de fuseau horaire par une sélection lisible. Expliquer quand un réglage prend effet. | Changer langue ou unité ne modifie pas la donnée réelle ; le fuseau choisi peut être vérifié par une heure locale affichée. |
| **UX66 · P2 · H+F/I+D** | **Confidentialité et sortie du compte trouvables.** Regrouper audience des données, préférences et gestion du compte. Si un export est prévu ou ajouté, dire ce qu’il contient et quand il sera disponible. Expliquer suppression et liens actifs avant confirmation. | L’utilisateur trouve comment reprendre le contrôle de ses données sans devoir écrire au support ; aucune fausse promesse d’effacement instantané. |
| **UX67 · P2 · H/I+D** | **Aide liée à ce qui bloque.** Petites explications là où elles servent, contact depuis le contexte d’erreur et référence technique copiable séparément. Une introduction peut être passée et retrouvée. | On peut demander de l’aide sans recopier tout son parcours ni transmettre par défaut ses données sensibles. |
| **UX68 · P1 · C+H/I** | **Réactivité sur le parcours réel.** Garder une interface stable pendant chargement, laisser lire les données déjà disponibles avec leur fraîcheur, éviter les clics perdus et actions doubles. Mesurer sur téléphone et réseau contraint. | L’action confirme immédiatement sa prise en compte ; chargements et reprises n’effacent pas contexte ou brouillon. Aucun gain chiffré n’est affirmé avant mesure. |
| **UX69 · P3 · H/I+D** | **Personnalisation mesurée de l’accueil.** Permettre au plus quelques raccourcis ou modules favoris si la navigation par défaut ne suffit pas. Ne pas faire configurer un tableau de bord avant d’utiliser l’app. | Le test montre moins de recherche sans imposer un nouveau travail de configuration. |
| **UX70 · P2 · F/I+D** | **Mesurer l’utilité, pas le temps passé.** Avec les outils de télémétrie supposés disponibles, suivre réussite d’une tâche, erreurs corrigées, reprises et demandes d’aide. Compléter par observation des trois rôles, avec données de test. | On sait si une modification facilite effectivement une tâche ; aucun contenu de message, réponse sensible ou photo n’est nécessaire à ces mesures. |

### Décisions de cadrage issues de la revue UX

| Suggestion étudiée | Décision et nuance |
|---|---|
| Regrouper le questionnaire en phases, montrer la progression | Oui au regroupement utile. Progression et reprise existent déjà ; ne pas les recréer. Ne pas imposer exactement trois phases à tous les questionnaires. UX03–05. |
| Silhouette de localisation | Option P3 à comparer à une liste accessible ; pas un prérequis à une bonne entrée dans l’app. UX06. |
| Expliquer les questions sensibles | Oui, en précisant l’audience et le caractère facultatif. UX04. |
| Remplacer les notes brutes par des mots ou visuels | Ajouter des repères sémantiques ; préserver le sens des historiques. Les emojis seuls ne suffisent pas. UX24. |
| Confirmer l’envoi et donner la prochaine revue | Oui à l’accusé de réception. Date seulement si réelle ; envoyé, reçu et examiné ne sont pas synonymes. UX26. |
| Donner une action lorsqu’aucun programme n’est prêt | Oui ; distinguer préparation, non-attribution et erreur de chargement. UX10. |
| Cartes avant/après pour l’IA | Oui, avec portée, destinataire et date d’effet. La présentation seule ne suffit pas. UX20, UX23, UX43. |
| Traduire un changement énergétique en équivalence alimentaire | Non retenu. Préférer une aide pratique et neutre sur les repas, sans prescriptions de compensation ni incitation au comptage. UX51–53. |
| Mode simple/avancé | Préférer l’affichage progressif des détails. Une simplification existe déjà pour certaines séances ; éviter deux expériences parallèles difficiles à maintenir. UX14, UX22, UX45. |
| Duplication et boutons d’incrément | La duplication existe. Séparer remplir la prochaine série prévue et en ajouter une ; tester les incréments avant généralisation. UX13–14. |
| Repos automatique et vibration | La vibration existe déjà selon support. Le repos est actuellement manuel : automatisation volontaire, déclenchée par une réalisation explicite. UX15. |
| Badge vérifié/communauté | Provenance explicite oui ; certification implicite non. UX51. |
| Portions habituelles, favoris et récents | Favoris et récents sont déjà distingués. Pas de chantier d’intensification du suivi alimentaire proposé ici ; priorité à la lisibilité des sources et à l’usage pratique des recettes. UX51–53. |
| Alertes coach hiérarchisées | La hiérarchie et le regroupement existent. Ajouter explication, état de traitement et continuité. UX33–35. |
| Traitement groupé | P3, sur actions adaptées ; aucune validation aveugle de recommandations individuelles. UX38. |

### Ordre d’exécution conseillé après les chantiers existants

Ne pas lancer 70 changements à la fois. Transformer les lignes pertinentes en petits lots de parcours. À chaque lot, comparer à l’état réellement livré : si le chantier antérieur satisfait déjà un critère, le marquer couvert et ne pas réimplémenter.

| Ordre | Lot | Contenu prioritaire et raison |
|---|---|---|
| **1** | Vérité des actions et travail conservé | UX12, 16, 17, 20, 21, 23, 29–31, 42–43, 48, 63. Corriger d’abord les erreurs de résultat, la perte de texte et les effets ambigus. |
| **2** | Parcours quotidien de bout en bout | UX07, 09–10, 13–15, 18–19, 22, 26–28, 33–37, 62, 68, 74–77. Entrer, agir, terminer, revenir à la suite. Chrome et carte mentale se corrigent ici, pas dans un lot « design » isolé. Les défauts d’accessibilité bloquants se corrigent dès le lot 1. |
| **3** | Entrée et transitions sans surprise | UX01–05, 39–41, 54–61. Questionnaire, demande, changement de relation et abonnement : vérifier les parcours finaux supposés livrés. Une ambiguïté de destinataire ou de paiement avérée remonte au lot 1. |
| **4** | Valeur durable et autonomie | UX08, 11, 24–25, 32, 44–47, 49–53, 64–67, 75. Retrouver, comprendre, se faire aider et maîtriser ses réglages. |
| **5** | Optimisations à prouver | UX06, 38, 69. Prototyper, observer, puis garder seulement ce qui apporte un gain. |
| **Continu** | Mesure de l’utilité | UX70 dès le début avec les outils existants ; pas un projet préalable de télémétrie à reconstruire. |

Les lots expriment un ordre de travail par parcours ; les priorités P1/P2/P3 restent le critère d’arbitrage entre défauts concrets. Une projection P1 ne signifie pas qu’un défaut existe déjà dans une fonctionnalité future.

### Vérifier que l’expérience s’améliore réellement

Utiliser des comptes et données de test pour ces scénarios. Ils décrivent des critères futurs, pas des résultats obtenus durant cette revue.

| Rôle | Scénario représentatif | Observer |
|---|---|---|
| Coach | Depuis une liste filtrée, ouvrir un bilan, préparer une réponse, modifier un brouillon, publier puis revenir au client suivant | Conservation du contexte, bonne cible, différence comprise entre brouillon et actif, absence de double traitement. |
| Coaché | Suivre une invitation, répondre partiellement, reprendre, attendre le programme, ouvrir une séance et finir avant toutes les séries prévues | Compréhension de la prochaine étape, absence de ressaisie, données réelles correctement restituées. |
| Solo | Retrouver son programme, consulter une consigne, interrompre une séance, revenir hors ligne puis consulter son historique | Fonctions trouvables, autonomie, reprise fidèle et absence de jugement automatique. |
| Coach et coaché | Envoyer un message lent, commencer le suivant et charger l’historique | Pas de texte effacé, pas de saut de lecture, état d’envoi honnête. |
| Tous | Réseau perdu, session expirée, petit écran, clavier ouvert, lecteur d’écran, texte agrandi, FR puis EN | Parcours essentiel toujours faisable et issue compréhensible. |
| Transitions futures | Demande de coach retirée, changement de coach, retour solo, paiement en attente puis changement de formule | Aucun accès, partage, paiement ou historique surprenant. |

Mesurer le succès sans assistance, les erreurs et retours en arrière, la récupération après interruption et la compréhension du résultat. Relever durée et interactions pour comparer avant/après, pas pour pousser l’utilisateur à passer plus de temps dans l’app. Établir une référence avant de fixer des objectifs chiffrés. Tester auprès de personnes représentant chaque rôle ; un test synthétique ou une CI verte ne remplace pas cette observation.

Pour les formulaires, les recommandations de regroupement, progression et conservation des réponses suivent les principes décrits par le [W3C sur les formulaires en plusieurs pages](https://www.w3.org/WAI/tutorials/forms/multi-page/). Pour les contrôles, vérifier les [cibles minimales et exceptions WCAG 2.2](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html) ; une cible tactile plus confortable reste un choix de conception, pas une fausse citation du minimum. Les confirmations doivent aussi être perceptibles aux technologies d’assistance selon les [messages de statut du W3C](https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html).
