# Vision produit — Prometheus

> **RÔLE DE CE DOCUMENT — DESTINATION PRODUIT DURABLE**
>
> Ce document définit ce que Prometheus veut devenir, pour qui le produit existe, quelle expérience il doit offrir et quels principes ne doivent pas être compromis.
>
> **Instruction pour les agents :** ne pas transformer cette vision en inventaire du code, backlog, journal de PR, état de production ou plan d’implémentation. Une fonctionnalité décrite ici peut représenter la destination finale sans être encore livrée. Tout travail restant appartient à `docs/CHANTIER.md` ; l’état et l’usage actuels du dépôt appartiennent au `README.md` et aux sources techniques.

**Direction produit : marketplace de coaching avec continuité solo — 12 septembre 2026.**

## Promesse

Prometheus veut devenir la marketplace de référence pour trouver un coach adapté et recevoir son accompagnement dans une même application, en français et en anglais, avec un espace solo complet pour pratiquer en autonomie. Le public initial reste celui de la musculation, du bodybuilding et du powerlifting.

L’image « Uber du coaching » exprime la simplicité de la rencontre entre offre et demande. Elle ne promet ni disponibilité immédiate, ni attribution automatique, ni coachs interchangeables : la qualité d’une relation durable prime.

> Trouver l’accompagnement qui convient, commencer simplement et faire évoluer sa pratique sans perdre son histoire.
>
> En solo, l’athlète valide. Avec un coach, Prometheus prépare et le coach valide.

Prometheus relie quatre capacités :

1. **Mettre en relation** : comprendre le service recherché, présenter des coachs compatibles et permettre un choix mutuel éclairé.

2. **Comprendre** : rassembler les objectifs, préférences, contraintes et informations de suivi utiles.
3. **Construire** : produire un programme cohérent, compréhensible et modifiable.
4. **Adapter** : repérer les changements, expliquer une proposition et laisser la personne responsable décider.

Le produit vise d’abord les coachs et pratiquants de musculation, bodybuilding et powerlifting. Son avantage recherché associe acquisition de clients pour les coachs, choix d’un accompagnement adapté pour les pratiquants et suivi individualisé simple à utiliser, soutenu par l’IA et contrôlé par l’humain.

## Un moteur, plusieurs expériences

**Prometheus = marketplace de coaching + plateforme commune de suivi de performance + système d’exploitation du coaching.**

Les données personnelles appartiennent au compte et suivent toute son histoire sportive. Solo et coaché sont des situations d’accompagnement ; coach est une capacité professionnelle qui peut coexister avec l’usage personnel. L’espace affiché ne confère aucun droit.

Un coach peut utiliser les outils pour son entraînement personnel et inviter ses clients existants sans publier de profil marketplace. Aucun second moteur de séances, de programmes ou de progression ne doit être construit pour un rôle.

L’entrée cible crée le compte, puis demande l’intention : « M’entraîner seul », « Trouver un coach » ou « Je suis coach ». Un utilisateur qui revient retrouve son contexte ; une invitation garde sa destination. Chaque parcours demande ensuite seulement les informations utiles à sa première action.

Le Solo privilégie logging, historique, routines et progression. L’IA est facultative et informative ; elle ne tente pas de devenir en permanence son coach. La marketplace reste un accès discret et volontaire.

La boucle commune est objectif → plan → action → suivi → analyse → adaptation. Le solo décide pour lui-même ; avec un coach, le coach interprète et valide les adaptations. Le bilan mène à un nouvel objectif, au maintien ou à un changement volontaire de mode, sans supprimer l’histoire.

La carte des parcours, écrans et contrats d’architecture est dans [CARTE_PRODUIT.md](CARTE_PRODUIT.md). Elle décrit une cible et ses écarts avec le code ; le statut des travaux reste dans le Chantier.

## Les trois expériences

| | Coach | Client coaché | Solo |
|---|---|---|---|
| Entrée | Configuration de son activité et publication volontaire de son offre | Questionnaire de recherche, choix du coach et demande acceptée, ou invitation directe | Inscription libre, sans recherche de coach obligatoire |
| Accueil | Clients à traiter et prochaine décision utile | Prochaine action, programme, échanges et suivi convenu | Prochaine action, programme et outils personnels |
| Programme | Construit, adapte, assigne et publie | Consulte et exécute le programme assigné | Construit ou valide une proposition |
| Suivi | Choisit avec le client les informations utiles | Partage les informations convenues | Choisit ses propres outils |
| Copilote | Prépare analyses, brouillons et propositions | Le coach reste responsable des décisions | Prépare des propositions pour l’athlète |
| Autorité finale | Coach pour le service qu’il fournit | Coach pour le plan de coaching ; client pour ses saisies et choix personnels | Athlète |

Un compte conserve son histoire personnelle lorsqu’il passe de solo à coaché, change de coach ou revient au mode solo.

## Expérience recherchée

### Pour le coach

Prometheus doit l’aider à être découvert par des clients dont les attentes correspondent à son offre, à maîtriser sa disponibilité et à accepter les demandes pertinentes. Aucune acquisition de clients ni revenu n’est garanti.

