# Historique des migrations

## Règle

Le fichier `supabase/schema_migrations.lock.json` est le miroir de `supabase_migrations.schema_migrations` du projet prod `phyuijjekxtjvipjtdfv`.

- **Un timestamp Git = une version Production.** `supabase migration list` ne compare que les timestamps : Git suit l’horloge prod (pas l’inverse).
- **Ne jamais rejouer** une version déjà présente dans ce lock.
- **Ne jamais** laisser Git porter un horodatage `2026091000000x` : ces 10 fichiers consolidés n’ont **jamais** été enregistrés en production.
- Une nouvelle migration Git doit utiliser un `version` **strictement supérieur** à la dernière entrée du lock, puis être enregistrée **sous ce même numéro** (pas un tampon MCP différent).
- **Aucun `migration repair` de masse** sur Production. Les fichiers Git sont renommés / dumpés pour coller aux versions déjà `applied`.

## Alignement timestamps (10 sept. 2026)

Les horloges Git historiques (`20260327…`, `2026082500000x`, …) ont été **renommées** vers les timestamps Production (`20260824233456…`). Ordre relatif conservé. Aucune ligne `schema_migrations` prod n’a été retampée.

Versions prod **sans** fichier Git historique — dumps de `schema_migrations.statements` (déjà `applied`, ne pas rejouer) :

| Version | Name |
|---|---|
| `20260825140950` | `notify_onboarding_signed_ping` (2ᵉ tampon du même SQL) |
| `20260829112707` | `coach_fleet_triage_and_marc_seed` |
| `20260829150938` | `fix_triage_client_id_ambiguous` |
| `20260906023536` | `solo_self_coach_upsert` |
| `20260906023554` | `solo_self_coach_notify` |

`20260825140655` + `20260825140950` : deux tampons prod du même nom ; Git porte les deux fichiers.

Vérifs :

- `npm run verify:migrations` — Git versions = lock (98).
- Replay CI : `supabase start` PG17 puis `npm run verify:local-migrations` (98/98).
- Si le secret GitHub `SUPABASE_ACCESS_TOKEN` est posé : étape CI **Prod migration list + db push --dry-run** exécute `scripts/prod-migration-sync.sh` (sortie CLI réelle). Sinon l’étape est **skipped** via `steps.token.outputs.present` (gris) — jamais un `exit 0` déguisé en SUCCESS. Ne pas mettre `secrets.*` dans un `if:` GitHub (ça invalide le workflow).
- Déploiement **effectif** des deux edges d’audit (10 sept. soir) : **Supabase Management API** (connexion authentifiée ChatGPT). Ce n’est **pas** une preuve CLI. Live : `coach-fleet-round` v32 / `coach-agent` v25, SHA = bundles audités.
- Workflow GitHub optionnel pour de **futurs** déploiements CLI : `.github/workflows/deploy-edges.yml` (`workflow_dispatch` seulement, PR #69 **draft**). Dépôt privé GitHub **Free** : pas d’`environment: production` (Environments indisponibles). Secret **repo** `SUPABASE_ACCESS_TOKEN`. Le script `deploy-audit-edges.sh` **échoue** sans token. Pas de déploiement automatique depuis une PR. Ne pas merger #69 tant que le workflow et le secret n’ont pas été validés.

## Repair validé (plage audit)

1. Dump de `schema_migrations.statements` pour les 29 versions audit (`20260910044211`–`20260910064501`).
2. Remplacement des 10 fichiers consolidés par 29 fichiers `{version}_{name}.sql`.
3. Aucun `supabase db push` des 10 consolidés. Aucun `migration repair` côté prod.

Replay local : policies / `ALTER` sur des tables absentes → no-op `to_regclass` ; `ADD CONSTRAINT IF NOT EXISTS` (syntaxe invalide) et trigger `update_updated_at` trop tôt → DO + `CREATE FUNCTION`. Les 29 dumps prod ne sont pas rejoués en prod.

## Migrations post-audit

- `20260910153000_audit_blockers.sql` — D01 / D02 / idempotence. Appliquée sous ce numéro.
- `20260910160000_apply_intervention_client_target.sql` — `assert_client_target` : cible = `auth.uid()` OU `is_coach_of(cible)` avant tout effet (chemin `p_id` NULL inclus). Appliquée **sous cette version** (pas via `apply_migration` MCP).

Vérif CI : `npm run verify:migrations`. Job `rls-matrix` = staging-like (`supabase start` PG17) ; org Free = pas de branche preview Supabase.
