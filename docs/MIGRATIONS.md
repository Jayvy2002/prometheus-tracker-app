# Historique des migrations et Edge Functions

> **SOURCE DE VÉRITÉ OPÉRATIONNELLE SUPABASE**
>
> Les migrations SQL sont append-only. Les inventaires dans Git doivent rester cohérents avec Supabase production. Ce document décrit le contrat et l’état vérifié ; les fichiers lock contiennent le détail machine-readable.

## État vérifié — 23 septembre 2026

Vérification directe contre le projet Supabase `phyuijjekxtjvipjtdfv` :

- projet `ACTIVE_HEALTHY`, PostgreSQL 17.6 ;
- **138 migrations** dans le lock production `supabase/schema_migrations.lock.json` ;
- **138 migrations** observées en production, dans le même ordre ;
- dernière version appliquée : `20260923021000_p5_minimal_admin` ;
- `migrations.pending.json` est vide ;
- P5.4 a été observé avec le **même timestamp Git** `20260923021000` (aucun restamp, 79 statements, `created_by` null) ; `grant_platform_operator` et `admin_revoke_platform_operator` revalident `is_platform_operator()` après `lock_platform_operators()` ;
- P5.3 a été appliqué avec le **même timestamp Git** `20260923014500` (aucun restamp, 74 statements, `created_by` null, empreinte `d0c9455e78a9b5090d76cf6ee5764a52`) ;
- P5.2 a été appliqué avec le **même timestamp Git** `20260922223000` (aucun restamp, 129 statements, `created_by` null) ;
- P5.1 a été appliqué avec le **même timestamp Git** `20260922014500` (aucun restamp, 97 statements, `created_by` null) ; le job `coach-import-preview-purge` est actif (`15 * * * *`, `SELECT public.coach_import_purge_stale_previews()`) ;
- P4.1 a été appliqué avec le **même timestamp Git** `20260921021231` (aucun restamp, 62 statements, `created_by` null) ;
- P4.2 a été appliqué avec le **même timestamp Git** `20260921021923` (aucun restamp, 52 statements, `created_by` null) ;
- P4.3 a été appliqué avec le **même timestamp Git** `20260921023720` (aucun restamp, 42 statements, `created_by` null) ;
- P4.4 a été appliqué avec le **même timestamp Git** `20260921024426` (aucun restamp, 79 statements, `created_by` null) ;
- P3 hardening a été appliqué avec le **même timestamp Git** `20260920014500` (aucun restamp, 241 statements, `created_by` null) ;
- P3.3 a été appliqué avec le **même timestamp Git** `20260919233853` (aucun restamp, 45 statements) ;
- P3.2 a été appliqué avec le **même timestamp Git** `20260919225507` (aucun restamp) ;
- Hotfix B a été appliqué avec le **même timestamp Git** `20260919214423` (aucun restamp) ;
- Hotfix A a été appliqué avec le **même timestamp Git** `20260919202538` (aucun restamp) ;
- P3.1 a été appliqué avec le **même timestamp Git** `20260919194159` (aucun restamp) ;
- les deux versions Git de P2.4/P2.5 restent présentes telles quelles :
  `20260919134856`, `20260919141146` ;
- ne jamais appliquer `20260919181919`.

Le lock a été rafraîchi après cette vérification live. Une future différence
Git/lock/production doit être traitée comme un blocage de migration, pas
réparée artificiellement.

Les lignes production `accepted` restent `accepted` (état historique terminal) ;
elles n’ont pas été réécrites en `athlete_confirmed`.

Le premier slice P2.4 (explicabilité lecture) n’ajoute **aucune** migration.
P2.4 correction et P2.5 sont **actifs en production**.

## Règles migrations

