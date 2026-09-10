# Prometheus

Plateforme de coaching pour la musculation, le bodybuilding et le powerlifting, en français et en anglais.

Prometheus sert trois profils :

- **Coach** : suit ses clients et valide les propositions préparées par l’application.
- **Client coaché** : exécute son programme et utilise les modules activés par son coach.
- **Solo** : utilise le tracker complet et valide lui-même les propositions du copilote.

L’IA prépare ; l’humain décide. Aucune adaptation de programme ou de nutrition ne s’applique silencieusement.

## Documentation

- Règles de travail pour les agents et développeurs : [`CLAUDE.md`](CLAUDE.md)
- Vision et rôles : [`docs/VISION.md`](docs/VISION.md)
- Priorités : [`docs/CHANTIER.md`](docs/CHANTIER.md)
- Migrations : [`docs/MIGRATIONS.md`](docs/MIGRATIONS.md)
- Télémétrie : [`docs/TELEMETRY.md`](docs/TELEMETRY.md)

`new-JV` est la branche de production. Un merge sur cette branche déclenche le déploiement Netlify de [tracker.prometheus-fit.com](https://tracker.prometheus-fit.com). `main` correspond à l’ancienne application et ne doit pas recevoir les développements actuels.

## Fonctionnalités principales

### Coach

- Command Center et file des clients à traiter.
- Invitations et fiche client 360.
- Configuration du suivi et des cibles.
- Création, copie, versionnage et assignation des programmes.
- Messages et propositions d’intervention.
- Copilote `coach-agent` et analyse déterministe `coach-fleet-round`.

### Client coaché

- Séance du jour et programme assigné.
- Check-ins, messages et photos.
- Modules de suivi sélectionnés par le coach.
- Cibles nutritionnelles en lecture seule.
- Retour automatique au mode solo lorsque le coaching prend fin.

### Solo

- Séances, routines, nutrition, scanner, recettes, poids, statistiques et calendrier.
- File hors ligne durable pour les séances.
- Questionnaire initial, cibles et proposition de programme.
- Revue hebdomadaire et modifications de programme proposées par le copilote.

## Stack

- React 18, TypeScript 5.5, Vite 5.
- React Router, Zustand, Tailwind CSS.
- Supabase : PostgreSQL, Auth, Storage, Realtime et Edge Functions.
- i18next pour le français et l’anglais.
- PWA avec Service Worker.

Les versions exactes des dépendances sont dans `package.json` et `package-lock.json`.

## Démarrage local

Prérequis : Node.js 20+ et une configuration Supabase de développement.

```bash
git clone https://github.com/Jayvy2002/prometheus-tracker-app.git
cd prometheus-tracker-app
git switch new-JV
npm install
```

Créer un fichier `.env` local non commité :

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-publishable-or-anon-key
VITE_VAPID_PUBLIC_KEY=your-vapid-public-key
```

Puis :

```bash
npm run dev
```

## Vérifications

```bash
npm test
npm run typecheck
npm run lint
npm run build
npm run verify:edges
npm run verify:migrations
```

Les changements de policies RLS ou de RPC sensibles doivent aussi passer la matrice :

```bash
npm run test:rls
```

## Déploiement

### Frontend

Netlify construit automatiquement `new-JV`. Les pull requests reçoivent une preview.

### Base de données

Les migrations sont dans `supabase/migrations/`. Lire `docs/MIGRATIONS.md` avant toute modification. Une migration appliquée ne doit jamais être réécrite ou rejouée.

### Edge Functions

La configuration JWT de chaque fonction est dans `supabase/config.toml`. L’état live connu est enregistré dans `supabase/functions.deployed.lock.json`.

Le canal normal de déploiement depuis Git est la CLI Supabase, à partir de la racine du dépôt, afin de résoudre correctement les dépendances partagées :

```bash
supabase functions deploy coach-fleet-round --project-ref phyuijjekxtjvipjtdfv --no-verify-jwt
supabase functions deploy coach-agent --project-ref phyuijjekxtjvipjtdfv
```

Les secrets serveur sont configurés dans Supabase Edge Function Secrets et ne doivent jamais être ajoutés au dépôt.

### État live vérifié le 10 septembre 2026

- `coach-fleet-round` v32 : `ACTIVE`.
- `coach-agent` v26 : `ACTIVE`, JWT activé, CORS opérationnel.
- Rappels quotidiens : cron actif et exécutions réussies.
- Base : 98 migrations alignées, dernière `20260910160000`.

## Sécurité

- RLS sur les tables exposées.
- RPC privilégiées limitées et testées.
- Clés serveur uniquement dans les Edge Functions.
- Sauvegardes critiques atomiques et opérations idempotentes.
- Fichiers utilisateurs validés.
- Aucune donnée sensible dans la télémétrie produit.

## Statut commercial

Le produit est actuellement gratuit pendant sa construction. Le billing n’est pas actif ; les décisions de prix et d’essai précéderont son implémentation.

## Licence

Private — all rights reserved.
