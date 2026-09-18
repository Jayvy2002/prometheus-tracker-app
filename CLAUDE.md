# CLAUDE.md — Prometheus

> **RÈGLES OBLIGATOIRES POUR LES AGENTS ET DÉVELOPPEURS**
>
> Lire ce fichier au début de toute tâche. Lire ensuite `docs/VISION.md`, `docs/CHANTIER.md` et les fichiers du domaine touché.
>
> `AGENTS.md` porte le même contrat pour les agents qui le détectent automatiquement. Cursor charge aussi la règle projet Always Apply dans `.cursor/rules/prometheus.mdc`. En cas de contradiction, corriger les documents dans le même changement plutôt que choisir silencieusement une interprétation.

## Sources de vérité

| Sujet | Source |
|---|---|
| Destination produit et invariants | `docs/VISION.md` |
| Ordre du travail restant | `docs/CHANTIER.md` |
| Parcours, permissions et architecture fonctionnelle cible | `docs/CARTE_PRODUIT.md` |
| Architecture frontend et frontières de domaines | `docs/ARCHITECTURE.md` |
| État actuel et commandes | `README.md` |
| Migrations | `supabase/migrations/` + lock |
| Edge Functions déployées | `supabase/functions.deployed.lock.json` |
| Design | `docs/DESIGN_SYSTEM.md` |
| Télémétrie | `docs/TELEMETRY.md` |

## Discipline de branche et PR

`new-JV` est la branche d’intégration stable. Pour une capacité fonctionnelle :

- partir du dernier `new-JV` vert ;
- créer `agent/pX-Y-description-courte` ;
- une PR = une sous-tâche cohérente ;
- inspecter l’existant avant de créer une nouvelle primitive ;
- utiliser `.github/pull_request_template.md` ;
- mettre `docs/CHANTIER.md` à jour dans la même PR lorsqu’un statut change ;
- attendre tous les checks pertinents verts ;
- relire le diff final et produire le compte rendu ;
- **s’arrêter avant merge et avant le chantier suivant jusqu’au feu vert explicite de Jean-Vincent.**

Aucun agent ne doit pousser directement une implémentation sur `new-JV`, réécrire son historique ou regrouper plusieurs chantiers dépendants simplement pour aller plus vite.

**Tâche autorisée actuelle : lire le bloc `CURRENT IMPLEMENTATION GATE` au début de `docs/CHANTIER.md`. C’est l’unique pointeur de prochaine sous-tâche ; ne pas en dupliquer le numéro dans ce fichier.**

## Contrat produit fondamental

Prometheus = **marketplace de coaching + moteur commun de suivi de performance + système d’exploitation du coaching**.

Ne jamais construire trois produits séparés.

Modèle cible :

```text
Utilisateur
├── espace personnel
│   ├── Solo : aucun Coach actif
│   └── Coaché : relation Coach active
├── capacité Coach indépendante : oui/non
├── workspace affiché : Personal/Coaching
├── publication marketplace : oui/non
└── entitlements commerciaux séparés
```

### Invariants absolus

- Solo/Coaché est un **état personnel** ; Coach est une **capacité professionnelle indépendante**.
- Un Coach peut s’entraîner personnellement et peut lui-même être coaché.
- Un client ne possède qu’un Coach actif à la fois.
- Le workspace affiché n’accorde aucun droit.
- Permissions = **ressource + propriétaire + relation + action**, pas simplement persona.
- IA : **prépare uniquement**. Solo ou Coach valide explicitement les changements.
- L’absence de donnée ne signifie ni faute ni mauvaise adhérence.
- Les données personnelles restent liées à l’utilisateur à travers Solo ↔ Coaché.
- Une demande marketplace n’est pas une relation active.
- Après acceptation du Coach, **l’athlète confirme finalement** avant activation marketplace.
- Dashboard = priorité + vue d’ensemble du jour.
- Calendrier personnel = Solo + Coaché, passé + futur.
- Programmes versionnés ; ne jamais réécrire silencieusement le passé réalisé.
- Pas d’avis/étoiles Coach sans décision produit explicite.
- Essai Solo = **14 jours**.
- Grâce Coach = **7 jours**.
- Les prix définitifs ne sont **pas décidés** : ne jamais en inventer.
- La bêta peut bypasser le paiement mais doit mesurer l’usage et les coûts.
- Séance offline prioritaire.
- FR/EN, mobile, accessibilité, états vide/erreur/reprise font partie de « terminé ».

