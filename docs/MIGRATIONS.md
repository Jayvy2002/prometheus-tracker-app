# Historique des migrations

## Source de vérité

Le dossier `supabase/migrations/` et `supabase/schema_migrations.lock.json` doivent représenter exactement les versions enregistrées dans `supabase_migrations.schema_migrations` du projet de production `phyuijjekxtjvipjtdfv`.

État vérifié le 13 septembre 2026 :

- 99 versions dans Git, le lock et la production ;
- aucune version Git-only ou prod-only ;
- dernière version : `20260911235551_coach_questionnaires.sql` ;
- replay local complet sur PostgreSQL 17 validé par la CI.

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

État vérifié :

- `coach-fleet-round` v32 ;
- `coach-agent` v26 ;
- JWT conforme à `supabase/config.toml` ;
- preflight CORS du copilote vérifié ;
- workflow CLI futur suivi dans la PR #69, encore en draft.
