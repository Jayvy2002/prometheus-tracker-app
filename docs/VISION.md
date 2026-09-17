# Vision produit — Prometheus

> **SOURCE DE VÉRITÉ PRODUIT — À LIRE AVANT TOUTE DÉCISION FONCTIONNELLE**
>
> Ce document décrit la destination durable de Prometheus : ce que le produit doit devenir, pour qui il existe, quels principes sont non négociables et comment ses grandes capacités doivent se comporter.
>
> Il ne décrit ni l’état exact du code, ni l’ordre des tâches. Pour l’exécution : `docs/CHANTIER.md`. Pour les parcours et responsabilités : `docs/CARTE_PRODUIT.md`. Pour les règles techniques : `docs/ARCHITECTURE.md` et `AGENTS.md` / `CLAUDE.md`.
>
> **Règle agents :** si une implémentation paraît plus simple mais contredit ce document, l’implémentation est mauvaise. Ne pas adapter la Vision à une limitation héritée sans décision produit explicite.

**Vision de référence : 17 septembre 2026.**

---

## 1. Promesse

Prometheus doit devenir la plateforme de référence pour la musculation, le bodybuilding et le powerlifting qui réunit dans un même produit :

1. **un système complet de suivi de performance personnel** ;
2. **une plateforme professionnelle de coaching** ;
3. **une marketplace permettant de trouver un coach adapté** ;
4. **un copilote intelligent qui aide à détecter, comprendre et adapter sans retirer l’autorité humaine**.

La formule interne « Uber du coaching » décrit la fluidité recherchée pour mettre l’offre et la demande en relation. Elle ne signifie ni coaching instantané, ni attribution automatique, ni coachs interchangeables.

La proposition de valeur peut être résumée ainsi :

> **Prometheus = marketplace de coaching + moteur de suivi de performance + système d’exploitation du coaching.**

Le produit doit permettre à une même personne de progresser seule, d’être coachée, de coacher d’autres personnes, ou de combiner ces usages sans changer de compte et sans perdre son historique.

---

## 2. Un seul compte, un seul moteur, plusieurs capacités

Prometheus ne doit jamais devenir trois applications séparées.

Le modèle cible est :

```text
Compte utilisateur
├── espace personnel
│   ├── Solo si aucun coach actif
│   └── Coaché si une relation active existe
├── capacité Coach : oui / non
├── espace professionnel Coaching si capacité Coach
├── publication marketplace : oui / non
├── entitlements commerciaux
└── historique personnel durable
```

### 2.1 Solo et Coaché sont des états personnels

Un utilisateur est **Solo** lorsqu’il n’a pas de coach actif.

Un utilisateur est **Coaché** lorsqu’une relation de coaching active existe.

La fin d’une relation de coaching le ramène donc naturellement en Solo. Elle ne supprime ni son compte, ni ses séances, ni ses mesures, ni son historique autorisé.

### 2.2 Coach est une capacité professionnelle indépendante

Être Coach ne remplace pas l’identité personnelle.

Un Coach peut :

- utiliser Prometheus pour son propre entraînement ;
- être lui-même coaché par un autre Coach ;
- gérer ses clients ;
- inviter ses clients existants ;
- publier ou non son offre sur la marketplace.

Le produit doit pouvoir représenter ces situations sans hacks de rôle exclusif.

### 2.3 L’espace affiché ne donne aucun droit

Le switch **Personnel / Coaching** est uniquement une préférence d’interface.

Il ne doit jamais accorder ou retirer une permission serveur.

Les permissions dépendent de la ressource, de son propriétaire, de la relation active et de l’action demandée.

---

## 3. Les trois expériences

### 3.1 Solo

Le Solo est un produit complet, pas une version dégradée destinée à pousser vers un Coach.

Il doit pouvoir :

