# Historique des migrations

> **RÔLE — CONTRAT DE MIGRATION ET DE DÉPLOIEMENT.** Décrire les sources de vérité, la procédure et les preuves. Les tâches inachevées restent dans `CHANTIER.md` ; les versions appliquées restent dans les locks. Ne pas présenter un SQL candidat comme une migration en production.

## Source de vérité

Le dossier `supabase/migrations/` et `supabase/schema_migrations.lock.json` doivent représenter exactement les versions enregistrées dans `supabase_migrations.schema_migrations` du projet de production `phyuijjekxtjvipjtdfv`.

Le lock courant contient 99 versions, jusqu’à `20260911235551_coach_questionnaires.sql`. Les vérifications distantes doivent préciser leur date et leur canal ; le replay CI seul ne prouve pas un déploiement.

Les candidats de la PR #75 restent dans `supabase/changes/` et sont appliqués uniquement à la base temporaire de CI, après le replay des migrations :

1. `account_capabilities.sql` — reprise compatible des capacités et contexte de compte ;
2. `client_end_coach_link.sql` — transition commune et notification privée ;
3. `coaching_relationship_consistency.sql` — auteur/date de fin et sérialisation des adaptations/attributions ;
4. `coach_marketplace.sql` — profils opt-in et demandes privées ; aucune activation de coaching ou facturation.

L’ordre est vérifié avec les tests SQL et les parcours navigateur. Ces fichiers ne doivent pas être ajoutés au lock comme s’ils étaient appliqués. Après validation, leur promotion suit la procédure ci-dessous, avec une vérification distante explicite avant le merge.

## Règles

- Un timestamp Git correspond à une version de production.
- Ne jamais renommer ou rejouer une migration déjà enregistrée.
- Ne jamais modifier le contenu d’une migration appliquée ; créer une migration suivante.
- Ne jamais utiliser un `migration repair` massif pour faire correspondre artificiellement l’historique.
- Une nouvelle version doit être strictement supérieure à la dernière version du lock.
- Git suit l’horloge de production lorsqu’une ancienne divergence historique doit être documentée ; la production n’est pas retamponnée.
- Les fichiers de dump représentant des versions déjà appliquées servent au replay local et ne doivent pas être repoussés en production.

Les anciennes différences de timestamps ont été consolidées. Leur détail n’est plus une action à effectuer ; le lock actuel fait foi.

## Vérifications

```bash
npm run verify:migrations
npm run verify:local-migrations
```

Pour les changements de policies ou de RPC :

```bash
npm run test:rls
```

Avec un `SUPABASE_ACCESS_TOKEN` disponible, `npm run verify:prod-history` compare la CLI à la production et exécute un `db push --dry-run`. Sans token, cette preuve distante doit apparaître comme ignorée, jamais comme un faux succès.

## Procédure pour une nouvelle migration

1. Créer la migration avec la CLI Supabase afin d’obtenir son nom.
2. Écrire un SQL idempotent lorsque cela est pertinent.
3. Tester sur une base locale reconstruite.
4. Exécuter les tests RLS si les permissions, vues, fonctions ou triggers changent.
5. Vérifier les advisors sécurité et performance.
6. Appliquer la migration en production sous exactement la même version.
7. Mettre à jour `supabase/schema_migrations.lock.json`.
8. Vérifier que Git, le lock et la production sont alignés avant le merge.

## Edge Functions

Le déploiement des Edge Functions est distinct de l’historique SQL. Leur inventaire live est conservé dans `supabase/functions.deployed.lock.json`.

Les versions et paramètres JWT sont décrits dans `supabase/functions.deployed.lock.json` et `supabase/config.toml`. Le canal de déploiement et les smokes doivent être prouvés pour le bundle concerné. Une étape CLI ignorée ne constitue pas un déploiement réussi.
