# Vision produit de référence — Prometheus

> **SOURCE DE VÉRITÉ PRODUIT — À LIRE AVANT TOUTE DÉCISION FONCTIONNELLE**
>
> Ce document décrit la destination durable de Prometheus, les expériences attendues, les règles de propriété et d’autorité, les décisions déjà prises et les points volontairement laissés ouverts.
>
> Il prime sur les anciens audits, rapports UX et hypothèses historiques. Les documents d’exécution et d’architecture doivent converger vers cette Vision, jamais l’inverse.
>
> **Une limitation actuelle du code n’est pas une raison pour modifier silencieusement cette Vision.**

**Vision de référence : 17 septembre 2026. Consolidation repo : 18 septembre 2026.**

---

## 1. Comment lire cette Vision

Prometheus possède plusieurs documents qui ont des responsabilités différentes :

- **VISION.md** : ce que le produit doit devenir et les décisions produit non négociables ;
- **CHANTIER.md** : dans quel ordre converger vers cette Vision et quel est le prochain travail ;
- **CARTE_PRODUIT.md** : parcours, responsabilités, ownership et permissions cibles ;
- **ARCHITECTURE.md** : frontières techniques et règles de migration ;
- **AGENTS.md / CLAUDE.md / .cursor/rules/** : discipline obligatoire des agents ;
- **MIGRATIONS.md / TELEMETRY.md / DESIGN_SYSTEM.md** : contrats spécialisés.

Si deux documents semblent se contredire, ne pas choisir silencieusement l’interprétation la plus facile à coder. La Vision produit fait foi et le conflit documentaire doit être corrigé dans la même PR.

---

## 2. Promesse générale de Prometheus

Prometheus doit devenir la plateforme de référence pour la musculation, le bodybuilding, le powerlifting et l’hypertrophie qui réunit :

1. un système complet de suivi de performance personnel ;
2. une plateforme professionnelle de coaching ;
3. une marketplace permettant de trouver un Coach adapté ;
4. un copilote intelligent qui observe, contextualise et propose sans retirer l’autorité humaine.

La formule interne « Uber du coaching » décrit la fluidité recherchée pour mettre l’offre et la demande en relation. Elle ne signifie ni prestation instantanée, ni attribution automatique, ni Coach interchangeable.

> **Prometheus = marketplace de coaching + plateforme complète de suivi de performance + système d’exploitation du coaching.**

Prometheus ne doit pas devenir trois applications séparées.

---

## 3. Identité, situations personnelles et capacité Coach

### 3.1 Deux dimensions, pas trois rôles exclusifs

Le modèle cible sépare :

- **l’état personnel** : Solo ou Coaché ;
- **la capacité professionnelle** : Coach oui ou non.

~~~text
Compte utilisateur
├── état personnel
│   ├── Solo : aucun Coach actif
│   └── Coaché : une relation Coach active
├── capacité Coach : oui / non
├── workspace affiché : Personnel / Coaching
├── publication marketplace : oui / non
├── entitlements commerciaux
└── historique personnel durable
~~~

Combinaisons valides :

- Solo ;
- Coaché ;
- Solo + Coach ;
- Coaché + Coach.

Un Coach peut donc s’entraîner dans Prometheus pour lui-même et peut aussi être coaché par un autre Coach.

### 3.2 Être Coach dans Prometheus nécessite l’entitlement Coach

Hors bêta gratuite :

- sans entitlement Coach actif, pas de capacité Coach ;
- pas d’espace professionnel utilisable ;
- pas de gestion de clients ;
- pas de publication marketplace ;
- pas de nouveaux droits Coach.

L’abonnement Coach inclut les outils personnels de type Solo.

La publication marketplace reste un choix séparé : être Coach n’oblige jamais à publier un profil.

Pendant la bêta, l’architecture des entitlements existe mais peut être bypassée explicitement pour ouvrir l’accès gratuitement tout en mesurant l’usage et les coûts.

### 3.3 Le workspace est une préférence UI, pas une permission

Le switch Personnel / Coaching permet seulement de changer de contexte d’interface.

Il ne doit jamais accorder ou retirer un droit serveur.

Les permissions dépendent de la ressource, de son propriétaire, de la relation active et de l’action demandée.

---

## 4. Espaces de l’application et navigation

### 4.1 Espace Personnel

Disponible à tous les utilisateurs.

Il regroupe les données et actions personnelles :

- Dashboard ;
- entraînement ;
- nutrition ;
- progression ;
- Calendrier ;
- objectifs ;
- check-ins personnels ou assignés ;
- habitudes activées ;
- messages liés à sa propre relation de coaching.

### 4.2 Espace Coaching

Disponible uniquement avec la capacité Coach.

Il regroupe :

- clients actifs ;
- prospects ;
- programmes et modèles ;
- check-ins ;
- interventions ;
- messagerie professionnelle ;
- copilote Coach ;
- profil marketplace ;
- qualifications ;
- outils d’import et d’administration Coach prévus.

Un Coach ne doit jamais apparaître comme son propre client simplement parce qu’il possède la capacité Coach.

---

## 5. Onboarding et transitions

### 5.1 L’onboarding demande l’intention actuelle

Après création du compte :

- JE ME GÈRE SEUL ;
- JE VEUX ÊTRE COACHÉ / TROUVER UN COACH ;
- JE SUIS COACH.

Cette réponse configure le premier parcours mais ne verrouille pas l’identité.

### 5.2 Les transitions ne doivent jamais effacer l’histoire

Solo → Coaché :
- les données personnelles restent ;
- la relation active ajoute les droits du Coach ;
- le plan de coaching peut prendre le relais sans effacer l’historique.

Coaché → Solo :
- la relation s’arrête ;
- le Coach perd l’accès futur ;
- l’athlète garde son historique personnel ;
- le compte continue sans reconstruction.

Coach + Solo ↔ Coach + Coaché :
- la capacité Coach ne change pas ;
- seule la relation personnelle change.

### 5.3 Profondeur de suivi adaptative

L’onboarding ne doit pas devenir un questionnaire géant.

Commencer par :

- objectif ;
- expérience ;
- discipline ;
- équipement ;
- contraintes ;
- modules que l’utilisateur veut suivre.

Puis approfondir seulement quand nécessaire.

En Solo, l’utilisateur choisit la profondeur.

En Coaché, une base commune existe puis le Coach peut activer/configurer des modules de suivi supplémentaires.

Les choix de suivi configurent aussi le contexte disponible pour l’IA.

---

## 6. Objectifs : un cycle vivant

Un objectif n’est pas un simple champ de profil écrasé.

États cibles :

- active ;
- reached ;
- maintenance ;
- replaced ;
- paused ;
- abandoned.

Chaque transition conserve :

- dates ;
- contexte ;
- raison ;
- métriques pertinentes ;
- objectif successeur éventuel.

L’IA peut proposer de réévaluer un objectif mais ne le modifie jamais silencieusement.

**Important :** l’état paused est valide pour un objectif. Il ne signifie pas qu’une relation de coaching peut être « mise en pause ».

---

## 7. Entraînement : liberté d’exécution et profondeur de planification

### 7.1 Programme, routine et séance libre

- **Programme** : organisation de séances/routines dans le temps autour d’un objectif et d’une progression.
- **Routine** : séance réutilisable.
- **Séance libre** : entraînement non prescrit.

Même avec un programme actif, l’utilisateur peut faire une séance libre ou une autre routine.

Toutes les séances réalisées doivent alimenter le même historique de performance.

### 7.2 Substitution ponctuelle versus modification durable

Situation temporaire :
- machine prise ;
- contrainte du jour ;
- gêne passagère ;
- déplacement.

=> proposer une alternative « aujourd’hui seulement », sans modifier le programme de base.

Changement durable :
- Solo : l’athlète accepte, modifie ou refuse ;
- Coaché : le changement stratégique devient une proposition/brouillon pour le Coach.

> **Adapter l’exécution aujourd’hui ≠ changer la stratégie de demain.**

### 7.3 Planification : aucun modèle imposé

Prometheus doit pouvoir représenter différentes philosophies de programmation sans en imposer une.

Support cible :

- calendrier fixe ;
- séquence A → B → C indépendante des jours ;
- semaines ;
- microcycles ;
- mésocycles ;
- macrocycles ;
- phases/blocs ;
- accumulation ;
- intensification ;
- deload ;
- taper ;
- maintenance.

Une phase peut modifier :

- volume ;
- répétitions ;
- charge ;
- RIR/RPE ;
- exercices ;
- fréquence ;
- nombre de séries.

Le deload peut être planifié, manuel ou proposé par l’IA.

Les séances peuvent être déplacées sans être automatiquement considérées comme « ratées ».

L’IA doit comprendre la structure planifiée pour ne pas interpréter un deload comme une régression.

### 7.4 Modèles de programmes et individualisation

Un Coach peut avoir des modèles réutilisables.

~~~text
template
→ attribution individuelle
→ personnalisation
→ versions
→ historique
~~~

Règles :

- attribuer un modèle crée une version individualisable ;
- modifier un client ne modifie jamais le modèle source ;
- modifier le modèle ne change pas rétroactivement les clients existants ;
- construction from scratch toujours possible ;
- version history ;
- comparaison de versions ;
- brouillon puis activation future ;
- l’IA peut préparer un brouillon mais ne l’active pas seule.

### 7.5 Formats d’entraînement avancés

Le moteur commun doit être extensible et contextualiser les champs selon l’activité.

Données possibles par série :

- répétitions ;
- charge ;
- RIR/RPE ;
- durée ;
- distance ;
- repos ;
- tempo ;
- type de série.

Formats :

- warm-up ;
- working ;
- back-off ;
- drop set ;
- AMRAP ;
- myo-reps ;
- clusters ;
- isométriques ;
- supersets ;
- circuits ;
- complexes ;
- unilatéral ;
- poids de corps + charge additionnelle.

Le moteur peut être riche ; l’interface ne doit montrer que ce qui est utile au moment concerné.

### 7.6 Douleurs, blessures et contraintes

L’athlète peut déclarer douleur, limitation, blessure connue ou contrainte temporaire.

L’IA ne diagnostique pas.

Solo :
- propositions prudentes ;
- alternative ou réduction adaptée au contexte déclaré ;
- recommandation de consulter un professionnel lorsque le sujet sort du cadre du coaching.

Coaché :
- information visible au Coach ;
- proposition IA éventuellement préparée ;
- décision stratégique au Coach.

Temporaire → adaptation de séance.

Persistant → proposition de modification du programme.

Une contrainte résolue est clôturée mais son historique reste disponible pour éviter les incohérences futures.

### 7.7 Bibliothèque globale d’exercices

Une bibliothèque commune pour Solo, Coaché et Coach.

Pas de bibliothèque privée séparée par Coach.

Fiche canonique :

- nom canonique ;
- alias et orthographes ;
- FR/EN ;
- muscles ;
- mouvement ;
- équipement ;
- variantes ;
- instructions ;
- provenance ;
- statut de validation.

Lorsqu’un exercice manque :

1. recherche des concepts/alias proches ;
2. création minimale : nom, description, muscles ;
3. normalisation/complétion assistée ;
4. si doublon probable : rattacher au canonique ;
5. si nouveau et suffisamment sûr : créer ;
6. si incertain : validation en attente.

Les vrais variants restent distincts.

Les doublons peuvent être fusionnés sans casser les anciennes références ni l’historique de performance.

Aucun utilisateur ne « possède » un exercice global.

---

## 8. IA : proactive, contextuelle, mémorielle et contrôlée

### 8.1 L’IA ne doit pas attendre qu’on lui pose une question

Prometheus analyse automatiquement les données disponibles et pertinentes :

- entraînement ;
- progression ;
- nutrition ;
- poids ;
- check-ins ;
- habitudes ;
- récupération ;
- objectifs ;
- contraintes.

L’absence de donnée n’est pas interprétée comme mauvaise adhérence.

### 8.2 Destinataire des propositions

Solo :
- la proposition va à l’athlète.

Coaché :
- les propositions stratégiques vont au Coach.

> **L’IA observe et propose de manière proactive ; l’humain décide et applique.**

Aucune modification durable importante ne doit être auto-appliquée.

### 8.3 Analyse événementielle + revue hebdomadaire fixe

Deux mécanismes complémentaires :

1. analyse déclenchée lorsqu’un événement réellement significatif apparaît ;
2. revue hebdomadaire globale, une fois par semaine.

La revue hebdomadaire est une boucle système. Elle ne devient pas facultative parce qu’un check-in est moins fréquent.

Les notifications de la revue peuvent être configurées ; la revue analytique elle-même continue d’exister.

### 8.4 Mémoire des signaux et niveau de confiance

Chaque observation peut devenir un signal suivi dans le temps.

Structure conceptuelle :

~~~text
observation
→ hypothèse
→ preuves pour
→ preuves contre
→ confiance qualitative
→ statut
→ action/proposition éventuelle
→ prochaine réévaluation
~~~

Le système doit savoir attendre lorsque le signal est faible.

Il doit éviter de changer plusieurs variables à la fois sans nécessité.

Après une intervention, laisser assez de temps pour observer la réponse avant d’enchaîner un nouveau changement.

### 8.5 Mémoire visible et corrigeable

Solo : écran de type « Ce que Prometheus surveille ».

Coach : mémoire/signes par client.

Un signal peut être :

- corrigé ;
- marqué non pertinent ;
- clôturé ;
- réouvert si nouvelles preuves.

Si une information utilisée auparavant devient fausse, ne pas simplement effacer silencieusement l’histoire : ajouter une correction qui empêche l’ancien contexte d’influencer incorrectement les analyses futures.

### 8.6 Acceptation, modification et refus

Les décisions humaines deviennent du contexte.

Un refus n’est pas un simple bouton sans mémoire.

Stocker lorsque possible :

- décision ;
- raison ;
- modification apportée ;
- moment ;
- contexte.

L’IA ne repropose pas exactement la même chose sans nouvel élément. Si elle revient sur le sujet, elle explique ce qui a changé.

### 8.7 Adapter le minimum nécessaire

Une recommandation doit préférer le plus petit changement susceptible de résoudre le problème observé.

Ne pas réécrire un programme entier lorsqu’un seul exercice ou une seule cible mérite d’être ajusté.

### 8.8 Limites de sécurité et santé

L’IA peut :

- contextualiser une contrainte déclarée ;
- proposer de réduire/remplacer un exercice ;
- signaler qu’un sujet nécessite une évaluation professionnelle.

Elle ne doit pas :

- diagnostiquer ;
- prescrire un traitement médical ;
- présenter une conclusion clinique comme certaine.

### 8.9 IA directe pour un Coaché

Le Coaché peut utiliser l’IA pour l’exécution :

- comprendre un exercice ;
- obtenir une alternative uniquement pour aujourd’hui ;
- comprendre ses propres données ;
- enregistrer une information ;
- proposer une recette compatible avec ses cibles ;
- clarifier une instruction.

Les changements durables sur :

- programme ;
- cibles nutritionnelles ;
- structure de suivi ;
- habitudes prescrites ;

deviennent des brouillons/propositions pour le Coach.

---

## 9. Nutrition : du tracker à la stratégie complète

### 9.1 Profondeur choisie

Nutrition peut aller de simple à avancé.

Options :

- calories ;
- macros ;
- fibres ;
- repas ;
- recettes ;
- favoris ;
- templates de repas/journées ;
- objectifs/cibles ;
- notes et contexte.

Aucun niveau avancé ne doit être obligatoire pour utiliser l’app.

### 9.2 IA nutritionnelle contextuelle

L’IA utilise automatiquement, si disponibles :

- macros restantes ;
- préférences alimentaires ;
- allergies déclarées ;
- objectif ;
- historique ;
- tendances de poids ;
- entraînement ;
- faim/satiété ;
- check-ins.

Ne pas redemander une information déjà connue et fiable.

### 9.3 Cibles et historique

Les cibles nutritionnelles sont datées.

Une cible actuelle ne réécrit jamais l’interprétation historique d’une journée passée.

Solo :
- planification assistée par IA possible.

Coaché :
- le Coach peut définir un cadre/cibles.

### 9.4 Recherche alimentaire, code-barres et base Prometheus

Flux cible :

1. scan du code-barres ;
2. recherche dans la base Prometheus ;
3. recherche Open Food Facts ;
4. si absent : demander photos du produit + étiquette nutritionnelle ;
5. l’IA peut utiliser l’emballage pour identifier le produit ;
6. les valeurs nutritionnelles proviennent de l’étiquette photographiée, pas d’une invention ;
7. création normalisée dans la base Prometheus avec provenance.

Ne jamais fabriquer des valeurs manquantes comme si elles étaient certaines.

---

## 10. Habitudes de vie

Modules facultatifs :

- sommeil ;
- fatigue/récupération ;
- stress perçu ;
- pas/activité ;
- hydratation ;
- faim/satiété ;
- douleur/inconfort ;
- habitudes personnalisées.

L’IA peut chercher des corrélations utiles mais ne juge pas l’utilisateur et ne punit pas une absence de saisie.

En coaching, le Coach peut choisir les habitudes suivies et l’athlète doit comprendre pourquoi elles sont demandées.

---

## 11. Check-ins

### 11.1 Constructeur

Le système doit permettre au Coach de créer des modèles réutilisables.

Types de questions :

- échelle ;
- oui/non ;
- choix multiple ;
- numérique ;
- texte libre ;
- douleur ;
- fatigue.

Les questions conditionnelles sont possibles.

Essentiel d’abord, détails lorsque nécessaire.

### 11.2 Fréquence et relation avec l’IA

Solo :
- template par défaut modifiable.

Coach :
- choisit template et fréquence.

L’historique est conservé.

Un check-in manquant n’est pas automatiquement une mauvaise adhérence.

La revue IA hebdomadaire reste hebdomadaire même si le check-in est bihebdomadaire ou mensuel.

---

## 12. Dashboard personnel

Le Dashboard est une page distincte qui répond simultanément à :

1. « Que dois-je faire maintenant ? »
2. « Où en suis-je aujourd’hui ? »

Modules selon pertinence :

- séance ;
- nutrition ;
- poids/progression ;
- check-in ;
- coaching/messages ;
- modules personnels activés.

Le Dashboard peut contenir un raccourci vers le Calendrier.

Il ne doit pas devenir « Aujourd’hui = un seul verbe ».

Il ne doit pas devenir non plus un mur de cartes sans hiérarchie.

---

## 13. Calendrier personnel : page autonome

Le Calendrier est une page principale de l’espace personnel, au même niveau que Entraînement ou Nutrition.

Disponible au Solo et au Coaché.

### Passé

Sélectionner une date peut montrer :

- séance ;
- nutrition ;
- poids/mensurations ;
- habitudes ;
- check-in ;
- notes ;
- autres éléments actifs ce jour-là.

L’athlète peut corriger ses propres données historiques en cas d’erreur ou d’oubli.

### Futur

Voir :

- séances planifiées ;
- phases/blocs ;
- événements ;
- autres éléments prévus.

Un Coaché peut consulter le futur mais ne réécrit pas rétroactivement le programme assigné par son Coach.

Les corrections personnelles ne doivent jamais falsifier la réalité historique du programme, des cibles ou des décisions actives à l’époque.

> **Dashboard = aujourd’hui / vue d’ensemble. Calendrier = navigation temporelle autonome.**

---

## 14. Progression, records et données corporelles

### 14.1 Pas de score global

Prometheus ne doit pas réduire la progression à un nombre arbitraire du type « 82/100 ».

Présenter des tendances compréhensibles :

- progression par exercice ;
- volume/fréquence ;
- régularité ;
- poids/mensurations ;
- nutrition ;
- récupération/habitudes si activées ;
- relation avec l’objectif actif.

L’IA contextualise ; elle ne transforme pas tout en score.

### 14.2 Records et performances

Records possibles :

- charge maximale ;
- plus de reps à charge équivalente ;
- meilleure performance dans une plage ;
- volume lorsque pertinent ;
- estimation de force seulement si clairement indiquée comme estimation.

Comparer l’utilisateur à lui-même et au même exercice canonique.

Ne pas appeler « PR » des performances non comparables.

### 14.3 Poids

Priorité à la tendance, notamment moyenne hebdomadaire, plutôt qu’à une variation quotidienne isolée.

### 14.4 Mensurations et photos

Mensurations : tendances séparées, aucun score esthétique.

Photos :
- privées par défaut ;
- partage volontaire au Coach possible ;
- comparaison visuelle utilisateur possible.

**L’IA n’analyse jamais les photos de progression.**

Aucun jugement esthétique automatisé.

---

## 15. Expérience Coach

### 15.1 Dashboard Coach = file de décisions

La question principale n’est pas « combien de données ai-je ? » mais :

> **Qui mérite mon attention et pourquoi ?**

Signaux possibles :

- nouveau check-in ;
- proposition IA ;
- baisse de performance ;
- demande de changement ;
- message important ;
- programme arrivant à un point d’attention.

### 15.2 Dossier client central

Centraliser :

- objectif ;
- programme actuel ;
- historique ;
- nutrition si partagée ;
- check-ins ;
- poids/progression ;
- habitudes ;
- messages/contexte ;
- adaptations et décisions.

L’IA prépare ; le Coach décide.

Les décisions importantes sont traçables : quoi, quand, pourquoi.

---

## 16. Marketplace et profil Coach

### 16.1 Marketplace optionnelle

La capacité Coach permet les outils professionnels.

La publication marketplace reste opt-in.

Un Coach peut :
- inviter ses propres clients ;
- obtenir ses clients ailleurs ;
- publier/dépublier son profil ;
sans perdre ses outils Coach ni ses clients actifs.

### 16.2 Dossier professionnel

Champs possibles :

- disciplines ;
- clientèle ;
- objectifs accompagnés ;
- méthodes/style ;
- langues ;
- disponibilité ;
- online / présentiel / hybride ;
- fréquence de contact ;
- expérience ;
- spécialités ;
- prix indicatifs facultatifs ;
- qualifications.

### 16.3 Qualifications et badge Prometheus

Une qualification peut être :

- déclarée ;
- en vérification ;
- vérifiée ;
- rejetée/expirée si nécessaire.

Un Coach peut exercer sur Prometheus sans qualification formelle vérifiée.

Pas de badge si aucune qualification n’a été vérifiée.

Le badge signifie uniquement qu’une qualification a été vérifiée, pas « meilleur Coach ».

Si une qualification non vérifiée est affichée publiquement, distinguer clairement « déclarée » de « vérifiée ».

### 16.4 Pas d’avis ou de note publique pour le moment

Aucun système d’étoiles, score de réputation ou classement public n’est prévu dans la Vision actuelle.

Ne pas l’ajouter sans décision produit explicite.

---

## 17. Matching Athlète ↔ Coach

### 17.1 Questionnaire Athlète

Dimensions envisagées :

- objectif ;
- discipline ;
- niveau ;
- langue ;
- budget ;
- disponibilité ;
- modalité ;
- fréquence de contact ;
- autonomie ;
- style de coaching ;
- matériel ;
- contraintes de temps ;
- besoins particuliers.

### 17.2 Exigences vs préférences

Ordre logique :

1. exigences bloquantes ;
2. préférences fortes ;
3. préférences secondaires.

Exemples d’exigences : langue, modalité, capacité disponible, parfois localisation/budget selon contexte.

Le résultat doit expliquer « pourquoi ce Coach ».

Pas de pourcentage pseudo-scientifique du type « 94 % compatible ».

Le matching n’est pas un classement absolu.

L’annuaire reste consultable librement.

### 17.3 Aucun bon match

Si aucun Coach ne respecte suffisamment les critères :

- le dire clairement ;
- conserver les réponses ;
- permettre de modifier certains critères ;
- permettre de continuer en Solo.

Ne pas afficher un Coach incompatible uniquement pour remplir l’écran.

---

## 18. Prospect, discussion et activation du coaching

### 18.1 Dossier prospect limité

Avant relation active, le Coach voit seulement les informations nécessaires au prospect et explicitement partagées :

- objectif ;
- niveau ;
- discipline ;
- langue ;
- attentes ;
- disponibilité ;
- contraintes importantes ;
- budget si pertinent ;
- court résumé.

Pas d’accès complet à l’historique privé.

### 18.2 Discussion pré-coaching

Une conversation peut commencer pendant la phase prospect.

Le Coach répond aux questions et présente son offre.

### 18.3 L’athlète initie et confirme

Flux obligatoire :

1. l’athlète découvre un Coach ;
2. l’athlète initie la demande/contact ;
3. discussion prospect ;
4. le Coach accepte de poursuivre et présente son offre ;
5. l’athlète confirme explicitement qu’il veut démarrer ;
6. seulement ensuite la relation devient active.

**Le Coach ne crée jamais seul la relation active.**

Avant activation :
- pas de contrôle du programme ;
- pas d’accès complet au tracking.

### 18.4 Pas d’état de pause pour la relation

Une relation de coaching n’a pas d’état « paused ».

Elle est :

- prospect/pending avant activation ;
- active ;
- ended.

Pour arrêter temporairement, la relation est terminée.

Un redémarrage ultérieur crée/réactive un nouveau cycle relationnel via invitation ou marketplace, avec l’historique personnel conservé.

---

## 19. Messagerie

Une conversation principale par relation client.

La conversation prospect peut continuer après activation, plutôt que créer artificiellement plusieurs fils.

Contenus :

- texte ;
- images ;
- vidéo courte ;
- fichiers courants ;
- voix ;
- réponses ;
- objets Prometheus partagés.

Objets contextualisés possibles :

- séance ;
- exercice ;
- série ;
- check-in ;
- programme/révision ;
- proposition IA ;
- objectif.

Une référence doit pointer vers l’objet canonique, pas dupliquer les données sous forme de capture lorsque l’objet Prometheus existe.

La fin de relation retire l’accès aux nouvelles données selon permissions.

---

## 20. Vidéos de technique

Une vidéo peut être attachée à :

- une séance ;
- un exercice ;
- une série.

V1 :
- analyse humaine par le Coach.

Futur éventuel :
- observation IA descriptive uniquement si suffisamment fiable ;
- jamais diagnostic ;
- jamais remplacement du Coach.

Les photos de progression restent explicitement exclues de l’analyse IA.

---

## 21. Notifications

Pas de spam d’engagement.

Niveaux conceptuels :

### Action maintenant
- message Coach ;
- check-in dû ;
- demande de coaching ;
- proposition importante nécessitant une décision ;
- modification active du programme.

### Important mais non urgent
- revue hebdomadaire ;
- tendance ;
- réévaluation d’objectif ;
- programme approchant de sa fin.

### Information
- visible dans l’app sans push obligatoire.

Coach :
- prospect ;
- message ;
- check-in ;
- décision nécessaire ;
- proposition IA.

Regrouper les notifications liées.

Les pushes non essentiels sont configurables.

La notification n’est jamais la source de vérité de l’action.

---

## 22. Confidentialité, propriété et permissions

### 22.1 La donnée appartient à l’athlète

> **Propriété = athlète. Accès = relation / besoin / consentement. Fin de relation = fin d’accès, pas perte de données.**

### 22.2 Catégories d’accès

Privé par défaut :

- photos ;
- informations personnelles sensibles ;
- notes personnelles ;
- conversations privées historiques avec un autre Coach ;
- notes privées d’un ancien Coach.

Partageable selon relation/consentement :

- poids ;
- mensurations ;
- nutrition ;
- check-ins ;
- habitudes ;
- entraînement ;
- objectifs ;
- progression.

Coach actif :
- programme qu’il gère ;
- résultats des séances associées ;
- performances ;
- check-ins demandés ;
- données convenues dans le suivi.

### 22.3 Notes du Coach

Deux types :

- partagées ;
- privées Coach.

Les notes privées restent au Coach et ne sont pas transférées à un nouveau Coach.

---

## 23. Changement de Coach

L’athlète conserve son historique personnel.

Le nouveau Coach ne voit que les informations que l’athlète consent à partager et celles nécessaires à la nouvelle relation.

Ne jamais transférer automatiquement :

- notes privées de l’ancien Coach ;
- conversations privées historiques ;
- informations hors scope de la nouvelle relation.

L’ancien programme reste visible à l’athlète dans son historique mais n’est plus modifiable par l’ancien Coach.

Un résumé de transition peut être partagé volontairement.

---

## 24. Imports et migration

### 24.1 Import personnel

Permettre à un Solo d’apporter son historique quand cela est réaliste.

### 24.2 Import Coach depuis spreadsheet

Priorité élevée pour l’adoption Coach.

Flux :

~~~text
upload
→ analyse structure/colonnes
→ mapping
→ détection exercices/date/séries/reps/charge/RPE/notes
→ ambiguïtés
→ aperçu
→ corrections
→ confirmation
→ écriture transactionnelle
~~~

L’IA peut assister le mapping mais ne doit pas écrire des données incertaines silencieusement.

### 24.3 Client pas encore inscrit

~~~text
Coach prépare un dossier provisoire dans son espace migration
→ invitation
→ client crée/connecte son compte
→ client voit les données à rattacher
→ client confirme
→ données personnelles rattachées au compte de l’athlète
→ relation peut ensuite être activée
~~~

Le Coach ne crée jamais ou ne possède jamais le compte utilisateur de son client.

### 24.4 Import oui, export complet produit non

L’import est une priorité produit.

**Un export complet de toutes les données n’est pas une fonctionnalité produit prévue actuellement.**

Une éventuelle procédure légale de portabilité est un sujet distinct qui devra respecter les obligations applicables sans être transformé automatiquement en feature produit.

---

## 25. Intégrations externes

Extensions possibles :

- Apple Health ;
- Health Connect ;
- Garmin/wearables ;
- balances connectées ;
- CSV/imports ;
- autres plateformes plus tard.

Prometheus reste pleinement utilisable sans intégration.

Chaque donnée importée conserve :

- provenance ;
- timestamp ;
- unité ;
- qualité/confiance si nécessaire ;
- règle de déduplication.

L’IA n’utilise une donnée externe que si son sens et sa qualité sont suffisamment clairs.

Priorité : import spreadsheet Coach avant multiplication des wearables.

---

## 26. Fonctionnement hors ligne

Priorité absolue : séance d’entraînement.

Offline-first pour le cœur actif :

- consulter programme/routine déjà synchronisé ;
- démarrer séance ;
- logger/modifier séries ;
- consulter les informations nécessaires à la séance ;
- mettre les écritures en file ;
- synchroniser plus tard sans doublon.

Peuvent aussi être mis en file progressivement :

- nutrition simple si l’aliment est déjà connu localement ;
- message/brouillon.

Nécessitent réseau :

- marketplace ;
- matching ;
- IA distante ;
- nouvel import distant ;
- recherche alimentaire distante.

Ne pas réécrire l’offline existant s’il respecte déjà ces contrats.

---

## 27. Unités, langue, dates et fuseaux

Stocker les mesures de façon canonique puis convertir pour affichage.

Préférences :

- kg/lb ;
- cm/in ;
- formats de date ;
- langue FR/EN.

La langue d’interface est indépendante de l’unité.

Modifier une préférence ne réécrit pas l’historique.

Les événements absolus gardent un contexte de fuseau.

Principe : une donnée, plusieurs vues.

---

## 28. Modèle économique

### 28.1 Prometheus facture le logiciel, pas le coaching

Prometheus ne traite pas la prestation de coaching entre Coach et athlète.

Le Coach fixe son prix et facture en dehors de Prometheus.

Prometheus ne prend pas de commission marketplace sur le coaching et ne gère pas les litiges/payouts/remboursements liés à cette prestation.

### 28.2 Plans

Solo :
- abonnement Prometheus Solo.

Coach :
- abonnement Prometheus Coach ;
- inclut les outils personnels ;
- peut évoluer selon le nombre de clients actifs.

Coaché :
- aucun abonnement Prometheus direct pendant une relation active ;
- accès couvert par la relation/abonnement Coach.

Coach + Solo :
- paie seulement l’abonnement Coach.

Coach + Coaché :
- paie son abonnement Coach à Prometheus ;
- paie éventuellement son propre Coach à l’extérieur de Prometheus.

### 28.3 Solo → Coaché

L’abonnement Solo s’arrête ou se convertit selon le mécanisme commercial final.

L’utilisateur paie son Coach à l’extérieur.

Son accès Prometheus Coaché est couvert par la relation active.

### 28.4 Coach impayé

Grâce fixe : **7 jours**.

Pendant la grâce :
- outils Coach restent actifs ;
- clients restent Coachés ;
- avertissements ;
- aucune suppression.

Après 7 jours non régularisés :
- outils Coach suspendus ;
- plus de gestion de clients / nouvel accès aux données ;
- aucune donnée supprimée ;
- clients passent en essai Solo.

Suspension ≠ suppression.

### 28.5 Perte du Coach → essai Solo

Essai Solo : **14 jours**.

Pendant ces 14 jours :
- données/historique conservés ;
- entraînement personnel possible ;
- recherche d’un nouveau Coach possible.

Nouveau Coach avant la fin :
- retour Coaché ;
- pas d’abonnement Solo nécessaire.

Sinon :
- abonnement Solo requis après la période d’essai.

### 28.6 Définition client actif

Compte dans la capacité/palier Coach uniquement si la relation de coaching est active.

Ne comptent pas :

- prospect ;
- invitation pending ;
- ancien client ;
- relation ended.

Il n’existe pas d’état relationnel paused.

### 28.7 Prix non décidés

Ne jamais inventer de tarifs.

Les montants, paliers exacts et limites IA seront décidés après données de bêta suffisantes.

---

## 29. Bêta, coûts et futurs quotas IA

### 29.1 Bêta complète

La bêta ouvre l’expérience produit prévue :

- Solo ;
- Coach ;
- Coaché ;
- marketplace ;
- IA ;
- programmes ;
- nutrition ;
- check-ins ;
- suivi.

Ne pas créer une fausse architecture gratuite jetable.

Les entitlements existent ; la bêta les bypass explicitement.

### 29.2 Mesurer les coûts

Mesurer de façon structurée :

- appels IA ;
- modèle ;
- tokens/units ;
- coût ;
- latence ;
- succès/échec ;
- stockage ;
- bande passante ;
- notifications ;
- autres services payants.

Ne pas recopier inutilement dans l’analytics :

- messages privés ;
- réponses détaillées sensibles ;
- photos ;
- notes libres privées.

### 29.3 Plans et quotas IA

Séparer :

- accès au produit ;
- budget IA.

Les fonctions proactives essentielles peuvent être incluses.

Les usages manuels lourds pourront éventuellement consommer davantage de quota.

Montrer l’usage et avertir avant une limite future.

Les nombres exacts ne sont pas décidés.

### 29.4 Sortie de bêta

La fin de bêta dépend de données suffisantes sur :

- usage ;
- rétention ;
- coûts ;
- charge IA ;
- stockage ;
- comportements produit.

Prévenir clairement avant passage payant.

Pas de facturation surprise.

Aucune promesse permanente de « founder pricing » n’est décidée aujourd’hui.

---

## 30. Suppression de compte et conservation

La suppression doit être compréhensible.

Principes :

- retrait opérationnel des accès rapidement ;
- courte fenêtre de récupération possible, durée exacte à valider légalement ;
- puis suppression/anonymisation des données sans justification de conservation ;
- notes privées Coach conservées uniquement si justification légitime et dissociées lorsque possible ;
- analytics conservés uniquement sous forme agrégée/non identifiante lorsque approprié.

Les détails juridiques doivent être validés avec le droit applicable avant production finale.

---

## 31. Blocage, signalement et modération

Bloquer et signaler sont deux actions différentes.

Blocage :
- contrôle immédiat des interactions futures ;
- masque lorsque pertinent.

Signalement :
- ouvre un dossier de modération ;
- catégorie ;
- contexte ;
- éléments de preuve ;
- historique auditable.

Une relation de coaching active ne doit pas être détruite silencieusement par un simple « bloquer ».

L’utilisateur doit être guidé vers une fin de relation explicite lorsque nécessaire.

Prometheus peut suspendre temporairement une visibilité marketplace pendant une revue sérieuse.

---

## 32. Console d’administration Prometheus

Outil interne séparé et fortement restreint pour :

- modération ;
- vérification qualifications ;
- fusion/correction exercices canoniques ;
- subscriptions/grâce ;
- imports en erreur ;
- santé système ;
- télémétrie de coûts.

Actions sensibles auditées.

Éviter les corrections manuelles improvisées directement dans la base lorsque le produit nécessite une capacité durable.

---

## 33. Recherche globale

Recherche contextuelle avec permissions.

Coach :
- clients ;
- prospects ;
- programmes/templates ;
- exercices ;
- conversations.

Athlète :
- exercices ;
- séances ;
- routines/programmes ;
- objets personnels.

La recherche ne doit jamais révéler l’existence d’une ressource à laquelle l’utilisateur n’a pas accès.

---

## 34. Périmètre sportif

Spécialisation actuelle :

- musculation ;
- bodybuilding ;
- powerlifting ;
- hypertrophie / strength.

Fondations extensibles :

- durée ;
- distance ;
- charge ;
- reps ;
- RPE ;
- calendrier ;
- objectifs ;
- mesures personnalisées.

Ne pas diluer l’UX actuelle pour supporter tous les sports avant un chantier explicite.

> **Produit spécialisé maintenant, fondations extensibles pour plus tard.**

---

## 35. Scénarios de référence

### 35.1 Solo

Crée son compte → choisit Solo → configure son suivi → utilise programme/routines/séances libres → données alimentent revue hebdo → reçoit proposition → accepte/modifie/refuse → historique conservé.

### 35.2 Coaché marketplace

Crée son compte → questionnaire matching → shortlist expliquée → envoie une demande → discussion prospect → Coach accepte de poursuivre → athlète confirme → relation active → onboarding coaching → programme/check-ins/messages → Coach décide des adaptations → fin de relation → essai Solo 14 jours.

### 35.3 Coach avec ses propres clients

Crée/active capacité Coach → espace Coaching → importe/invite ses clients → attribue programme/check-ins → reçoit signaux et messages → décide → peut publier ou non sur marketplace.

### 35.4 Coach lui-même coaché

Même compte :
- workspace Coaching pour ses clients ;
- espace Personnel pour son propre suivi ;
- son propre Coach gère sa relation personnelle ;
- l’utilisateur ne peut pas utiliser sa capacité professionnelle pour modifier le programme que son propre Coach lui a assigné.

---

## 36. Invariants non négociables pour les agents

1. Un seul compte utilisateur, pas trois produits.
2. Solo/Coaché = état personnel ; Coach = capacité professionnelle indépendante.
3. Hors bêta, capacité Coach dépend de l’entitlement Coach.
4. Le plan Coach inclut l’usage personnel.
5. Coaché ne paie pas directement Prometheus pendant une relation active.
6. Prometheus ne traite pas le paiement de la prestation de coaching.
7. Marketplace optionnelle pour un Coach.
8. La demande marketplace est initiée par l’athlète.
9. L’activation finale marketplace nécessite une confirmation explicite de l’athlète.
10. Une relation active ne possède pas d’état paused.
11. Les données personnelles appartiennent à l’athlète.
12. Changer de Coach ne transfère jamais automatiquement notes privées ou conversations privées historiques.
13. L’IA est proactive mais n’applique pas seule les changements durables.
14. Les adaptations stratégiques d’un Coaché passent par le Coach.
15. Une revue IA globale existe chaque semaine.
16. Les signaux/hypothèses peuvent persister dans le temps.
17. Les décisions/refus humains deviennent du contexte.
18. Une adaptation « aujourd’hui seulement » ne modifie jamais automatiquement le programme.
19. Le moteur de programmation accepte plusieurs philosophies et n’en impose aucune.
20. Programme, routine et séance libre sont distincts.
21. Programmes et objectifs historiques restent historisés.
22. Pas de score global de progression.
23. Poids : privilégier tendance/moyenne hebdomadaire.
24. Photos de progression : jamais analysées par IA.
25. Calendrier : page autonome Solo + Coaché, séparée du Dashboard.
26. Une conversation principale par client/relation.
27. Bibliothèque d’exercices globale avec alias/dédoublonnage.
28. Pas d’avis/étoiles Coach pour le moment.
29. Un Coach sans qualification vérifiée reste autorisé, sans badge vérifié.
30. Les imports ambigus passent par preview et validation humaine.
31. Import prioritaire ; aucun export complet produit prévu actuellement.
32. Le cœur workout doit rester robuste offline.
33. Grâce Coach = 7 jours.
34. Essai Solo après perte du Coach = 14 jours.
35. La bêta ouvre les capacités mais mesure précisément coûts/usage.
36. Prix, paliers exacts et quotas IA ne sont pas décidés : ne pas les inventer.
37. Produit spécialisé strength/bodybuilding/powerlifting/hypertrophie tant qu’un chantier d’expansion n’est pas explicitement décidé.
38. Workspace Personnel/Coaching n’accorde aucun droit.
39. Une permission critique doit être garantie serveur, pas uniquement masquée dans l’UI.
40. Une future modification ne réécrit jamais silencieusement le passé réalisé.

---

## 37. Checklist obligatoire avant toute implémentation

Avant de coder, l’agent doit répondre :

1. À quel domaine appartient la capacité ?
2. Qui possède la donnée ?
3. Qui peut la lire ?
4. Qui peut la modifier ?
5. Le changement est-il ponctuel ou durable ?
6. Solo et Coaché doivent-ils se comporter différemment ?
7. La capacité/entitlement Coach intervient-elle ?
8. L’action change-t-elle une relation ou seulement une préférence UI ?
9. L’IA peut-elle répondre directement ou doit-elle préparer un brouillon pour le Coach ?
10. Quels signaux/mémoires IA doivent évoluer ?
11. Que se passe-t-il offline ou en réseau instable ?
12. L’historique est-il préservé au lieu d’être réécrit ?
13. Le Calendrier doit-il permettre consultation/correction sur une date ?
14. Les permissions/confidentialité sont-elles respectées ?
15. Une primitive existante couvre-t-elle déjà le besoin ?
16. Quel état serveur/base est source de vérité ?
17. Quel événement prouve le succès réel ?
18. Quelle télémétrie coût/usage est requise pendant la bêta ?
19. Quels tests prouvent la conformité à la Vision ?
20. Cette tâche introduit-elle une nouvelle décision produit qui nécessite une validation explicite ?

Si une réponse importante est inconnue : inspecter avant de coder.

---

## 38. Points volontairement ouverts

Ne pas inventer de réponse dans le code ou les docs sans décision produit explicite :

- prix exact Solo ;
- prix exact Coach ;
- paliers exacts Coach ;
- quotas IA exacts ;
- unité de quota IA ;
- add-ons IA éventuels ;
- durée exacte de la bêta ;
- avantages commerciaux éventuels pour early/founder users ;
- calendrier juridique exact de suppression/récupération ;
- analyse IA avancée de vidéo technique ;
- expansion vers d’autres sports ;
- détails de facturation Solo → Coaché lorsque le modèle commercial sera implémenté.

---

# Conclusion

Prometheus doit rester **simple à utiliser en surface, profond sous le capot**.

La réussite n’est pas d’accumuler des fonctionnalités. Elle consiste à faire fonctionner un moteur commun cohérent où :

- les utilisateurs gardent leurs données et leur continuité ;
- Solo, Coaché et Coach peuvent coexister sur le même compte ;
- le Coach garde l’autorité sur son coaching ;
- l’IA apporte de la valeur sans devenir une autorité opaque ;
- le produit peut croître sans créer trois architectures parallèles ;
- chaque nouvelle PR rapproche réellement le code de cette Vision.