- créer, importer ou générer un programme ;
- modifier librement son plan ;
- enregistrer ses séances ;
- suivre performances, poids, mensurations, photos et habitudes activées ;
- enregistrer et analyser sa nutrition ;
- consulter son calendrier et son historique ;
- recevoir des analyses et propositions de Prometheus ;
- accepter, modifier ou refuser ces propositions ;
- chercher un Coach s’il le souhaite, sans pression artificielle.

Un débutant peut choisir Solo. Un pratiquant avancé peut choisir un Coach. Le produit ne doit pas attribuer une valeur morale à ce choix.

### 3.2 Client coaché

Le Coaché conserve son espace personnel mais certaines décisions de planification sont pilotées par son Coach.

Il doit pouvoir :

- consulter son programme et ses prescriptions ;
- exécuter et logger ses séances ;
- voir son historique et sa progression ;
- consulter son calendrier passé et futur ;
- enregistrer ses propres données personnelles ;
- effectuer les check-ins demandés ;
- communiquer avec son Coach ;
- voir ce qui a changé dans son suivi ;
- demander ou proposer une modification ;
- quitter la relation de coaching selon les règles applicables.

Il ne modifie pas silencieusement le programme futur que son Coach lui a assigné.

### 3.3 Coach

Le Coach utilise Prometheus comme système d’exploitation de son activité.

Il doit pouvoir :

- gérer ses clients actifs ;
- suivre les informations pertinentes sans être noyé dans les données ;
- créer et réutiliser des modèles de programmes ;
- individualiser un programme sans casser les modèles partagés ;
- configurer le suivi par client ;
- créer des questionnaires ;
- recevoir et traiter des prospects ;
- publier volontairement une offre marketplace ;
- utiliser Prometheus pour préparer des analyses et interventions ;
- garder l’autorité finale sur les adaptations qu’il applique à ses clients.

Prometheus doit permettre au Coach d’augmenter sa capacité de suivi **sans rendre son coaching impersonnel**.

---

## 4. Le principe central : l’IA prépare, l’humain décide

Prometheus n’est pas un système d’auto-coaching opaque.

### 4.1 Autorité

En Solo : **l’athlète décide**.

En coaching : **le Coach décide pour le plan de coaching** ; l’athlète reste propriétaire de ses saisies, choix personnels et consentements.

L’IA peut :

- détecter un changement ;
- résumer les preuves disponibles ;
- formuler une hypothèse ;
- proposer une adaptation ;
- préparer un message ;
- préparer un brouillon de programme ;
- suggérer d’attendre davantage de données.

L’IA ne doit pas :

- appliquer une modification sans action humaine ;
- inventer une certitude lorsque les données sont faibles ;
- traiter l’absence de saisie comme une faute ;
- masquer les preuves qui ont conduit à une recommandation ;
- transformer automatiquement un prospect en client ;
- produire un diagnostic médical.

### 4.2 Mémoire intelligente

Le copilote doit progressivement devenir un système qui se souvient non seulement de ce qui s’est passé, mais aussi **de ce qu’il croyait et pourquoi**.

Le modèle cible est :

```text
Données observées
→ signaux
→ hypothèses
→ éléments pour / contre
→ niveau de confiance
→ décision : attendre / proposer / clôturer
→ proposition éventuelle
→ décision humaine
→ mémoire pour la prochaine revue
```

Exemple :

- semaine 1 : fatigue élevée, peu de preuves → observation ;
- semaine 2 : fatigue persistante + baisse de performance → confiance renforcée ;
- Prometheus propose une adaptation ;
- l’humain refuse parce qu’une cause temporaire est connue ;
- la prochaine revue doit connaître ce refus et son contexte plutôt que recommencer à zéro.

La mémoire doit rester corrigeable et explicable.

---

## 5. La revue hebdomadaire est une boucle produit fondamentale

Chaque athlète possède une **revue hebdomadaire Prometheus**.

Elle ne doit pas dépendre d’un bouton facultatif caché. Les notifications peuvent être désactivées, mais l’existence de la revue dans le système ne l’est pas.

