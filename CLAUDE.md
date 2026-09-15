# CLAUDE.md — Prometheus

> **RÔLE DE CE DOCUMENT — RÈGLES OBLIGATOIRES POUR LES AGENTS ET DÉVELOPPEURS**
>
> À lire au début de chaque tâche. Ce fichier définit les sources de vérité, invariants, règles de sécurité et conventions de travail.
>
> **Instruction pour les agents :** ne pas y recopier le backlog, un état live daté ou un journal de PR. Lire `README.md` pour comprendre le projet actuel, `docs/VISION.md` pour la destination produit, `docs/CARTE_PRODUIT.md` pour les parcours cibles et `docs/CHANTIER.md` pour l’ordre complet des travaux. Ne pas modifier le rôle de ces documents.

## Produit

Prometheus est une plateforme de coaching pour la musculation, le bodybuilding et le powerlifting, disponible en français et en anglais.

Trois rôles sont officiels :

- **Coach** : gère ses clients, leurs programmes, leur suivi et les propositions préparées par Prometheus.
- **Client coaché** : suit le programme et les modules autorisés par son coach.
- **Solo** : utilise le tracker complet et valide lui-même les propositions du copilote.

Principe d’autorité : **l’IA prépare, un humain décide**. Une proposition n’est jamais appliquée automatiquement. En solo, l’athlète valide pour lui-même ; en coaching, le coach valide pour son client.

## Sources de vérité

| Sujet | Source |
|---|---|
| Présentation et utilisation du projet actuel | `README.md` |
| Destination, rôles et principes produit | `docs/VISION.md` |
| Parcours et contrats d’architecture cible | `docs/CARTE_PRODUIT.md` |
| Priorités et totalité du travail restant | `docs/CHANTIER.md` |
| Schéma et ordre des migrations | `supabase/migrations/` + `supabase/schema_migrations.lock.json` |
| État des Edge Functions | `supabase/functions.deployed.lock.json` |
| Télémétrie autorisée | `docs/TELEMETRY.md` |
| Types applicatifs | `src/lib/types.ts` |
| Où va un fichier (actuel vs cible) | `docs/ARCHITECTURE.md` |
| Tokens et primitives UI | `docs/DESIGN_SYSTEM.md` |
| Configuration JWT des fonctions | `supabase/config.toml` |

En cas de contradiction, déterminer quelle source porte le sujet puis corriger le document périmé dans le même changement.

### Hygiène documentaire

- Ne pas supprimer un chantier non terminé parce qu’il est ancien, partiellement présent ou supposé dans une réflexion.
- Retirer un élément de `docs/CHANTIER.md` seulement avec une preuve d’implémentation et de validation, ou une décision produit explicite.
- Une capacité utilisateur livrée peut être ajoutée au README ; ses détails d’implémentation restent dans le code et les documents spécialisés.
- Une décision durable modifie la Vision. Une tâche, un nom de table proposé ou un ordre d’exécution modifie le Chantier.
- Les numéros de versions live appartiennent aux fichiers lock. Les migrations appliquées appartiennent au lock et à `docs/MIGRATIONS.md`.
- Git et les pull requests conservent l’historique : ne pas accumuler un journal des anciens agents dans les documents actifs.

## Commandes de vérification

```bash
npm test
npm run typecheck
npm run lint
npm run build
npm run verify:edges
npm run verify:migrations
```

Pour un changement RLS ou RPC sensible, exécuter aussi :

```bash
npm run test:rls
```

Les tests peuvent verrouiller la source de composants et les contrats produit. Si un comportement change volontairement, mettre à jour son test dans le même commit ; ne pas contourner le verrou.

## Architecture utile

Ceci est l’**arbre actuel** (lot 18 livré). La matrice et la suite (19–23) sont dans `docs/ARCHITECTURE.md`. **Ne pas déplacer** `coach*.ts`, `App.tsx`, `stores/`, `types.ts` ni i18n avant le lot qui le dit. `coachingStore` reste un seul fichier jusqu’au lot **21c** (façade obligatoire).