Prometheus doit lui permettre de suivre davantage de clients sans rendre la prise en charge impersonnelle. Il voit ce qui demande son attention, comprend pourquoi, consulte le contexte nécessaire, prend une décision et passe au client suivant sans perdre le fil.

Les informations détaillées restent disponibles, mais l’interface met d’abord en avant ce qui a changé, la prochaine action et l’effet de la décision envisagée.

### Pour le client coaché

Prometheus doit aider à choisir un service clair : ce qui est inclus, les modalités de suivi, la disponibilité et le prix lorsqu’il s’applique. Le client choisit son coach ; une recommandation ne crée jamais un engagement.

Prometheus doit rendre son accompagnement clair. Le client sait ce qui lui est demandé, pourquoi cette information est utile, ce que son coach a reçu et ce qui change à la suite de leurs échanges.

L’application soutient la relation avec le coach. Elle ne crée pas d’obligations, de rappels ou de conclusions en dehors du suivi réellement convenu.

### Pour le solo

Prometheus doit être un produit complet. Le solo est un choix d’autonomie, pas une récompense réservée aux experts ni une version dégradée destinée à pousser vers un coach. Un débutant peut choisir le solo et un pratiquant expérimenté peut souhaiter un accompagnement. Le solo trouve son programme, comprend les consignes, enregistre son activité, retrouve son historique et demande une adaptation sans devoir maîtriser l’organisation interne de la plateforme.

Le copilote l’aide à décider. Les fonctions avancées restent disponibles au moment utile et ne transforment pas le démarrage en configuration interminable.

## Rencontre et accompagnement dans un même parcours

Le parcours cible relie une intention simple à un service réel : choisir l’autonomie ou chercher un coach, préciser ses attentes, comparer une sélection pertinente, envoyer une demande, obtenir une acceptation explicite puis démarrer le suivi dans Prometheus. Une invitation directe reste possible sans détour imposé par la marketplace.

### Un questionnaire court pour orienter

Le questionnaire de recherche sert à préciser discipline, expérience, accompagnement souhaité, langue, modalités à distance ou locales, disponibilités et budget lorsque les offres tarifées existent. Ne demander que ce qui modifie réellement les résultats. Les réponses peuvent être corrigées et reprises.

Il est distinct du questionnaire de prise en charge choisi par le coach après la mise en relation. Réutiliser les réponses pertinentes avec confirmation évite de tout ressaisir ; le dossier détaillé n’est pas envoyé à tous les coachs consultés.

### Une compatibilité expliquée et un choix libre

La sélection distingue les exigences indispensables des préférences. Elle explique les correspondances et les informations manquantes, sans pourcentage de compatibilité arbitraire ni promesse de résultat. Les préférences peuvent être ajustées ; une exigence n’est jamais élargie silencieusement.

L’utilisateur peut explorer l’annuaire et modifier ses filtres. Si aucun coach ne convient, l’app le dit, conserve ses réponses et propose une modification volontaire des critères ou la poursuite en solo. Elle ne fabrique pas de recommandation pour remplir l’écran.

### Une offre lisible et une relation choisie

Un profil présente le service, les spécialités déclarées, les langues, les modalités, la disponibilité et les conditions applicables. Une qualification déclarée reste distincte d’une vérification réellement effectuée. La visibilité dépend du choix du coach et de sa capacité à accueillir des clients.

Le client choisit à qui adresser sa demande ; le coach accepte explicitement. Le suivi convenu, les messages, le programme et les adaptations vivent ensuite dans l’app. Les sollicitations répétées, le démarchage non consenti et les promesses de réponse fictives n’ont pas leur place.

### La confiance fait partie du service

Les utilisateurs doivent pouvoir signaler un profil ou un comportement problématique et obtenir une issue compréhensible. Les éventuels avis reposent sur une relation réelle et des règles de modération. Une visibilité commerciale éventuelle est identifiée et ne se fait pas passer pour une meilleure adéquation.

## Contrat UX

- Une action principale identifiable à chaque étape ; les détails apparaissent lorsqu’ils aident à décider.
- Des textes courts et concrets, sans commentaires internes ni répétitions ; conserver les conséquences, destinataires et erreurs utiles.
- Aucun questionnaire redemandé sans nécessité, aucune saisie perdue après erreur ou interruption.
- Un choix de coach reste libre ; pas de pression artificielle, de fausse urgence ou de promesse de disponibilité.
- Demande, acceptation, démarrage du suivi et paiement éventuel sont des états distincts.
- La qualité UX minimale fait partie de chaque fonctionnalité : mobile, accessibilité, FR/EN, chargement, vide, erreur et reprise. Les optimisations plus larges gardent leur place dans le chantier UX.
- La réussite se mesure à la capacité de trouver un accompagnement pertinent et de réaliser son suivi, pas au nombre d’écrans visités.

## Principes produit

### Chaque fonctionnalité doit rendre un service identifiable

Une information n’est demandée que si elle permet une action, une décision ou une restitution utile. Ajouter des écrans, des alertes ou des indicateurs sans bénéfice observable augmente la friction et ne constitue pas une amélioration.