Elle analyse uniquement les domaines pertinents et activés :

- entraînement ;
- progression ;
- nutrition ;
- poids/mensurations ;
- check-ins ;
- habitudes ;
- objectif ;
- contraintes déclarées.

La revue peut conclure :

- rien à changer ;
- continuer à observer ;
- demander une information ;
- préparer une proposition ;
- signaler un élément qui mérite une attention humaine.

En Solo, la proposition arrive à l’athlète.

En Coaché, elle nourrit la file du Coach et ne remplace pas son jugement.

Des analyses événementielles peuvent exister en parallèle lorsqu’un événement important survient avant la prochaine revue.

---

## 6. Dashboard et Calendrier ont des rôles différents

### Dashboard = aujourd’hui

L’accueil personnel répond simultanément à deux questions :

1. **Qu’est-ce qui mérite mon attention maintenant ?**
2. **Où en est ma journée ?**

Il peut afficher selon les modules disponibles :

- séance prévue ou en cours ;
- nutrition ;
- poids ;
- check-in ;
- messages/coaching ;
- résumé de progression ;
- raccourcis utiles.

Il ne doit être ni une page « un seul verbe », ni un mur de widgets.

### Calendrier = le temps

Le Calendrier personnel appartient au Solo **et** au Coaché.

Il permet de parcourir passé et futur afin de comprendre :

- séances prévues et réalisées ;
- nutrition enregistrée ;
- mesures ;
- check-ins ;
- habitudes/événements lorsque pertinents ;
- changements de programme et planification future.

Le fait qu’un Coaché ne puisse pas modifier son plan ne justifie jamais de lui cacher son calendrier ou son historique.

---

## 7. Entraînement : profondeur professionnelle, utilisation simple

Prometheus doit être capable de représenter des prescriptions avancées tout en gardant un logger rapide.

Le moteur doit prendre en charge notamment :

- séries de chauffe et de travail ;
- RIR/RPE lorsqu’utilisé ;
- plages de répétitions ;
- charge prescrite ;
- repos ;
- tempo ;
- supersets ;
- drop sets ;
- myo-reps ;
- isométriques ;
- clusters ;
- notes et consignes.

### 7.1 Ne pas confondre calendrier et séquence

Un programme peut être :

- **calendaire** : certaines séances associées à des jours ;
- **séquentiel** : A → B → C, indépendamment du jour de la semaine.

Le produit doit pouvoir gérer les deux sans dupliquer le moteur de séance.

### 7.2 Structure de programmation cible

La profondeur cible comprend :

```text
Programme
→ phases / blocs
→ cycles
→ séances / templates
→ exercices
→ prescriptions
```

Selon le besoin :

- microcycles ;
- mésocycles ;
- macrocycles ;
- deloads ;
- taper ;
- variations planifiées de volume/intensité.

Cette profondeur doit apparaître progressivement dans l’interface. Un utilisateur ne doit pas devoir comprendre la terminologie de périodisation pour commencer une séance.

### 7.3 Histoire immuable

Une modification future ne réécrit jamais silencieusement ce qui a réellement été réalisé.

Les programmes sont versionnés ; les modifications importantes créent une nouvelle révision identifiable.

---

## 8. Objectifs comme objets vivants

Un objectif ne doit pas être un simple champ écrasé dans un profil.

Le cycle cible est :

- `active` ;
- `reached` ;
- `maintenance` ;
- `replaced` ;
- `paused` ;
- `abandoned`.

Chaque transition conserve :

- dates ;
- contexte ;
- raison ;
- objectif suivant éventuel.

Programme, analyses et recommandations doivent pouvoir se rattacher à l’objectif pertinent à la période concernée.

---

## 9. Nutrition

La nutrition doit être rapide à logger et honnête sur la provenance des données.

Ordre de recherche cible :