```text
src/
├── App.tsx                         Routes, gardes, bootstrap (lot 21a pour découper)
├── app/layout/                     Chrome ; app/navigation/ = navConfig
├── features/                       account / coaching (hooks + domain) / marketplace / nutrition
├── shared/                         api/supabase, hooks, ui (tokens lot 19)
├── components/                     Écrans métier ; ui/ et layout/ = réexports
├── stores/                         Zustand par domaine — coachingStore intact jusqu’au 21c
├── lib/                            Métier + réexports ; tests `*.test.ts`
└── i18n/locales/{fr,en}.ts         Textes visibles (lot 22b pour découper)

supabase/
├── migrations/                     Historique DB immuable
├── cron/                           Planification des tâches
└── functions/
    ├── coach-agent/                Copilote IA synchrone
    ├── coach-fleet-round/          Analyse déterministe du roster
    ├── notify-onboarding-complete/ Déclencheur de proposition initiale
    ├── send-daily-reminders/       Notifications Web Push
    └── autres fonctions métier
```

## Invariants produit

- **Propositions uniquement.** `coach-agent` et `coach-fleet-round` préparent des brouillons. L’application explicite du coach ou du solo est obligatoire.
- **Isolation coach-client.** Un coach ne voit et ne modifie que ses clients actifs. Toute écriture privilégiée vérifie la cible avant les effets.
- **Un client, un coach actif maximum.**
- **Fin de coaching = retour solo.** Historique et cibles conservés, programme mis en pause, tracking coach retiré.
- **Programmes atomiques et versionnés.** Utiliser les RPC de sauvegarde/création/fork/adoption. Un échec ne laisse pas de programme partiel.
- **Interventions idempotentes.** Claim → effets → finalize ; un rejeu ne duplique ni message ni note.
- **Données honnêtes.** Une réussite affichée correspond à une écriture persistée. Les erreurs et les actions à réessayer restent visibles.
- **Hors ligne.** La file de séances survit au changement de compte et rejoue sans doublon ; les éléments en échec durable vont en dead-letter.
- **Tracking coaché.** `client_tracking_config` décide quels modules sont actifs. Un module désactivé ne génère ni rappel ni jugement.
- **Nutrition.** Les cibles d’un coaché sont coach-only ; l’historique est daté. Les portions passent par le contrat `productLogDraft`.
- **Analyse hebdomadaire.** Fenêtre cohérente de 14 jours, cibles effectives datées, signaux déclarés et profils protégés.
- **Questionnaire.** `STANDARD_INTAKE_IDS`, `INTAKE_SEMANTIC_MAP` et `INTAKE_VERSION` forment le contrat stable. Les champs inconnus vont dans `custom`.
- **Bilingue.** Tout texte visible passe par l’i18n, avec parité FR/EN.
- **Télémétrie minimale.** Aucun nom, e-mail, texte libre, réponse d’intake, note, message ou signal médical dans `product_events`.

## Verrous techniques anti-régression

Ces règles décrivent le comportement actuel. Les modifier exige une décision produit explicite, les tests concernés et, lorsque nécessaire, la matrice RLS.

