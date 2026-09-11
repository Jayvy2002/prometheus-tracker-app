# Vision produit — Prometheus

> **RÔLE DE CE DOCUMENT — DESTINATION PRODUIT DURABLE**
>
> Ce document définit ce que Prometheus veut devenir, pour qui le produit existe, quelle expérience il doit offrir et quels principes ne doivent pas être compromis.
>
> **Instruction pour les agents :** ne pas transformer cette vision en inventaire du code, backlog, journal de PR, état de production ou plan d’implémentation. Une fonctionnalité décrite ici peut représenter la destination finale sans être encore livrée. Tout travail restant appartient à `docs/CHANTIER.md` ; l’état et l’usage actuels du dépôt appartiennent au `README.md` et aux sources techniques.

## Promesse

Prometheus est une plateforme de coaching intelligent pour la musculation, le bodybuilding et le powerlifting, disponible en français et en anglais.

> Prometheus comprend l’athlète, construit son plan, observe son évolution et prépare les prochaines décisions.
>
> En solo, l’athlète valide. Avec un coach, Prometheus prépare et le coach valide.

Prometheus relie trois capacités :

1. **Comprendre** : rassembler les objectifs, préférences, contraintes et informations de suivi utiles.
2. **Construire** : produire un programme cohérent, compréhensible et modifiable.
3. **Adapter** : repérer les changements, expliquer une proposition et laisser la personne responsable décider.

Le produit vise d’abord les coachs et pratiquants de musculation, bodybuilding et powerlifting. Son avantage recherché est un suivi individualisé plus simple à utiliser, soutenu par l’IA et contrôlé par l’humain.

## Les trois rôles

| | Coach | Client coaché | Solo |
|---|---|---|---|
| Entrée | Inscription et configuration de son activité | Invitation ou demande de coaching acceptée | Inscription libre |
| Accueil | Clients à traiter et prochaine décision utile | Prochaine action, programme, échanges et suivi convenu | Prochaine action, programme et outils personnels |
| Programme | Construit, adapte, assigne et publie | Consulte et exécute le programme assigné | Construit ou valide une proposition |
| Suivi | Choisit avec le client les informations utiles | Partage les informations convenues | Choisit ses propres outils |
| Copilote | Prépare analyses, brouillons et propositions | Le coach reste responsable des décisions | Prépare des propositions pour l’athlète |
| Autorité finale | Coach pour le service qu’il fournit | Coach pour le plan de coaching ; client pour ses saisies et choix personnels | Athlète |

Un compte conserve son histoire personnelle lorsqu’il passe de solo à coaché, change de coach ou revient au mode solo.

## Expérience recherchée

### Pour le coach

Prometheus doit lui permettre de suivre davantage de clients sans rendre la prise en charge impersonnelle. Il voit ce qui demande son attention, comprend pourquoi, consulte le contexte nécessaire, prend une décision et passe au client suivant sans perdre le fil.

Les informations détaillées restent disponibles, mais l’interface met d’abord en avant ce qui a changé, la prochaine action et l’effet de la décision envisagée.

### Pour le client coaché

Prometheus doit rendre son accompagnement clair. Le client sait ce qui lui est demandé, pourquoi cette information est utile, ce que son coach a reçu et ce qui change à la suite de leurs échanges.

L’application soutient la relation avec le coach. Elle ne crée pas d’obligations, de rappels ou de conclusions en dehors du suivi réellement convenu.

### Pour le solo

Prometheus doit être un produit complet. Le solo trouve son programme, comprend les consignes, enregistre son activité, retrouve son historique et demande une adaptation sans devoir maîtriser l’organisation interne de la plateforme.

Le copilote l’aide à décider. Les fonctions avancées restent disponibles au moment utile et ne transforment pas le démarrage en configuration interminable.

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

## Modèle commercial cible

- Le solo paie un abonnement Prometheus.
- Le coach paie selon une formule adaptée à son activité et à son nombre de clients.
- Le client coaché est inclus dans l’abonnement de son coach.
- Un solo qui rejoint un coach ne paie pas deux fois pour la même période.

Avant tout engagement, les limites, la fréquence de facturation, la date d’effet et les conséquences d’un changement doivent être compréhensibles. L’accès aux données et la continuité des parcours restent prévisibles lorsqu’un paiement ou une formule change.

Les prix, paliers, essais et règles exactes sont des décisions de chantier, pas des éléments de cette vision durable.

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

L’ordre d’implémentation, les décisions ouvertes et les critères de fin se trouvent uniquement dans `docs/CHANTIER.md`.
