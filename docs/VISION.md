# Vision produit — Prometheus

**Source de vérité produit — mise à jour le 10 septembre 2026.**

Prometheus est une plateforme de coaching intelligent pour l’entraînement de force et de physique : musculation, bodybuilding et powerlifting, en français et en anglais.

> Prometheus comprend l’athlète, construit son plan, observe son évolution et prépare les prochaines décisions.
>
> En solo, l’athlète valide. Avec un coach, Prometheus prépare et le coach valide.

L’ordre de construction est dans `docs/CHANTIER.md`.

## Positionnement

Prometheus n’est pas un simple journal d’entraînement ni un générateur ponctuel de programmes. Le produit relie trois capacités :

1. **Comprendre** : questionnaire, profil et historique de suivi.
2. **Construire** : programme et cibles cohérents avec les contraintes de l’athlète.
3. **Adapter** : détecter les changements, expliquer une proposition et laisser l’humain décider.

Le marché initial est la musculation, le bodybuilding et le powerlifting. Les autres disciplines pourront être étudiées plus tard afin d’éviter de disperser le produit.

## Les trois rôles

| | Coach | Client coaché | Solo |
|---|---|---|---|
| Entrée | Inscription libre | Invitation ou future demande acceptée | Inscription libre |
| Accueil | Command Center et file du jour | Séance, check-in, messages et modules suivis | Tracker complet et revue hebdomadaire |
| Programme | Crée et assigne | Exécute le programme assigné | Crée ou valide une proposition |
| Nutrition | Décide pour ses clients | Consulte ses cibles | Ajuste ou valide ses cibles |
| Copilote | Prépare des brouillons et priorités | Son coach reçoit les propositions | Prépare les propositions pour l’athlète |
| Autorité finale | Coach | Coach pour le plan de coaching | Athlète |

Un compte conserve son historique lorsqu’il passe de solo à coaché ou revient au mode solo.

## Principes produit

### L’IA prépare, l’humain décide

Toute proposition présente le changement, sa justification et les actions accepter, modifier ou refuser. Aucune adaptation ne s’applique automatiquement.

### Le programme reste vivant

Le plan peut évoluer à la suite d’un changement de disponibilité, d’objectif, de préférence ou de contrainte. Les modifications sont résolues par identifiant, prévisualisées puis enregistrées comme révision. L’historique ne doit pas être écrasé.

### Le suivi doit être individualisé

Le coach choisit les modules suivis pour chaque client. Un module désactivé ne produit ni rappel, ni reproche, ni conclusion d’adhérence.

L’analyse hebdomadaire utilise une fenêtre cohérente, les cibles réellement applicables aux dates observées et les signaux déclarés. Un manque de suivi conduit d’abord à une relance, pas à une modification automatique des objectifs.

### Les transitions de rôle sont réversibles

Un client peut avoir un seul coach actif. À la fin d’une relation :

- le rôle coaché prend fin ;
- le suivi configuré par le coach est retiré ;
- le programme assigné est mis en pause ;
- les données personnelles et les cibles restent disponibles ;
- le compte repasse en mode solo.

Le futur parcours de changement de coach doit préserver les données de l’athlète sans transférer les notes privées de l’ancien coach.

### Le bilingue est natif

Les parcours, messages et propositions existent en français et en anglais. La langue de l’utilisateur détermine l’affichage et la langue des brouillons.

### La confiance passe avant l’automatisation

Une action réussie à l’écran doit être réellement persistée. Les erreurs sont visibles, les opérations importantes sont atomiques et les actions rejouées sont idempotentes. La mauvaise connexion ne doit pas faire perdre une séance.

### La confidentialité est intégrée

Les accès sont limités par la relation coach-client et par RLS. La télémétrie n’enregistre ni texte libre, ni réponse au questionnaire, ni signal médical, ni contenu de message.

## Capacités livrées

### Socle athlète

- séances, routines, progression, statistiques et calendrier ;
- nutrition, recherche d’aliments, scanner, recettes, eau et poids ;
- check-ins et photos ;
- reprise hors ligne des séances ;
- questionnaire initial et reprise du brouillon.

### Coaching

- invitations et roster ;
- fiche client 360 ;
- configuration des modules suivis et des cibles ;
- programmes, assignations et révisions ;
- messages, notes et propositions d’intervention ;
- fin de relation avec retour solo ;
- séparation entre clients actifs et archives.

### Moteur intelligent

- proposition de programme initial ;
- modifications de programme en langage naturel ;
- revue hebdomadaire solo ;
- analyse déterministe du roster coach ;
- brouillons d’intervention ;
- validation des sorties avant leur présentation ;
- aucun plan complet simulé lorsque le modèle échoue.

### Fiabilité et sécurité

- isolation des comptes et des coachs ;
- RLS testée par matrice ;
- sauvegardes de programmes atomiques ;
- interventions et messages idempotents ;
- fichiers validés ;
- temps réel sur la fiche client ;
- chargement initial réduit ;
- accessibilité de base ;
- rappels quotidiens planifiés.

## État actuel et écarts

| Sujet | État |
|---|---|
| Coach, client coaché et solo | Livré |
| Boucles programme et nutrition avec validation humaine | Livré |
| Copilote coach et solo | Livré |
| Recherche aliments/exercices et portions | Livré |
| Sécurité, RLS, atomicité et reprise hors ligne | Auditée et testée |
| Questionnaire standard versionné | Fondations livrées |
| Builder de questionnaire par coach | À construire |
| Départ autonome, annuaire et changement de coach | À construire |
| Historique visuel de cycles/blocs | À construire |
| Billing et règles d’essai | À décider puis construire |

## Modèle commercial cible

- Le solo paiera un abonnement Prometheus.
- Le coach paiera selon une formule adaptée au nombre de clients.
- Le client coaché sera inclus dans l’abonnement de son coach.
- Un solo qui rejoint un coach ne doit pas payer deux fois.

Le produit reste gratuit pendant sa construction. Les prix, paliers, essais et taxes doivent être décidés avant d’activer le billing.

## Production

- Branche : `new-JV`.
- Frontend : Netlify sur `tracker.prometheus-fit.com`.
- Backend : Supabase `phyuijjekxtjvipjtdfv`.
- Audit #68 mergé ; CI et matrice RLS vertes.
- `coach-fleet-round` v32 et `coach-agent` v26 actifs.
- Cron de rappels actif.
- Migrations alignées sur 98 versions, dernière `20260910160000`.

Les versions live détaillées sont dans `supabase/functions.deployed.lock.json`. Les priorités sont dans `docs/CHANTIER.md`.

## Invariants

- Un seul coach actif par client.
- L’IA ne s’auto-applique jamais.
- Un client coaché ne modifie pas directement les cibles gérées par son coach.
- Un coach ne peut agir que sur ses propres clients.
- Le mode solo reste un produit complet.
- Les données personnelles suivent l’athlète lors des transitions.
- RLS sur les tables exposées et tests pour les écritures privilégiées.
- FR et EN pour toute interface utilisateur.
- Les migrations appliquées sont immuables.
- Les erreurs importantes sont visibles et récupérables.