- **Tournée hebdomadaire.** `src/features/coaching/domain/coachFleet.ts` (réexport `src/lib/coachFleet.ts`) et `supabase/functions/coach-fleet-round/index.ts` portent la même logique ; `fleetCopy.ts` porte les textes. Une règle modifiée doit être répercutée dans les deux implémentations et leurs tests. La fenêtre est de 14 jours. L’assiduité et la qualité des données sont vérifiées avant toute proposition chiffrée ; sinon l’action attendue est une relance, pas une modification arbitraire des cibles.
- **Recherche d’aliments.** La recherche locale répond pendant la frappe. Open Food Facts est déclenché explicitement par l’utilisateur, avec budget, annulation et délai maximal ; ne pas transformer la recherche distante en requête à chaque caractère. `pickerSearch.ts` centralise le classement partagé.
- **Exercices.** Les alias FR/EN servent la recherche ; le nom canonique en base reste stable et l’affichage est localisé.
- **Portions.** `productLogDraft` est le contrat commun pour recherche, récents, favoris, recettes et préremplissage. Ne pas réintroduire de conversion implicite ×100 entre valeur par portion et valeur par masse.
- **Programmes.** Utiliser les RPC atomiques de sauvegarde, synchronisation, création, fork et adoption. Les patchs ciblent les identifiants via `resolvePatchTargets` ; l’aperçu et l’application doivent résoudre la même cible. Respecter le contrôle de version `expectedUpdatedAt` et les révisions immuables.
- **Caches par compte.** Les données locales sont namespacées par `sessionScope.ts`. Le logout purge les caches du compte, sauf la file hors ligne qui doit pouvoir reprendre pour le même utilisateur. Toute lecture de séance valide l’identité avant d’afficher un cache.
- **Transitions de rôle.** Un client coaché entre par une invitation ou, lorsque le chantier correspondant sera livré, par une demande explicitement acceptée. La fin du lien réutilise la transition commune vers le solo ; ne pas créer une voie parallèle incomplète.
- **Télémétrie.** Tout nouvel événement exige la mise à jour simultanée de `ProductEventName`, de l’appel `track()` et de `docs/TELEMETRY.md`.

Les noms de tables, RPC et routes proposés dans `docs/CHANTIER.md` sont un point de départ, pas la preuve qu’ils existent déjà. Avant d’implémenter, inspecter le schéma et le code actuels, puis créer une nouvelle migration sans modifier les migrations appliquées.

## Sécurité et base de données

- RLS activé sur toutes les tables exposées.
- Une policy UPDATE doit contrôler à la fois l’accès à la ligne et les nouvelles valeurs.
- Les RPC `SECURITY DEFINER` restent étroites, vérifient `auth.uid()` et ont des droits `EXECUTE` explicites.
- La clé `service_role` et les secrets serveur ne vont jamais dans le client ni dans Git.
- Les migrations déjà appliquées sont immuables. Ajouter une nouvelle migration, ne jamais réécrire l’historique.
- Avant toute action destructive sur la production : identifier précisément la cible et demander confirmation.
- Aucun test destructif sur la base de production.

## Conventions

- TypeScript strict ; types partagés dans `src/lib/types.ts`.
- Composants fonctionnels, logique testable dans `src/lib/`.
- Zustand pour l’état partagé.
- Tailwind pour le style ; tokens et primitives : `docs/DESIGN_SYSTEM.md`. Pas de nouvelle bibliothèque UI sans besoin démontré.
- PascalCase pour les composants, camelCase pour les fonctions, snake_case pour PostgreSQL.
- Ne pas découper `coachingStore` avant le lot **21c** (modules + façade du même nom). Pas un « nettoyage ».
- `npm test` découvre `src/**/*.test.ts` (`scripts/run-unit-tests.mjs`). Ne plus ajouter chaque fichier à `package.json`.
- **Env (une convention).** `.env` = local, gitignoré. `.env.example` = placeholders. `.env.production` = **uniquement** clés publiques frontend déjà dans le bundle (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_VAPID_PUBLIC_KEY`). Agents cloud : `cp .env.production .env` s’il manque. Jamais `service_role`, token serveur, ni secret VAPID privé dans Git. Netlify : les mêmes variables publiques, pas de clé serveur.

## Priorité actuelle

Lire `docs/CHANTIER.md`, qui est l’unique source de l’ordre complet et du travail restant. Ne pas lancer un chantier transversal sans instruction ou sans démontrer qu’il soutient cet ordre ou corrige un problème bloquant.
