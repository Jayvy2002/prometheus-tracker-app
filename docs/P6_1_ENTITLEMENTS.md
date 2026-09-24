# P6.1 — Entitlements indépendants

## Contrat

Un droit commercial dit ce qu’un compte peut utiliser, **par produit** (`solo`, `coach`). Il est séparé :

- de l’identité et de la capacité Coach (`user_roles`, `user_capabilities`) ;
- des relations (`coach_client_links`) ;
- de l’espace affiché (Personal / Coaching).

Écrire un droit ne change jamais une capacité ni une relation. Un Coach dont le droit expire garde sa capacité et ses clients. Un client ne reçoit pas le droit de son Coach, et l’inverse non plus.

**Rien n’est bloqué par cette sous-tâche.** Elle représente et calcule. La politique bêta (qui a accès à quoi) est P6.2. La mesure des coûts est P6.3. La facturation est P6.4. Aucun prix, aucun quota Coach n’est décidé : `client_limit` peut rester nul et n’est jamais appliqué ici.

## Table

`public.account_entitlements`, clé `(user_id, product)` :

| Champ | Sens |
|---|---|
| `status` | `beta`, `trial`, `active`, `past_due`, `canceled` |
| `source` | `beta`, `trial`, `billing`, `operator` |
| `period_ends_at` | fin de la bêta, de l’essai ou de la période payée ; nul = sans fin (bêta, actif) |
| `grace_ends_at` | Coach seulement, posé au passage en `past_due` |
| `client_limit` | Coach seulement ; nul = aucune limite décidée |
| `billing_status` | statut brut du fournisseur, pour le support ; jamais une décision d’accès |

Contraintes : un essai a une fin ; la grâce n’existe qu’en `past_due` ; un Solo n’a ni grâce ni limite de clients.

## Accès effectif

`entitlement_access` et `effective_entitlements` calculent `beta | paid | trial | grace | expired | none`. Le miroir TypeScript est `src/features/entitlements/domain/entitlements.ts`.

- `beta` et `active` sans fin restent ouverts ; avec une fin passée, `expired`.
- `canceled` garde l’accès payé jusqu’à la fin de période.
- `trial` exige une fin future.
- `past_due` : Coach en `grace` pendant **7 jours** (`coach_grace_interval()`, P1.5), puis `expired`. Un Solo `past_due` n’a pas de grâce.
- La grâce est posée une fois. Un second `past_due` ne la prolonge pas. Un retour en `active` l’efface.
- Essai Solo : `user_profiles.solo_trial_ends_at` (P1.5, 14 jours, unique à vie) reste la source. Il compte seulement si aucun droit Solo plus fort n’existe.
- Coach : `active_clients` compte les liens actifs ; `over_limit` est seulement informatif.

## Qui lit, qui écrit

- Lecture : chacun lit **ses propres** lignes (RLS) et `get_my_entitlements()`. Aucune relation ne donne accès aux droits d’un autre compte.
- Écriture : `set_account_entitlement(...)` (`SECURITY DEFINER`, `service_role` seulement). Aucun droit d’écriture `authenticated` sur la table.
- `effective_entitlements` et `entitlement_access` : `service_role` seulement.

## Héritage

`user_roles.role` (`free` / `premium`) et `public.subscriptions` ne sont pas lus. Les fonctions Stripe sont retirées (410) et rien n’écrit ces tables. Elles ne sont pas supprimées dans cette sous-tâche.

## Surface

Profil → Avancé → carte « Accès », en lecture seule : ligne Personnel, ligne Coach pour un Coach (clients actifs, limite si elle existe). États chargement, erreur avec réessai (« ce n’est pas une absence d’accès ») et prêt. Aucun lien de paiement, aucun prix.

## Réponses du protocole

1. Domaine : commercial (`src/features/entitlements`).
2. Propriétaire des données : l’utilisateur (`ON DELETE CASCADE`).
3. Lecture : le compte lui-même.
4. Écriture : `service_role` (future facturation, politique bêta, opérateur).
5. Relation / capacité nécessaire : aucune ; c’est volontaire.
6. Garanti côté DB : grants, RLS, contraintes, grâce posée une fois.
7. Primitives réutilisées : `coach_grace_interval()`, `solo_trial_ends_at`.
8. Source de vérité : `account_entitlements` + le tampon d’essai P1.5.
9. Offline : lecture seule ; sans réseau, la carte affiche l’erreur, pas « aucun accès ».
10. Solo, Coaché, Coach, Coach coaché : chaque produit est lu séparément ; être coaché n’accorde et ne retire aucun droit Solo.
11. Fin de relation : aucun effet sur les droits.
12. Preuves : `supabase/tests/p6_entitlements.sql` (étape CI), `src/features/entitlements/domain/entitlements.test.ts`.

## Migration

`20260924205000_p6_entitlements`, pending. D’abord horodatée `20260923140000` ; renommée avant son application parce que la production avait déjà reçu les migrations de l’audit 2 (`20260924200000`) et que la CLI refuse d’insérer une version antérieure à la dernière version distante. Elle ne crée que des objets nouveaux (`account_entitlements` et ses fonctions), l’ordre n’a donc aucun effet sur le schéma.