1. catalogue interne Prometheus ;
2. Open Food Facts ou source externe pertinente ;
3. saisie/photo d’étiquette ;
4. assistance IA ;
5. validation utilisateur ;
6. enrichissement éventuel du catalogue interne.

La provenance et le niveau de confiance doivent rester traçables.

Les recettes, favoris, récents et produits doivent partager un contrat de portions cohérent.

Les cibles nutritionnelles sont datées afin de ne pas réinterpréter le passé avec une cible actuelle.

---

## 10. Bibliothèque d’exercices

Prometheus vise une bibliothèque d’exercices commune, multilingue et durable.

Chaque exercice possède un concept canonique. Les différentes façons de le nommer sont des alias, pas nécessairement de nouveaux exercices.

La cible comprend :

- nom canonique ;
- traductions ;
- alias/synonymes ;
- équipement ;
- muscles ;
- variantes ;
- instructions utiles ;
- provenance ;
- statut de vérification ;
- fusion contrôlée de doublons.

Lorsqu’un utilisateur propose un nouvel exercice, Prometheus doit d’abord chercher les concepts proches.

Une fusion de doublons ne doit jamais casser l’historique de performances existant.

---

## 11. Marketplace : trouver un Coach adapté, pas produire un score opaque

### 11.1 Profil Coach opt-in

Un Coach peut utiliser Prometheus sans publier de profil.

Le profil public peut contenir :

- nom public ;
- présentation ;
- méthode ;
- disciplines ;
- langues ;
- online / présentiel / hybride ;
- zone géographique si nécessaire ;
- modalités de suivi ;
- disponibilité ;
- qualifications déclarées et éventuellement vérifiées.

### 11.2 Qualifications

Une qualification peut être :

- déclarée ;
- en vérification ;
- vérifiée par Prometheus ;
- refusée/expirée si nécessaire.

Un Coach sans qualification vérifiée peut exister sur la plateforme. Il ne reçoit simplement pas le badge correspondant.

**Aucun système public d’étoiles ou d’avis Coach n’est prévu à ce stade.** Ne pas l’ajouter sans décision produit explicite.

### 11.3 Matching

Le matching doit distinguer :

1. **exigences bloquantes** ;
2. **préférences importantes** ;
3. **préférences secondaires**.

Exemples : objectif, discipline, expérience, FR/EN, online/présentiel, zone, budget lorsque pertinent, disponibilité, fréquence de contact, autonomie, style de coaching, matériel et contraintes.

Le résultat n’est pas « 94 % compatible ».

Il explique plutôt :

- pourquoi ce Coach correspond ;
- quelles préférences sont couvertes ;
- ce qui reste inconnu ;
- pourquoi certains Coachs sont exclus.

Afficher moins de résultats est préférable à afficher un Coach qui ne respecte pas une exigence.

---

## 12. Une demande marketplace n’est pas encore une relation de coaching

Le lifecycle cible est explicite :

```text
Athlète envoie une demande
→ Coach accepte de poursuivre / discuter
→ conversation prospect
→ Athlète confirme qu’il veut démarrer avec ce Coach
→ relation de coaching active
```

États de fermeture possibles : refus du Coach, retrait de l’athlète, indisponibilité, expiration selon future décision.

### Invariant

**Une action du Coach seule ne peut jamais transformer un prospect en client Coaché.**

L’athlète donne la confirmation finale.

Un utilisateur ne peut avoir qu’un Coach actif à la fois. Une activation réussie clôt proprement les autres demandes incompatibles.

Avant activation, le Coach n’obtient accès qu’aux informations explicitement partagées pour la demande/prospection, pas au dossier sportif complet.

---

## 13. Messagerie

Une relation Coach–athlète possède une conversation principale continue.

La même relation conversationnelle peut commencer pendant la phase prospect puis continuer après activation, sans créer artificiellement plusieurs inbox parallèles.

Les messages peuvent contextualiser des objets Prometheus :

- séance ;
- exercice ;
- série ;
- check-in ;
- programme/révision ;
- mesure ;
- proposition.

