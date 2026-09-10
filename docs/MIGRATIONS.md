# Historique des migrations

## Règle

Le fichier `supabase/schema_migrations.lock.json` est le miroir de `supabase_migrations.schema_migrations` du projet prod `phyuijjekxtjvipjtdfv`.

- **Ne jamais rejouer** une version déjà présente dans ce lock.
- **Ne jamais** laisser Git porter un horodatage `2026091000000x` : ces 10 fichiers consolidés n’ont **jamais** été enregistrés en production. `apply_migration` (MCP) a tamponné 29 versions entre `20260910044211` et `20260910064501`. Git reprend **exactement** ces 29 versions et le SQL appliqué.
- Une nouvelle migration Git doit utiliser un `version` **strictement supérieur** à la dernière entrée du lock, puis être enregistrée **sous ce même numéro** (pas un tampon MCP différent).

## Repair validé (10 sept. 2026)

1. Dump de `schema_migrations.statements` pour les 29 versions audit.
2. Remplacement des 10 fichiers consolidés par 29 fichiers `{version}_{name}.sql`.
3. Aucun `supabase db push` des 10 consolidés. Aucun `migration repair` nécessaire côté prod : les 29 versions y sont déjà `applied`.
4. Horodatages plus anciens (fichiers Git `20260327…` vs prod `20260824…`) : même histoire logique, horloges différentes. On ne les renomme pas et on ne les rejoue pas en prod. Un `db reset` local / CI applique les fichiers Git (y compris les 29 dumps) pour reconstruire un schéma équivalent.
5. **Replay local (CI `supabase start`)** : fichiers à horloge Git (jamais tamponnés sous ces numéros en prod) :
   - policies / `ALTER` sur des tables absentes (`calorie_adjustment_suggestions`, `profiles`, `coaching_recommendations`) → no-op `to_regclass` ;
   - `ADD CONSTRAINT IF NOT EXISTS` (syntaxe invalide) et trigger `update_updated_at` définis trop tôt → DO + `CREATE FUNCTION`.
   Les 29 dumps prod ne sont pas modifiés et ne sont pas rejoués en prod.

## Nouvelle migration

`20260910153000_audit_blockers.sql` — D01 (création atomique complète), D02 (effets exactement une fois), colonnes d’idempotence. Appliquée en prod **sous cette version** (pas via `apply_migration` MCP, qui retamponnerait un autre horodatage).

Vérif CI : `npm run verify:migrations` (Git vs lock, refuse `2026091000000x`). Job `rls-matrix` = staging-like (`supabase start` PG17) ; org Free = pas de branche preview Supabase.