## Avant de coder une capacité

L’agent doit pouvoir répondre avant l’implémentation :

1. Quel domaine possède la capacité ?
2. Qui possède les données ?
3. Qui peut lire ?
4. Qui peut écrire ?
5. Quelle relation/capacité/entitlement est réellement nécessaire ?
6. Quelle règle doit être garantie côté DB/RPC ?
7. Quelle primitive existante peut être réutilisée ?
8. Quel état est la source de vérité ?
9. Quel comportement offline est nécessaire ?
10. Quel comportement pour Solo / Coaché / Coach / Coach lui-même coaché ?
11. Que devient la donnée à la fin d’une relation ?
12. Quels tests prouvent la fin ?

Si une réponse est inconnue, inspecter le code et les docs. Ne pas inventer une architecture locale pour faire passer l’écran.

## Discipline d’implémentation

### Réutiliser avant de créer

Avant toute nouvelle table, store, RPC, Edge Function ou écran :

- rechercher les primitives existantes ;
- vérifier les migrations les plus récentes, pas seulement une migration historique ;
- vérifier si le comportement existe mais n’est simplement pas raccordé ;
- éviter tout moteur parallèle par persona.

Exemples :

- entraînement : réutiliser le moteur commun de séances ;
- programmes : étendre modèle/version/révision, ne pas créer un « coach program engine » séparé ;
- IA : faire converger les briques weekly review/fleet plutôt qu’ajouter un troisième moteur ;
- messages : prolonger la conversation de relation plutôt qu’ajouter une inbox prospect indépendante si ce n’est pas nécessaire.

### Frontend

Direction cible :

```text
UI
→ hook / use case / model
→ API du domaine
→ Supabase
```

Les nouvelles fonctionnalités ne doivent pas mettre de logique métier ou d’orchestration Supabase directement dans un gros composant d’écran.

Pas de refactor global pour la beauté. Lorsqu’un domaine est touché, améliorer sa frontière progressivement.

### Backend

Toute règle critique d’autorisation, d’unicité, d’activation ou de transition doit être garantie côté base/RPC, pas uniquement par masquage UI.

RLS sur les tables exposées. RPC `SECURITY DEFINER` étroites avec contrôle `auth.uid()`, cible, état précédent et droits `EXECUTE` explicites.

Les migrations appliquées sont immuables. Toujours ajouter une nouvelle migration.

### États métier explicites

Ne pas fusionner des états qui ont un sens différent.

Exemples :

- demande marketplace ≠ Coach accepté ≠ Athlète confirmé ≠ relation active ;
- relation active ≠ abonnement payé ;
- brouillon ≠ sauvegardé ≠ publié ≠ actif ;
- notification envoyée ≠ message enregistré/livré/lu ;
- donnée absente ≠ valeur zéro ≠ erreur de chargement.

## IA et mémoire

Le moteur cible suit :

```text
observations
→ signaux
→ hypothèses
→ preuves pour/contre
→ confiance
→ attendre / proposer / clôturer
→ décision humaine
→ mémoire
```

Une revue hebdomadaire existe pour chaque athlète et analyse uniquement les modules pertinents.

Ne pas transformer une analyse en action automatique. Ne pas générer de diagnostic médical.

Les refus/ajustements humains doivent pouvoir influencer les revues suivantes au lieu de repartir de zéro.

## Marketplace

