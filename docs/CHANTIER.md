# Chantier — Prometheus

> **RÔLE DE CE DOCUMENT — SOURCE UNIQUE DU TRAVAIL RESTANT**
>
> Ce document contient l’ordre des chantiers, les décisions ouvertes, les fonctionnalités à construire, les problèmes à corriger, les améliorations UX à réaliser et leurs critères de fin.
>
> **Instruction pour les agents :** ne jamais supprimer un élément parce qu’il est supposé, ancien, partiellement présent ou décrit dans la vision. Un élément sort de ce fichier uniquement après preuve de son implémentation et de sa validation, ou après une décision produit explicite de l’abandonner. Ne pas transformer ce fichier en journal de PR ou en inventaire de production. Git conserve l’historique ; le README décrit le produit actuel et `docs/VISION.md` sa destination.

**Mis à jour : 13 septembre 2026.**

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

Décision produit : reprendre les chantiers fonctionnels dans l’ordre général ci-dessous. Les lots UX sont reportés après finalisation fonctionnelle ; leurs tâches inachevées restent conservées ici. La direction marketplace confirme que l’UX minimale est une condition de chaque livraison : texte utile, choix clair, mobile, accessibilité, FR/EN et reprise après erreur. Les optimisations générales restent reportées ; les défauts du parcours livré sont corrigés dans le chantier concerné.

| Lot | Couverture partielle et travail restant | Conditions de fin |
|---|---|---|
| Accessibilité — UX62 | Les boutons Annuler/Fermer des notifications ont une cible minimale de 44 × 44 px et les textes longs peuvent se couper sans masquer ces actions. La vérification tactile en parcours reste à effectuer. Des correctifs de Button, Input, Toast et Modal sont présents dans `new-JV` : focus stable lors des saisies dans une modale, repères de focus visibles et respect du mouvement réduit. Validation navigateur encore nécessaire. Reste à vérifier et compléter les noms accessibles, le focus des modales et tiroirs, la navigation clavier, les annonces, les contrastes, le zoom, le mouvement réduit et le clavier mobile sur les parcours essentiels. | Tests automatisés pertinents et vérification navigateur clavier, lecteur d’écran, zoom et petit écran. Ne pas annoncer une accessibilité complète sur la seule base de composants corrigés. |
| Textes restants — UX11, UX65, UX67 | Une première simplification FR/EN existe dans `new-JV`. Continuer l’inventaire des textes affichés, supprimer les répétitions et remplacer le jargon. Préserver les informations utiles sur confidentialité, limites, effets des actions et erreurs. | Parité FR/EN, libellés cohérents avec les effets réels, revue en contexte des parcours et absence de suppression d’une information nécessaire au choix. |
| Messagerie fiable — UX29–31, UX63, UX68 | Correctifs intégrés à vérifier en parcours : conservation des éditions pendant un envoi, verrou anti-double-clic, sortie de l’attente après exception, retour à la ligne mobile, protection de la composition de texte, dates localisées et défilement de l’historique. Reste à compléter l’isolation des brouillons par compte et conversation, la reprise après erreur, les doubles envois, le défilement lors du chargement de l’historique et les changements de conversation. Vérifier le temps réel, la reconnexion et les états de lecture réellement persistés. | Deux comptes de test : envoi lent puis nouvelle saisie conservée ; échec et réessai sans doublon ; changement de fil sans fuite de brouillon ; historique sans saut ; reconnexion sans message manquant ; écran mobile et saisie avec composition utilisables. |

**Cadrage messagerie :** expérience de conversation intégrée inspirée de Messenger/WhatsApp, pas une connexion à ces services. Les états envoyé, distribué et lu doivent correspondre à des preuves distinctes. Pièces jointes, messages vocaux, recherche dans l’historique, réponses citées, présence et notifications sont à cadrer et prioriser après le socle fiable ; ne pas les considérer comme livrés. Aucun chiffrement de bout en bout n’est promis sans conception et validation dédiées.

**Vérification des derniers correctifs :** typecheck, build et lint ciblé réussis sur la copie locale avec les fichiers concernés actualisés. Le navigateur de test a perdu sa connexion avant les scénarios ; aucun smoke interactif n’est déclaré réussi. Les brouillons ne sont pas encore durables lors d’un changement de conversation ; la reconnexion et les accusés de lecture restent à traiter.

