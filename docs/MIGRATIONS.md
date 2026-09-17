# Historique des migrations et Edge Functions

> **SOURCE DE VÉRITÉ OPÉRATIONNELLE SUPABASE**
>
> Les migrations SQL sont append-only. Les inventaires dans Git doivent rester cohérents avec Supabase production. Ce document décrit le contrat et l’état vérifié ; les fichiers lock contiennent le détail machine-readable.

## État vérifié — 17 septembre 2026

Vérification directe contre le projet Supabase `phyuijjekxtjvipjtdfv` :

- **112 migrations** dans Git / `supabase/schema_migrations.lock.json` ;
- **112 migrations** observées en production, dans le même ordre ;
- dernière version : `20260915234946_ux27_message_bilan` ;
- replay local PostgreSQL 17 validé par la CI ;
- matrice RLS/staging-like verte sur le baseline de départ agent.

Le lock a été rafraîchi après cette vérification. Une future différence Git/lock/production doit être traitée comme un blocage de migration, pas réparée artificiellement.

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

Lorsque `SUPABASE_ACCESS_TOKEN` est disponible, la preuve distante compare également production et exécute le dry-run prévu par le dépôt. Une étape distante ignorée faute de token n’est jamais considérée comme une preuve de synchronisation ; la vérification directe via le connecteur Supabase peut être utilisée à la place.

## Procédure pour une nouvelle migration

1. Lire `docs/VISION.md`, `docs/CARTE_PRODUIT.md` et la section du chantier concernée.
2. Inspecter le schéma/RPC existants avant de créer une nouvelle primitive.
3. Créer la migration via la CLI Supabase.
4. Écrire une évolution append-only, idempotente lorsque pertinent.
5. Rejouer la base locale et lancer les tests du domaine.
6. Exécuter les advisors Supabase lorsque la sécurité/performance est concernée.
7. Vérifier les permissions Data API + RLS/RPC.
8. Appliquer via le mécanisme de déploiement du projet.
9. Vérifier production.
10. Rafraîchir `supabase/schema_migrations.lock.json` uniquement avec l’état réellement observé.

## Edge Functions

L’inventaire machine-readable est `supabase/functions.deployed.lock.json`.

État live vérifié directement le 17 septembre 2026 : **13 fonctions ACTIVE**. Exemples importants :

- `coach-agent` : v129, `verify_jwt=true` ;
- `coach-fleet-round` : v136, `verify_jwt=false` ;
- `notify-onboarding-complete` : v125, `verify_jwt=false`.

Les numéros de version Supabase sont volatils et augmentent lors des redéploiements. Après toute modification d’Edge Function :

1. `npm run verify:edges` avant merge ;
2. déployer par l’intégration Supabase ou le mécanisme explicitement choisi ;
3. vérifier l’inventaire live ;
4. rafraîchir `supabase/functions.deployed.lock.json` avec ce qui est réellement déployé ;
5. ne jamais considérer un job `skipped` comme une preuve de déploiement.

Le vieux job CI conditionné à une branche d’audit spécifique a été retiré : le workflow CI vérifie le code ; le déploiement Edge reste une opération explicite et vérifiée.