- Profil Coach = opt-in.
- Capacité Coach ≠ publication marketplace.
- Matching : exigences bloquantes puis préférences ; expliquer les correspondances.
- Pas de pourcentage de compatibilité arbitraire.
- Qualifications : déclarées / en vérification / vérifiées / rejetées-expirées si besoin.
- Coach sans qualification vérifiée autorisé sans badge.
- Pas d’avis/étoiles.
- Avant activation : accès limité aux données explicitement consenties pour la prospection.
- Activation marketplace nécessite confirmation finale de l’athlète.

## Programme et entraînement

Conserver le moteur existant : prescriptions, types de séries, supersets, révisions, fork, attribution.

Évolution cible :

```text
Programme
→ phases/blocs
→ cycles
→ séances/templates
→ exercices/prescriptions
```

Supporter progressivement calendrier **et** séquence A→B→C. Ne pas remplacer le logger.

Une modification future ne change jamais une séance historique réalisée.

## Données personnelles

Le Coach peut accéder aux données autorisées de ses clients actifs ; il ne devient jamais propriétaire de leurs données personnelles.

Fin de relation :

- lien fermé ;
- permissions retirées ;
- programme coaché archivé/mis en pause selon contrat ;
- notes privées Coach privées ;
- historique personnel utilisateur conservé ;
- utilisateur Solo si aucun Coach actif.

## Commercial et bêta

Commercial séparé de l’identité.

Représenter les entitlements indépendamment des rôles et relations.

Décisions actuelles :

- essai Solo 14 jours ;
- grâce Coach 7 jours ;
- paliers Coach susceptibles de dépendre des clients actifs ;
- prix non décidés ;
- bêta = accès bypass possible + consommation toujours mesurée.

Ne jamais faire dépendre `coachCapability` d’un simple paramètre de retour Stripe.

## Import et intégrations

Priorité adoption Coach : import spreadsheet/CSV intelligent avant la multiplication des wearables.

Import = analyse → mapping → ambiguïtés → preview → corrections → confirmation → transaction.

Aucune ambiguïté importée silencieusement.

Health/Garmin/etc. alimentent le moteur commun et gardent provenance + timestamp + unité.

## Commandes obligatoires

Avant de considérer une tâche terminée :

```bash
npm test
npm run typecheck
npm run lint
npm run build
npm run verify:migrations
npm run verify:edges
```

Pour RLS/RPC sensible :

```bash
npm run test:rls
```

Une CI rouge n’est pas un état acceptable pour poursuivre un chantier normal.

## Sécurité et production

Convention d’environnement : `.env.example` décrit les variables avec des placeholders ; `.env.production` contient uniquement les clés publiques frontend (URL Supabase, clé anon, clé VAPID publique). Pour travailler sur ce dépôt, copier `.env.production` vers `.env`, qui reste local et ignoré par Git. Aucun `service_role` ni secret serveur dans ces fichiers.

- aucun secret serveur dans Git ou frontend ;
- aucun test destructif sur prod ;
- confirmer explicitement toute action destructive ;
- writes atomiques/idempotents lorsque les retries sont possibles ;
- ne jamais signaler succès avant write confirmée ;
- protéger les données privées dans la télémétrie.

## Conventions du repo

- TypeScript strict.
- React + Zustand existants ; pas de Redux sans nécessité démontrée.
- Supabase reste le backend ; pas de microservices par défaut.
- Tailwind + design system existant ; pas de nouvelle UI library sans justification.
- `src/features/<domain>` pour le métier ; `shared` ne dépend pas de features.
- Respecter les overlays ESLint et les alias existants.
- Le code historique peut conserver des façades/réexports ; ne pas faire de migration massive sans bénéfice fonctionnel.

## Règle finale

Une PR doit livrer **une capacité observable ou une correction cohérente**, avec ses tests et sa documentation lorsque le contrat durable change.

Ne jamais optimiser localement au prix de la Vision globale.
