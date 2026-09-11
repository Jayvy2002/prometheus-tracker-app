# Chantier — Prometheus

**Mis à jour : 11 septembre 2026.**

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

### Plan technique de départ — non implémenté

Ces noms guident l’implémentation, mais doivent être confrontés au schéma au moment du chantier :

- table proposée `coach_questionnaires (coach_id, name, version, questions jsonb, is_default)` ;
- schéma de question proposé : `id`, `type`, `label_fr`, `label_en`, `options`, `required`, `medical_flag`, `maps_to` ;
- types de réponse initiaux : `single`, `multi`, `text`, `number`, `yes_no`, `weekdays` ;
- référence nullable proposée `coach_invites.questionnaire_id`, avec repli vers le questionnaire par défaut du coach ;
- route coach proposée `/coach/questionnaire` ;
- `compactIntake` conserve les champs standards via `maps_to` et transmet les questions personnalisées comme contexte générique ;
- la fiche 360 rend les réponses avec la définition et la version réellement utilisées ;
- futur événement proposé : `intake_completed` avec identifiant et version du questionnaire, sans réponse utilisateur. Il devra être ajouté au contrat de télémétrie au moment de l’implémentation.

Risques à traiter : stabilité des identifiants standards, taille du contexte transmis au copilote, traduction incomplète d’une question personnalisée et lecture durable des anciennes versions.

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

### Plan technique de départ — non implémenté

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

## Priorité 3 — Billing

Ne pas commencer avant les décisions produit suivantes :

- prix du solo ;
- paliers coach selon le nombre de clients ;
- durée et population concernée par l’essai ;
- devise et taxes ;
- comportement exact à l’expiration.

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