Les pièces jointes pertinentes peuvent inclure images, fichiers et vidéo technique selon les règles de stockage et de confidentialité.

Une notification n’est jamais la source de vérité d’un message.

---

## 14. Imports : réduire drastiquement la friction de migration

L’un des objectifs majeurs d’adoption Coach est de pouvoir migrer un historique existant sans tout ressaisir.

Le parcours cible pour un spreadsheet/CSV est :

```text
upload
→ détection de structure
→ proposition de mapping
→ ambiguïtés explicites
→ aperçu
→ corrections humaines
→ confirmation
→ import transactionnel
```

L’IA peut aider au mapping mais ne doit pas importer silencieusement des données ambiguës.

Pour un athlète qui n’a pas encore de compte :

```text
Coach prépare un dossier provisoire
→ invitation
→ athlète crée / connecte son compte
→ aperçu des données à rattacher
→ consentement
→ rattachement
```

La propriété finale reste celle de l’athlète pour ses données personnelles.

---

## 15. Intégrations santé et wearables

Health Connect, Apple Health, Garmin et autres intégrations sont des extensions futures du moteur commun, pas des silos séparés.

Toute donnée importée doit conserver :

- sa provenance ;
- son horodatage ;
- son unité ;
- les règles de déduplication ;
- les permissions utilisateur.

Priorité d’adoption : l’import Coach depuis spreadsheets passe avant la multiplication des intégrations wearables.

---

## 16. Offline

La séance d’entraînement est la priorité offline absolue.

L’utilisateur doit pouvoir poursuivre une séance même avec un réseau instable, puis synchroniser sans doublon.

Peuvent ensuite être étendus progressivement :

- consultation de données déjà chargées ;
- nutrition connue localement ;
- brouillons/messages en attente.

Marketplace, paiement et analyses IA peuvent rester online-only.

---

## 17. Modèle commercial cible

L’architecture commerciale doit rester séparée du modèle d’identité et des permissions métier.

Les concepts à représenter sont au minimum :

- entitlement Solo ;
- entitlement Coach ;
- limites/paliers Coach basés notamment sur le nombre de clients actifs ;
- période d’essai Solo ;
- période de grâce Coach ;
- accès bêta ;
- statut commercial courant.

### Décisions actuelles

- **Essai Solo : 14 jours.**
- **Grâce Coach : 7 jours** lorsque le contrat commercial nécessite une régularisation.
- Les paliers Coach pourront dépendre du nombre de clients actifs.
- **Les prix définitifs ne sont pas encore décidés.**
- Ne jamais hardcoder des prix inventés dans le produit ou la documentation.

Le fait d’être Coach, Solo ou Coaché ne doit pas être déduit d’un simple retour de checkout.

Le démarrage d’une relation Coaché et la facturation sont deux événements distincts.

---

## 18. Bêta : accès ouvert, économie mesurée

Pendant la bêta, Prometheus doit pouvoir laisser les capacités ouvertes tout en mesurant ce qu’elles coûteraient réellement.

L’architecture cible utilise un **bypass bêta explicite** plutôt que de détruire le modèle commercial.

Exemple conceptuel :

```text
entitlement réel calculable
+ beta_access = true
→ accès autorisé pendant la bêta
→ consommation toujours mesurée
```

Mesurer par fonction et contexte :

- appels IA ;
- tokens/units ;
- stockage ;
- services tiers ;
- volumes d’usage pertinents.

Ne pas stocker inutilement le contenu privé pour mesurer le coût.

Ces données servent à définir plus tard les quotas et tarifs, pas à justifier des limites arbitraires maintenant.

---

## 19. Contrat UX

Prometheus doit rester profond **sans paraître complexe**.

Principes :