**Statut de validation :** les correctifs UX sont intégrés dans `new-JV`, avec CI et matrice RLS vertes avant merge. Les parcours interactifs restent à vérifier. La revue du code ne remplace pas les tests de comportement et les parcours réels. Conserver les lignes UX concernées tant que leurs critères ne sont pas vérifiés.

## Ordre général

**Direction de référence : vision détaillée du propriétaire du 12 septembre 2026.** La carte [CARTE_PRODUIT.md](CARTE_PRODUIT.md) décrit les parcours, les écrans, les écarts au code et les contrats de permissions. Ce Chantier reste la source unique des statuts et priorités.


1. **Marketplace : recherche guidée, mise en relation, départ et changement de coach.**
2. **Billing**, après décision sur les prix et les règles d’essai.
3. **UX — vérité des actions et conservation du travail.**
4. **UX — parcours quotidiens coach, coaché et solo.**
5. **UX — autonomie, compréhension et confort.**
6. **Mesure continue de l’utilité**, appliquée aux chantiers au moment de leur réalisation.

Les travaux transversaux sont intégrés à une priorité lorsqu’ils en améliorent le résultat ou corrigent un problème mesuré.

## Chantier 2 — Marketplace, recherche guidée et relation de coaching

### État d’implémentation — PR #75, non livrée

**M0 — inventaire reproductible ajouté à la CI.** Le script `inventory-account-access.mjs` recense les sites d’appel liés aux rôles dans le frontend et les Edge Functions, ainsi que les policies effectives et les droits d’exécution des fonctions concernées sur la base isolée. Les advisors avant/après candidats sont archivés avec cet inventaire. Ce relevé sert à la revue sémantique de la bascule ; il ne vaut pas à lui seul validation de tous les droits.

**M1 — contexte de compte, partiel.** Les routes principales et helpers partagent une projection compatible. Le candidat `account_capabilities.sql` ajoute la capacité professionnelle, reprend les coachs existants et expose un contexte serveur limité au compte authentifié. Le frontend vérifie l’identité et la forme de cette réponse ; il utilise l’ancien accès seulement si la nouvelle RPC n’est pas installée. Une erreur réseau ou un refus ne déclenche pas ce repli. Un coach dont la capacité est confirmée peut choisir un espace Personnel ou Coaching ; le choix est isolé par compte, ne crée aucun droit et pilote accueil, navigation et abonnements temps réel. Les anciennes règles d’accès restent en vigueur ; `user_roles` reste la source d’écriture pendant cette phase compatible.

Le parcours navigateur de la base isolée vérifie le passage Personnel/Coaching, l’accès du coach à ses outils d’entraînement, la conservation au rechargement et l’isolation de la préférence entre deux comptes. Le contexte serveur est revérifié au retour dans l’app, à la reconnexion et toutes les 30 secondes pendant son utilisation ; les signaux simultanés sont regroupés et les réponses d’une session terminée restent rejetées. Le choix d’espace se synchronise aussi entre onglets du même compte. Restent : inventaire exhaustif des prédicats frontend/SQL/IA, bascule complète des capacités et validation élargie des mutations distantes et parcours de changement de compte. Ne pas annoncer la migration de rôles terminée à partir de la seule table de compatibilité.

**M2 — socle de départ validé sur base isolée, non livré.** Les deux initiateurs passent par la même transition SQL : lien verrouillé, programme mis en pause, historique conservé, suivi du coach retiré. La notification privée au coach est durable et son accusé de lecture idempotent. Un enregistrement minimal conserve l’auteur et la date de chaque fin, y compris après une nouvelle relation. Le départ ne retire pas la capacité professionnelle du client lorsqu’il est également coach.