### L’IA prépare, l’humain décide

Toute proposition présente le changement, sa justification, sa cible, sa date d’effet et les actions accepter, modifier ou refuser. Elle ne s’applique jamais automatiquement.

Une réponse informative, un brouillon, une modification de programme et un message sont des effets distincts. L’interface indique précisément lesquels seront exécutés.

### Le programme reste vivant

Le plan évolue avec les disponibilités, objectifs, préférences et contraintes de l’athlète. Les changements sont prévisualisés et enregistrés comme révisions. L’utilisateur distingue le brouillon, la version enregistrée et la version active.

Une modification future ne réinterprète pas silencieusement les séances déjà réalisées.

### Le suivi est individualisé et proportionné

Le coach et son client choisissent les modules utiles. Le solo choisit ses propres outils. Un module désactivé ne produit ni rappel, ni reproche, ni conclusion.

Un manque de saisie ne prouve ni une difficulté ni un défaut d’engagement. L’application distingue ce qui est déclaré, ce qui est observé et ce qui manque.

### Les actions et leur état restent compréhensibles

L’utilisateur sait ce qui est conservé sur son appareil, enregistré, synchronisé, partagé ou encore en brouillon. Une réussite affichée correspond à une écriture réelle. Une erreur conserve le travail et propose une reprise.

Les libellés envoyé, reçu, examiné, publié et actif ne sont utilisés que lorsque l’application peut prouver l’état correspondant.

### Les transitions de rôle sont continues et réversibles

Un client a au maximum un coach actif. À la fin d’une relation :

- le lien de coaching prend fin ;
- le suivi configuré par le coach est retiré ;
- le programme assigné est mis en pause ;
- les données personnelles et l’historique permis restent disponibles ;
- le compte revient au mode solo.

Un changement de coach protège les notes privées de l’ancien coach et rend explicite ce qui sera partagé avec le nouveau.

### Le bilingue est natif

Les parcours, messages et propositions existent en français et en anglais. La langue de l’utilisateur détermine l’affichage et la langue des brouillons.

### La confidentialité est visible

Les accès suivent la relation coach-client et les règles de la base. Pour une information sensible, l’utilisateur comprend pourquoi elle est demandée, qui la verra et ce qui se passe s’il choisit de ne pas la fournir.

La télémétrie mesure l’utilité des parcours sans enregistrer les réponses sensibles, textes libres, messages ou photos.

### L’accessibilité fait partie du fonctionnement

Les parcours essentiels doivent rester utilisables sur téléphone, avec le clavier, un lecteur d’écran, du texte agrandi et un réseau contraint. Une action inaccessible est une fonctionnalité incomplète.

### L’utilité se mesure par la tâche accomplie

Le succès du produit ne se résume pas au temps passé dans l’application. Prometheus mesure si une personne parvient à comprendre, agir, reprendre après une interruption et corriger une erreur.

## Principes commerciaux

L’accès au logiciel Prometheus et l’achat éventuel d’une prestation de coaching sont deux objets distincts. Le client doit comprendre qui fournit le service, ce qu’il achète, à qui il paie et les effets d’un départ ou d’un changement de coach.

**Aucune facturation n’est en place tant que le produit n’est pas prêt à ouvrir.** Tant que le chantier Billing n’est pas ouvert, une mise en relation n’implique ni paiement, ni abonnement, ni commission.

La marketplace ne fixe pas à elle seule un modèle de commission ou de reversement. L’hypothèse antérieure — abonnement solo, abonnement coach et accès logiciel du coaché inclus — reste une piste à réévaluer, pas une décision définitive. Les arbitrages figurent dans le chantier Billing.

Les prix, limites, dates d’effet et conditions doivent être visibles avant engagement. Les transitions évitent une double facturation injustifiée de l’accès logiciel et préservent un accès prévisible aux données.

## Invariants

- Un seul coach actif par client.
- L’IA ne s’auto-applique jamais.
- Un client coaché ne modifie pas directement les éléments gérés par son coach.
- Un coach ne peut agir que sur ses propres clients.
- Le mode solo reste un produit complet.
- Les données personnelles suivent l’athlète lors des transitions autorisées.
- Les notes privées d’un coach ne sont pas transmises à un autre coach.
- Une séance partielle reste une séance partielle ; les données prévues ne deviennent pas des réalisations.
- Une action indique son destinataire et ses effets avant validation.
- Une erreur ne transforme pas silencieusement un écran en état vide ou en nouveau document.
- Les tables exposées sont protégées et les écritures privilégiées sont testées.
- Le français et l’anglais couvrent toute l’interface.
- Les migrations appliquées restent immuables.
- Les erreurs importantes sont visibles et récupérables.
- Les fonctionnalités facultatives ou sensibles ne bloquent pas les parcours essentiels.

L’ordre d’implémentation, les décisions ouvertes et les critères de fin se trouvent uniquement dans `docs/CHANTIER.md`. Un diagnostic de l’expérience **livrée** (trois personae) est dans `docs/RAPPORT_UX_FONCTIONNALITES.md` ; il ne remplace pas cette vision.
