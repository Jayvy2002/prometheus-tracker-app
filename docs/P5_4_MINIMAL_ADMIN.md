# P5.4 — Admin minimal

> En revue. Migration candidate `20260923021000_p5_minimal_admin`, déclarée dans `migrations.pending.json`. Elle n’est pas dans le lock production (137) tant qu’elle n’a pas été observée.

Console privée pour opérer le catalogue, les qualifications, les imports en échec et les signalements. Ce n’est pas un back-office générique. Abonnements, grâce, santé système et coût restent hors de ce contrat.

## Qui agit

`platform_operators` est une allowlist. `revoked_at` retire l’accès sans effacer l’historique. `is_platform_operator()` dit à l’utilisateur connecté s’il est actif. Aucun opérateur n’est semé dans la migration.

Le premier opérateur est accordé par `grant_platform_operator` avec le rôle serveur (`service_role`). Un opérateur déjà actif peut ensuite en accorder ou en retirer un autre, avec `p_confirm = true`. Le dernier opérateur actif ne peut pas se retirer (`last_operator`).

`grant_platform_operator` et `admin_revoke_platform_operator` prennent le même mutex `lock_platform_operators` (classe `20014508`). Un contrôle d’opérateur avant le verrou échoue vite. Sous le verrou, un appel `service_role` reste autorisé ; un utilisateur authentifié est revérifié avec `is_platform_operator()`. S’il a été révoqué pendant l’attente, l’appel échoue `not_authorized` avant toute lecture ou écriture de l’allowlist. Le nombre d’opérateurs actifs est recompté sous ce verrou. Une révocation qui laisserait zéro opérateur actif échoue, y compris quand deux révocations croisées arrivent ensemble.

`platform_admin_audit` enregistre l’acteur, l’action, le sujet et une note. Les deux tables ont RLS activé, aucune policy cliente, et aucun droit `anon` / `authenticated`.

## Ce qui ne s’élargit pas

`review_coach_qualification`, `review_marketplace_report` et `merge_exercises` restent exécutables par `service_role` seulement. Les wrappers `admin_*` sont exécutables par `authenticated` et échouent en `not_authorized` si l’appelant n’est pas opérateur actif. `admin_require` et `admin_audit` ne sont pas accordés à `authenticated`.

Les actions qui écrivent exigent `p_confirm = true` (`confirmation_required`). Refuser une qualification, refuser une proposition, classer un signalement, suspendre ou rétablir l’annuaire, et accuser réception d’un import exigent une note.

## Champs montrés

Les listes omettent l’e-mail, le chemin de preuve, le nom de fichier, les lignes brutes, le mapping et l’identité du rapporteur. Le libellé coach ou cible est `user_profiles.full_name`, tronqué à 80 caractères.

Ouvrir une preuve est un acte explicite : `admin_open_qualification_proof` écrit un audit, puis une policy Storage autorise la lecture de cet objet pendant 10 minutes pour cet opérateur. La page télécharge le fichier et ne l’affiche pas dans la liste.

## Exercices

Approuver une proposition verrouille d’abord la demande encore ouverte. Une seconde approbation renvoie `request_closed`. Le nom n’est inséré que s’il est absent du catalogue (`already_in_catalog` / `name_taken`). L’exercice créé est `verified`, avec `created_by` null. Les noms déjà écrits dans les séances ne sont pas réécrits.

`admin_merge_exercises` appelle `merge_exercises` après confirmation et audit. L’interface choisit lequel conserver.

Rattacher une proposition à un exercice existant pose `matched` et `applied: false` : aucun nouvel exercice n’est créé. La suggestion de nom français n’est qu’un préremplissage. L’opérateur confirme les valeurs envoyées.

## Imports et signalements

`admin_acknowledge_problem_import` n’écrit que l’audit. Le statut et la provenance de `coach_imports` restent. Un import déjà accusé réception disparaît de la file.

`admin_review_marketplace_report` reprend les actions existantes. Suspendre l’annuaire ne termine pas les suivis `coach_client_links`.

## Surface

Route `/admin`, hors onglets mobiles et hors `/moderation`. Le lien profil n’apparaît que si `is_platform_operator()` renvoie vrai. Une erreur de vérification le cache. Un non-opérateur voit un refus et aucune file n’est chargée.
