# Chantier — Prometheus

**Mis à jour : 10 septembre 2026.**

Ce document décrit uniquement l’ordre de travail actuel. La vision produit se trouve dans `docs/VISION.md` et reste prioritaire en cas de contradiction.

## État actuel

Le socle produit et l’audit de fiabilité sont terminés :

- trois rôles fonctionnels : coach, client coaché et solo ;
- questionnaire standard et reprise ;
- programmes coach et solo ;
- propositions IA avec validation humaine ;
- suivi coach-client, messages, check-ins, photos et temps réel ;
- nutrition, recherche d’aliments et portions cohérentes ;
- opérations critiques atomiques et idempotentes ;
- isolation RLS testée par une matrice automatisée ;
- file hors ligne durable pour les séances ;
- télémétrie minimisée ;
- rappels quotidiens planifiés ;
- performances, accessibilité et validation des fichiers améliorées.

### Production vérifiée

| Élément | État |
|---|---|
| Branche frontend | `new-JV` |
| Audit #68 | Mergé |
| CI et matrice RLS | Vertes |
| Migrations | 98/98 alignées ; dernière `20260910160000` |
| `coach-fleet-round` | v32 `ACTIVE` |
| `coach-agent` | v26 `ACTIVE` ; JWT et CORS opérationnels |
| Rappels | Cron actif chaque minute ; dernières exécutions réussies |

La PR #69 prépare un workflow CLI manuel pour de futurs déploiements d’Edge Functions. Elle est optionnelle et reste en draft tant que le secret GitHub et le workflow n’ont pas été validés.

## Priorité 1 — Builder de questionnaire par coach

Le standard de 27 questions existe déjà et son contrat est versionné. Il manque l’outil permettant à chaque coach de personnaliser ce questionnaire.

### Données

Créer une définition versionnée appartenant au coach :

- nom et version ;
- groupes ou écrans ;
- questions ordonnées ;
- types de réponses ;
- labels FR et EN ;
- caractère obligatoire ;
- drapeau médical ;
- correspondance éventuelle avec un champ standard.

Les identifiants standards et leur sens restent stables. Une modification crée une nouvelle version ; les réponses existantes restent rattachées à la version remplie.

### Expérience coach

Prévoir une page dédiée pour :

- créer ou dupliquer un questionnaire ;
- ajouter, retirer et réordonner les questions ;
- modifier les deux langues ;
- prévisualiser le parcours ;
- choisir le questionnaire par défaut ;
- revenir au template standard.

### Expérience athlète

- Un solo reçoit toujours le questionnaire standard.
- Un invité reçoit le questionnaire choisi par son coach.
- Le brouillon reste reprenable.
- La fiche client affiche les réponses selon la bonne définition.
- Les questions personnalisées sont transmises au copilote comme contexte générique sans modifier les champs standards.

### Conditions de fin

- RLS prouvée pour coach, invité et autre coach.
- Anciennes réponses encore lisibles après une nouvelle version.
- Parité FR/EN.
- Tests du rendu, de la reprise, du mapping et du contexte agent.
- Télémétrie sans contenu de réponse ni signal médical.

## Priorité 2 — Recherche et changement de coach

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

### Conditions de fin

- Isolation RLS entre les parties.
- Aucun transfert des notes privées de l’ancien coach.
- Historique personnel de l’athlète conservé.
- États d’attente, refus et erreurs visibles.
- Tests coach/client et télémétrie minimale.

## Priorité 3 — Billing

Ne pas commencer avant les décisions produit suivantes :

- prix du solo ;
- paliers coach selon le nombre de clients ;
- durée et population concernée par l’essai ;
- devise et taxes ;
- comportement exact à l’expiration.

Le futur mur doit conserver un accès en lecture aux données et permettre d’accepter une invitation coach. Un coach qui dépasse son palier conserve ses clients existants mais ne peut plus en ajouter.

## Travaux transversaux autorisés

À réaliser lorsqu’ils soutiennent une priorité ou corrigent un problème mesuré :

- écran interne de lecture de la télémétrie ;
- historique visuel et restauration des révisions de programme ;
- cycles, semaines, blocs et changements de phase ;
- types de prescription au-delà des répétitions ;
- extension de la file hors ligne à d’autres écritures ;
- optimisation des policies après preuve RLS ;
- amélioration des performances fondée sur des mesures.

## Règles de livraison

- Une fonctionnalité inclut ses états chargement, vide, erreur et reprise.
- Toute copie visible est disponible en FR et EN.
- Toute écriture critique est atomique ou idempotente selon le cas.
- Une modification RLS ou `SECURITY DEFINER` inclut la matrice de sécurité correspondante.
- Une modification de télémétrie met à jour `docs/TELEMETRY.md` dans le même commit.
- Une migration appliquée n’est jamais réécrite.
- Une proposition IA exige toujours une validation humaine.