Preuve du [run 34728810721](https://github.com/Jayvy2002/prometheus-tracker-app/actions/runs/34728810721) : vérification générale, matrice historique, candidats SQL et navigateur réussis. Le navigateur couvre questionnaire/version figée, départ malgré un rafraîchissement en panne, retour solo immédiat puis rechargé, notification et accusé persisté, deux départs concurrents et réponse tardive après changement de compte. Deux connexions PostgreSQL vérifient aussi départ contre adaptation : une adaptation antérieure finit avant le départ ; une adaptation retardée est refusée sans écriture partielle. Une invitation vers un autre coach est refusée tant que le départ précédent n’est pas validé ; un réessai explicite fonctionne ensuite avec un seul coach actif et sans transfert des notes privées. La matrice historique est rejouée aussi après installation des trois candidats.

Le test a révélé un cache de service worker qui conservait des réponses API sur les domaines locaux/personnalisés. Le cache est désormais limité aux ressources publiques de même origine, exclut les requêtes authentifiées et purge l’ancienne version. Le parcours navigateur vérifie cette exclusion avec un service worker actif. Les tests généraux comptent 453 réussites au dernier contrôle local. Un test du store réel couvre aussi les écritures de profil et l’avatar : réponses d’un ancien compte ignorées, doubles écritures refusées, fin de coaching conservée pendant une sauvegarde et erreurs d’upload réessayables sans faux succès. Ce test utilise un transport simulé et ne prouve pas une écriture Storage en production.

**Dossier ouvert — révocation côté interface validée sur base isolée, non livrée.** Les routes du dossier client et de préparation vérifient le lien actif avant de monter leur contenu. Elles retirent le contenu sur panne, passage hors ligne ou changement d’onglet, puis revérifient au retour ; abonnement temps réel et contrôle périodique de 30 secondes complètent cette vérification. Les lectures tardives ne rouvrent pas un accès invalidé. Les conversations archivées ne sont pas supprimées. Les URL de fichiers déjà signées restent valables jusqu’à leur expiration : cette limite reste à traiter. Tests unitaires et scénario navigateur réussis dans le run 34752996019.

**Invitation explicite — validée en navigateur sur base isolée.** Ouvrir un lien ou se connecter ne doit plus accepter automatiquement la relation. La branche ajoute l’explication du partage, la confirmation, l’annulation sans acceptation et une erreur de prévisualisation réessayable. Le scénario du même run prouve panne/réessai de prévisualisation, annulation puis rechargement sans relation créée et une seule acceptation confirmée.

**Consentement d’invitation directe — validé sur base isolée, non livré.** L’acceptation transmet une version et la liste annoncée des catégories de données. Le serveur refuse une version obsolète, un périmètre incomplet et l’ancienne RPC sans consentement ; il conserve un enregistrement lisible uniquement par les deux parties et le révoque à la fin de la relation. Ce premier contrat porte sur l’invitation directe avec un périmètre maximal fixe ; le choix fin des modules et le consentement propre à l’activation marketplace restent à construire. Le run CI 34770770003 valide le contrat SQL, les refus de contournement, la révocation, les transitions concurrentes et le parcours navigateur avec la divulgation FR/EN.

Restent avant livraison complète de M2 : concurrence avec les futures demandes marketplace, changements de compte sur les autres opérations, périmètres configurables et consentement d’activation marketplace, révocation des caches de dossiers et accès fichiers concernés, puis promotion des candidats en migrations et vérification du déploiement. La notification dans l’application n’est pas une notification push ou email.

Les candidats (`account_capabilities.sql`, `client_end_coach_link.sql`, `coaching_relationship_consistency.sql`, `relationship_consent.sql`, `coach_marketplace.sql`, `account_entry_intent.sql`) sont testés uniquement sur la base temporaire de CI. Aucune migration de ce lot n’est appliquée en production ; le lock conserve uniquement les versions réellement appliquées. Docker étant absent de l’environnement de travail, le replay PostgreSQL 17 est réalisé en CI.

**M3 — entrée par intention en validation, non livrée.** La connexion ouvre directement le formulaire d’identité et ne réclame plus un rôle professionnel selon une porte choisie avant connexion. Les nouveaux comptes choisissent ensuite Solo, recherche de coach ou activité coach. Le choix est enregistré par une transaction serveur ; rechercher un coach ne crée aucun lien, et un choix de présentation ne retire pas une capacité professionnelle existante. Les anciens comptes sont repris sans nouvelle question imposée. Les questionnaires coach et les préférences détaillées restent distincts de cette entrée minimale. Le passage Personnel/Coaching du coach, sa persistance par compte et son accès aux outils personnels sont validés sur la base isolée. Google/Apple et la première routine guidée restent à compléter.

**M4–M5 — premier parcours marketplace en validation, non livré.** Profil opt-in et retrait, disponibilité déclarée, présentation/méthode/offre, filtres discipline/langue/format conservés dans l’URL, résultats paginés, comparaison de deux ou trois profils avec sélection conservée dans l’URL, demande avec partage minimal confirmé, acceptation/refus/retrait privés. Les demandes utilisent une clé d’envoi isolée par compte, conservée pendant les réessais ; un ancien envoi rejoué après retrait ne rouvre pas la demande. La liste des demandes est paginée et actualisable ; la sauvegarde du profil refuse les versions obsolètes. Une acceptation ne crée ni lien de coaching, ni accès au dossier, ni paiement. Le SQL candidat `coach_marketplace.sql`, les tests d’isolation et le parcours navigateur sont validés sur base isolée par le run CI 34770770003.

Ce premier annuaire utilise des filtres exacts et un ordre alphabétique annoncé. Il ne remplace pas le futur questionnaire de matching, les autres disciplines à intégrer, la capacité maximale réelle, les règles anti-sollicitation, la modération et les mesures marketplace. Le tarif structuré et l’activation restent dépendants des contrats M6/Billing. Les autres lots M0–M8 et tous leurs critères inachevés sont conservés.

### Direction et ordre d’exécution — parcours complets

**Décision produit :** un moteur commun, identité durable, capacité coach indépendante de l’accompagnement personnel, marketplace et suivi dans la même application. Aucun des lots ci-dessous n’est déclaré livré par la carte.

| Ordre | Lot restant | Conditions de fin |
|---|---|---|
| M0 | Inventorier tous les appels de rôles et policies ; confronter les contrats de la carte au schéma effectif | Scénarios de référence et incompatibilités recensés. La revue ciblée est disponible dans la carte ; inventaire exhaustif et parcours navigateur restent à faire. |
| M1 | Projection compatible de capacités, contexte Personnel/Coaching et backfill | Aucun changement de droits involontaire ; anciens comptes conservés ; coach utilisateur personnel représentable ; aucun auto-lien. |
| M2 | Finir départ autonome, transition commune et partage d’historique ; accès personnel du coach | Conservation des données, révocation, programmes en pause, notification et concurrence validées. Les points détaillés de l’état partiel ci-dessus restent requis. |
| M3 | Entrée par intention, setup minimal, invitations directes et reprise | Connexion habituelle directe ; pas de questionnaire global bloquant l’historique/messages ; première séance sans marketplace ou IA obligatoire. Google/Apple uniquement après validation complète. |
| M4 | Profils/offres opt-in, disponibilités/capacité et espace prospects | Coach peut gérer ses clients sans publier ; publication/retrait et offre claire ; droits du prospect distincts du dossier client. |
| M5 | Questionnaire de recherche, sélection expliquée, comparaison et demandes | 3–5 résultats si pertinents, vide honnête, filtres conservés ; envoi/retrait idempotents ; aucune exposition du dossier brut. |
| M6 | Accord, paiement selon décisions, activation et accueil client | Acceptation distincte du paiement et du lien ; activation commune aux invitations ; un coach actif ; synthèse autorisée et complément de questionnaire sans ressaisie. |
| M7 | Accueils contextuels et boucle de suivi jusqu’à la suite de l’objectif | Programme, séance, historique, communication et bilan reliés ; maintien/nouvel objectif/changement de mode ; coach garde l’autorité. |
| M8 | Ouverture graduelle et qualité de service | Tests des trois parcours, support et signalement opérationnels, mesures minimales ; pas de lancement large sur CI seule. |

Cet ordre remplace l’ancien découpage 2.1–2.7 sans abandonner ses tâches : départ dans M2, profil dans M4, questionnaire/sélection dans M5, demandes dans M5–M6, démarrage/changement dans M2–M6 et confiance dans M8. Les critères et décisions détaillés ci-dessous restent applicables.

La carte contient les contrats écran par écran et la stratégie additive de migration. Le paiement du coaching est une dépendance commerciale de M6, avec décisions du chantier 3 ; il ne bloque pas la construction testable des lots précédents.

### Continuité et nouveaux points transversaux du parcours

- Séparer capacité professionnelle, espace affiché, relation active et entitlement. Auditer aussi les prédicats SQL et outils IA, pas seulement les routes React.
- Conserver l’autorité du coach sur son plan tout en donnant au client accès à son historique personnel et à sa progression.
- Autoriser la consultation de l’historique par le nouveau coach seulement dans le périmètre accepté ; invalider les synthèses/caches après révocation. Aucun transfert de notes privées ou de conversations de l’ancien coach.
- Réutiliser composants, modèles et RPC existants ; aucun second moteur entraînement ou base de données dupliquée par rôle.
- Définir et tester le cycle de vie objectif actif, bilan, maintien, successeur et changement de mode. Ne pas déduire automatiquement la réussite du champ texte historique.
- Distinguer un coach refusé/indisponible, un paiement en attente et une activation échouée. Prévoir reprise serveur et issue utilisateur pour chacun.
- Préserver les fonctions existantes et les tests historiques pendant la bascule ; aucune refonte visuelle gratuite.

### Questionnaire de recherche et contrat de sélection — à construire

- Critères envisagés : discipline, expérience, type et niveau de suivi souhaités, langue, distance/zone, disponibilités et budget si des offres tarifées existent. Chaque question doit avoir un effet documenté sur les résultats.
- Réutiliser les informations existantes seulement si pertinentes et confirmées. Ne pas réinterpréter le questionnaire coach comme un questionnaire marketplace ni modifier son contrat historique.
- Garder les réponses privées par défaut. Une demande transmet uniquement le résumé annoncé au client ; les coachs consultés n’accèdent pas au dossier personnel.
- Commencer par des filtres et un classement explicables. L’IA ne doit ni inventer une compétence, ni affirmer une adéquation médicale, ni prendre la décision à la place du client.
- Tester contraintes incompatibles, absence d’information, égalités de classement, absence de résultat, modifications des réponses, langue, disponibilité et profil dépublié entre consultation et envoi.
- Définir la persistance et la version du questionnaire de recherche, les critères réellement stockés et leur suppression. Ne pas ajouter de réponses sensibles aux outils de mesure.
- Mesures à instrumenter au moment de l’implémentation : recherche terminée, résultats vides, demande envoyée/retirée/acceptée/refusée et démarrage effectif du suivi. Ajouter les contrats d’événements et la documentation ensemble.

### Décisions marketplace encore ouvertes

- Définir le contenu minimal d’une offre et la manière de présenter prix, fréquence des échanges et disponibilité réelle.
- Définir demandes simultanées, expiration éventuelle, limites de sollicitation et devenir des autres demandes après acceptation. Ne pas inventer de délai de réponse.
- Définir vérification des coachs, audience/périmètre d’ouverture, signalement, modération et responsable du traitement. Aucun badge « vérifié » sans procédure réelle.
- Avis clients, classement sponsorisé et liste d’attente : à décider, pas requis par défaut pour le premier parcours. Si ajoutés, prévoir authenticité/modération, identification commerciale et accord aux notifications.
- Commission, encaissement du coaching et reversements : à décider dans le chantier 3. L’expression « Uber du coaching » ne vaut pas autorisation d’implémenter un modèle financier précis.

### Départ autonome

Permettre à un client coaché de mettre fin à la relation depuis son profil. Réutiliser la transition existante vers le mode solo : historique conservé, tracking coach retiré, programme mis en pause et coach informé.

### Profil public du coach

Profil opt-in avec :

- nom public et présentation ;
- disciplines ;
- langues ;
- coaching à distance ou zone géographique ;
- disponibilité pour de nouveaux clients.

### Annuaire et demandes

- Filtres simples par discipline, langue et disponibilité.
- Demande envoyée au coach.
- Acceptation explicite du coach.
- Un seul coach actif par client.
- Changement de coach comme parcours contrôlé : fin du lien actuel, puis nouvelle demande.

### Plan technique — proposition, à confronter au code

- RPC proposée `client_end_coach_link()` : vérification de `auth.uid()`, fin du lien actif et appel de la transition commune vers le solo ;
- table proposée `coach_profiles` pour le nom public, la présentation, les disciplines, les langues, la zone ou le coaching à distance, la disponibilité et l’opt-in public ;
- table proposée `coach_join_requests` pour les demandes et leurs états ;
- routes proposées `/coach/profile` et `/coaches` ;
- l’acceptation doit réutiliser les invariants d’`accept_coach_invite` au lieu de créer un deuxième mécanisme d’association ;
- les profils publics sont lisibles uniquement par des utilisateurs authentifiés ; les demandes sont visibles seulement par leurs deux parties ;
- toute RPC privilégiée garde des droits `EXECUTE` explicites et vérifie la cible avant les effets.

Le champ `solo_trial_ends_at` et l’ancien parcours utilisent déjà une cible de 30 jours après la fin du coaching, mais aucun mur de paiement n’est actif. Avant le chantier Billing, confirmer explicitement si ces 30 jours deviennent la règle commerciale définitive, s’ils s’appliquent aussi aux nouveaux solos, ou s’ils doivent changer.

### Conditions de fin

- Isolation RLS entre les parties.
- Aucun transfert des notes privées de l’ancien coach.
- Historique personnel de l’athlète conservé.
- États d’attente, refus et erreurs visibles.
- Tests coach/client et télémétrie minimale.

## Chantier 3 — Billing

Ne pas commencer avant les décisions produit suivantes :

- prix du solo ;
- paliers coach selon le nombre de clients ;
- durée et population concernée par l’essai ;
- devise et taxes ;
- comportement exact à l’expiration ;
- réévaluation de l’hypothèse historique abonnement solo / abonnement coach / accès logiciel coaché inclus ;
- prix du service de coaching distinct de l’accès logiciel, fournisseur du service et partie qui encaisse ;
- commission éventuelle, reversements et responsabilités opérationnelles ;
- annulations, remboursements, litiges, et effet d’un changement ou départ de coach sur les paiements.

Le choix marketplace ne tranche aucune de ces règles. Conserver l’hypothèse historique comme option explicite, sans l’implémenter comme décision acquise. Une mise en relation acceptée ne constitue pas une confirmation de paiement.

Le futur mur doit conserver un accès en lecture aux données et permettre d’accepter une invitation coach. Un coach qui dépasse son palier conserve ses clients existants mais ne peut plus en ajouter.

### Plan technique de départ — non implémenté

- étendre ou remplacer proprement `subscriptions` pour représenter le plan, la limite de clients, l’essai et l’état courant ;
- exposer une fonction d’entitlement étroite donnant au frontend un état comme actif, en essai ou expiré, sans lui donner de privilèges supplémentaires ;
- remplacer les réponses 410 seulement lorsque les décisions commerciales sont prises : Checkout Session, portail client et webhook Stripe signé ;
- rendre le traitement du webhook idempotent et conserver les clés secrètes et la `service_role` uniquement côté serveur ;
- tester le paywall, le checkout, les rejeux de webhook, l’expiration et les limites de clients ;
- ajouter les événements de paywall/checkout à `docs/TELEMETRY.md` uniquement au moment de leur implémentation.

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

| ID · priorité · base/portée | Amélioration et bénéfice | Critère de réussite |
|---|---|---|
| **UX07 · P1 · H/I** | **Une action principale selon l’état.** Coach : reprendre le client à traiter. Coaché : ouvrir sa séance ou sa prochaine demande. Solo : reprendre son activité ou son programme. Donner la priorité à une tâche déjà commencée, sans ajouter de rendez-vous artificiel. | Depuis l’accueil, chacun identifie spontanément sa prochaine action ; aucune obligation n’est inventée un jour sans tâche. |
| **UX08 · P2 · C/I** | **Rendre programme et historique trouvables pour le solo.** Tester un accès direct depuis accueil et navigation, avec un espace « Suivi » ou équivalent. Réserver Profil aux informations du compte et préférences. | Trouver son programme ou une séance passée ne nécessite pas de deviner qu’ils se cachent dans Profil. |
| **UX09 · P1 · C/I** | **Préserver le contexte au retour.** Garder recherche, filtres, onglet, position de liste et client courant. Revenir à la file d’origine depuis une fiche ou une intervention. | Un coach traite plusieurs clients successivement sans reconstruire sa sélection après chaque visite. |
| **UX10 · P1 · H/I+D** | **Transformer les états d’attente en orientation utile.** Programme en préparation, bilan envoyé, demande de coaching en attente : expliquer l’état, proposer le bon contact et afficher une échéance seulement si quelqu’un l’a réellement définie. | L’utilisateur sait ce qu’il peut faire maintenant ; aucune fausse date de réponse ni fausse absence de données. |
| **UX11 · P2 · C+F/I** | **Cohérence des mots et des modules.** Employer les mêmes termes pour séance, programme, bilan, brouillon et publication. Expliquer la différence entre un modèle réutilisable et le programme actif. Rendre les modules désactivés compréhensibles sans déplacer les repères à chaque visite. | Une même action porte le même nom entre accueil, détail, notification et retour ; les anciens liens utiles restent orientés correctement. |

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
| **2** | Parcours quotidien de bout en bout | UX07, 09–10, 13–15, 18–19, 22, 26–28, 33–37, 62, 68. Entrer, agir, terminer, revenir à la suite. Les défauts d’accessibilité bloquants se corrigent dès le lot 1. |
| **3** | Entrée et transitions sans surprise | UX01–05, 39–41, 54–61. Questionnaire, demande, changement de relation et abonnement : vérifier les parcours finaux supposés livrés. Une ambiguïté de destinataire ou de paiement avérée remonte au lot 1. |
| **4** | Valeur durable et autonomie | UX08, 11, 24–25, 32, 44–47, 49–53, 64–67. Retrouver, comprendre, se faire aider et maîtriser ses réglages. |
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