- Un timestamp Git correspond à une version de production.
- Ne jamais renommer, retamponner ou modifier une migration déjà appliquée.
- Toute évolution de schéma se fait dans une **nouvelle migration**.
- Créer la migration avec la CLI Supabase ; ne pas inventer manuellement un nom de timestamp.
- Ne jamais utiliser un `migration repair` massif pour masquer une divergence.
- Tester localement le replay complet.
- Si RLS, RPC, vues, triggers ou permissions changent : tests SQL/RLS obligatoires.
- Les writes sensibles doivent rester atomiques et les RPC `SECURITY DEFINER` doivent vérifier explicitement identité/autorisation.

## Vérifications

```bash
npm run verify:migrations
npm run verify:local-migrations
```

Pour RLS/RPC :

```bash
npm run test:rls
```

La preuve distante CI est **fail-closed** : elle exige les secrets dépôt `SUPABASE_ACCESS_TOKEN` et `SUPABASE_DB_PASSWORD`, lie explicitement la CLI au projet production `phyuijjekxtjvipjtdfv`, vérifie ce lien, exécute `supabase migration list` puis `supabase db push --dry-run`. Si un secret manque, si le projet lié n’est pas celui attendu, ou si l’une de ces commandes échoue, le job CI échoue. Une CI verte ne doit donc plus masquer une preuve production absente. Les secrets sont injectés uniquement dans les étapes qui en ont besoin.

## Migrations candidates en PR

Une migration non déployée est déclarée dans `supabase/migrations.pending.json`, séparément
du lock des migrations réellement appliquées. Les vérifications exigent toutes les versions
historiques et n'acceptent que ces candidats explicites, uniques et postérieurs au baseline.
Le replay local applique historique + candidats. Après déploiement autorisé et vérification,
transférer les versions réellement observées dans le lock et vider les candidats correspondants.
Voir [P1.1](P1_1_COACH_CAPABILITY.md). Une PR verte ne constitue pas un déploiement production.

## Procédure pour une nouvelle migration

1. Lire `docs/VISION.md`, `docs/CARTE_PRODUIT.md` et la section du chantier concerné.
2. Inspecter le schéma/RPC existants avant de créer une nouvelle primitive.
3. Créer la migration via la CLI Supabase.
4. Écrire une évolution append-only, idempotente lorsque pertinent.
5. Rejouer la base locale et lancer les tests du domaine.
6. Exécuter les advisors Supabase lorsque la sécurité/performance est concernée.
7. Vérifier les permissions Data API + RLS/RPC.
8. Appliquer via `workflow_dispatch` du workflow CI, input `confirm_apply=APPLY_PENDING`. Le job `apply pending migrations` relance la preuve dry-run, puis `supabase db push --linked --yes --skip-vault`. Le timestamp du fichier Git est conservé. Ne pas passer par le MCP `apply_migration` : il réécrit la version.
9. Vérifier production.
10. Rafraîchir `supabase/schema_migrations.lock.json` uniquement avec l’état réellement observé.

## Edge Functions

L’inventaire machine-readable est `supabase/functions.deployed.lock.json`.

État live vérifié directement le 22 septembre 2026 après le merge `#213` : **13 fonctions ACTIVE**. `delete-account` est en **v17**, `verify_jwt=false`, cleanup Storage fail-closed. Exemples importants au moment du contrôle :

- `delete-account` : v17, `verify_jwt=false` ;
- `coach-agent` : v156, `verify_jwt=true` ;
- `coach-fleet-round` : v163, `verify_jwt=false` ;
- `notify-onboarding-complete` : v152, `verify_jwt=false`.

Les numéros de version Supabase sont volatils et augmentent lors des redéploiements. Après toute modification d’Edge Function :

1. `npm run verify:edges` avant merge ;
2. déployer par l’intégration Supabase ou le mécanisme explicitement choisi ;
3. vérifier l’inventaire live ;
4. rafraîchir `supabase/functions.deployed.lock.json` avec ce qui est réellement déployé ;
5. ne jamais considérer un job `skipped` comme une preuve de déploiement.

Le vieux job CI conditionné à une branche d’audit spécifique a été retiré : le workflow CI vérifie le code ; le déploiement Edge reste une opération explicite et vérifiée.