- une priorité claire par écran ;
- détails progressifs ;
- aucun jargon interne visible par défaut ;
- aucun champ demandé sans usage identifié ;
- aucun succès affiché avant confirmation réelle ;
- chargement, vide, erreur et reprise sont des états différents ;
- les erreurs conservent le travail autant que possible ;
- mobile d’abord, desktop efficace ;
- navigation stable ;
- FR/EN de niveau équivalent ;
- accessibilité et zoom font partie de la définition de « terminé ».

La navigation mobile reste volontairement limitée ; une nouvelle fonctionnalité ne mérite pas automatiquement un nouvel onglet.

---

## 20. Confidentialité, propriété et confiance

Les données personnelles appartiennent à l’utilisateur.

Une relation de coaching donne un accès limité et explicable ; elle ne transfère pas la propriété.

À la fin d’une relation :

- le lien actif prend fin ;
- les permissions liées au Coach disparaissent ;
- le programme coaché peut être archivé/mis en pause selon son contrat ;
- l’historique personnel permis reste disponible ;
- les notes privées du Coach restent privées ;
- l’utilisateur revient en Solo s’il n’a plus de Coach actif.

Lors d’un changement de Coach, aucune donnée privée de l’ancien Coach n’est transférée silencieusement.

La télémétrie produit ne doit pas contenir messages privés, notes libres sensibles, photos ou réponses de santé détaillées.

---

## 21. Invariants non négociables

1. **Un compte utilisateur, pas trois produits séparés.**
2. **Solo/Coaché = état personnel ; Coach = capacité professionnelle indépendante.**
3. **Un athlète ne peut avoir qu’un Coach actif à la fois.**
4. **L’espace Personnel/Coaching ne donne aucun droit serveur.**
5. **L’IA prépare ; un humain décide.**
6. **Aucune adaptation automatique silencieuse.**
7. **Une absence de donnée n’est pas une faute.**
8. **Une demande marketplace n’est pas une relation active.**
9. **La confirmation finale d’une nouvelle relation marketplace appartient à l’athlète.**
10. **Les données personnelles suivent l’utilisateur à travers Solo ↔ Coaché.**
11. **Un Coach peut aussi utiliser son espace personnel et peut lui-même être coaché.**
12. **Le Dashboard résume aujourd’hui ; le Calendrier représente le temps.**
13. **Le Calendrier personnel appartient au Solo et au Coaché.**
14. **Les programmes sont versionnés ; le passé réalisé n’est pas réécrit.**
15. **Un module désactivé ne produit ni rappel, ni reproche, ni conclusion.**
16. **La séance doit rester robuste hors ligne.**
17. **FR/EN, mobile, accessibilité, vide/erreur/reprise font partie de la fonctionnalité.**
18. **Pas d’avis/étoiles Coach sans nouvelle décision produit.**
19. **Essai Solo = 14 jours ; grâce Coach = 7 jours.**
20. **Prix Coach/Solo non décidés : ne pas en inventer.**
21. **La bêta contourne le paiement sans contourner la mesure des coûts.**
22. **Aucune nouvelle fonctionnalité ne doit recréer un moteur parallèle pour Solo, Coaché ou Coach.**

---

## 22. Comment décider lorsqu’une nouvelle fonctionnalité est proposée

Avant d’implémenter, répondre explicitement :

1. À quel domaine appartient cette capacité ?
2. Qui possède la donnée ?
3. Qui peut la lire ?
4. Qui peut la modifier ?
5. Quelle relation ou entitlement est réellement nécessaire ?
6. Quelle règle doit être garantie côté DB/RPC plutôt que seulement dans l’UI ?
7. Existe-t-il déjà une primitive Prometheus qui couvre une partie du besoin ?
8. Quel état fait foi ?
9. Que se passe-t-il si le réseau coupe ?
10. Que voit un Solo, un Coaché, un Coach et un Coach lui-même coaché ?
11. Que se passe-t-il à la fin d’une relation ?
12. Quels tests prouvent que le comportement correspond à cette Vision ?

Si ces réponses ne sont pas claires, la tâche n’est pas prête à être codée.
