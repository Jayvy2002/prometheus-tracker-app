# Prometheus

> **RÔLE DE CE DOCUMENT — PORTE D’ENTRÉE DU DÉPÔT**
>
> Ce README explique ce qu’est Prometheus aujourd’hui, comment le projet est organisé et comment le lancer, le vérifier et le déployer.
>
> **Instruction pour les agents :** conserver ce document court, factuel et à jour. Ne pas y placer la feuille de route, des idées futures, un journal de chantier, des numéros de PR ou des versions live recopiées. La direction produit appartient à `docs/VISION.md`, tout ce qui reste à faire à `docs/CHANTIER.md`, et les états techniques détaillés à leurs fichiers de référence.

Prometheus est une plateforme de coaching pour la musculation, le bodybuilding et le powerlifting, en français et en anglais. La destination (marketplace de coaching avec continuité solo) est dans `docs/VISION.md` ; elle n’est pas encore livrée.

Prometheus sert trois profils :

- **Coach** : suit ses clients et valide les propositions préparées par l’application.
- **Client coaché** : exécute son programme et utilise les modules activés par son coach.
- **Solo** : utilise le tracker complet et valide lui-même les propositions du copilote.

Principe central : **L’IA prépare ; l’humain décide**. Une adaptation n’est jamais appliquée silencieusement. En solo, l’athlète valide pour lui-même ; en coaching, le coach valide pour son client.

## Fonctionnalités principales

### Coach

- Command Center et file des clients à traiter.
- Invitations et fiche client 360.
- Builder de questionnaires FR/EN, versions publiées et questionnaire par défaut des invitations.
- Configuration du suivi et des cibles.
- Création, copie, versionnage et assignation des programmes.
- Messages, notes et propositions d’intervention.
- Copilote `coach-agent` et analyse déterministe `coach-fleet-round`.

### Client coaché

- Dashboard : priorité du jour et vue d’ensemble (séance, rings nutrition, poids, check-in, messages).
- Séance du jour et programme assigné.
- Check-ins, messages et photos.
- Questionnaire choisi par le coach, brouillon reprenable et réponses rattachées à la version remplie.
- Modules de suivi sélectionnés par le coach.
- Cibles gérées dans le cadre de la relation de coaching.
- Continuité des données lors du retour au mode solo.

### Solo

- Dashboard : priorité du jour et vue d’ensemble (séance, rings nutrition, poids, progression).
- Séances, routines, progression, statistiques et calendrier.
- Nutrition, recherche d’aliments, scanner et recettes.
- Questionnaire initial, cibles et proposition de programme.
- Revue et modifications proposées par le copilote.
- Reprise hors ligne des séances.

## Architecture fonctionnelle

Le frontend React affiche les parcours des trois rôles. Supabase fournit l’authentification, PostgreSQL, les règles d’accès, le stockage, le temps réel et les Edge Functions. Les fonctions intelligentes préparent des propositions ; leur validation et leurs effets restent explicites dans l’interface.

```text
Utilisateur
   ↓
Application React / PWA
   ↓
Supabase Auth + PostgreSQL + Storage + Realtime
   ↓
Edge Functions et copilote
   ↓
Proposition visible → validation humaine → écriture persistée
```

## Organisation du dépôt

```text
src/
├── App.tsx                         Assembleur (router + session)
├── app/                            Routes, gardes, chrome, navConfig
├── features/                       Domaines (coaching, workout, nutrition, …)
├── shared/                         UI, types transversaux, client Supabase
├── components/                     Écrans métier (dashboard, séance, nutrition, …)
├── stores/                         État Zustand par domaine
├── lib/                            Contrats + réexports
└── i18n/locales/{fr,en}/           Textes par domaine

supabase/
├── migrations/                     Historique de base immuable
├── cron/                           Tâches planifiées
└── functions/                      Edge Functions métier et IA
```

## Documentation

| Besoin | Source |
|---|---|
| Règles obligatoires pour les agents et développeurs | [`CLAUDE.md`](CLAUDE.md) |
| Destination, rôles et principes produit | [`docs/VISION.md`](docs/VISION.md) |
| Parcours et contrats cibles | [`docs/CARTE_PRODUIT.md`](docs/CARTE_PRODUIT.md) |
| Ordre des travaux et tout ce qui reste à faire | [`docs/CHANTIER.md`](docs/CHANTIER.md) |
| Arbre frontend actuel vs cible | [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) |
| Tokens et primitives UI | [`docs/DESIGN_SYSTEM.md`](docs/DESIGN_SYSTEM.md) |
| Diagnostic navigation (peut être daté) | [`docs/AUDIT_NAVIGATION_UX.md`](docs/AUDIT_NAVIGATION_UX.md) |
| Procédure et historique des migrations | [`docs/MIGRATIONS.md`](docs/MIGRATIONS.md) |
| Télémétrie autorisée | [`docs/TELEMETRY.md`](docs/TELEMETRY.md) |
| État déployé des Edge Functions | [`supabase/functions.deployed.lock.json`](supabase/functions.deployed.lock.json) |

En cas de contradiction, `CLAUDE.md` définit les règles de travail, `docs/VISION.md` définit la décision produit et `docs/CHANTIER.md` définit ce qui reste à faire.

## Stack

- React 18, TypeScript 5.5 et Vite 5.
- React Router, Zustand et Tailwind CSS.
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

Le fichier `.env` local n’est jamais commité. Pour ce dépôt :

```bash
cp .env.production .env
```

`.env.production` ne contient que des clés **publiques** frontend (URL Supabase, anon, VAPID public). Pour un autre projet, copier `.env.example` et remplir les placeholders. Jamais de `service_role` dans Git.

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

Les changements de policies RLS ou de RPC sensibles doivent aussi passer :

```bash
npm run test:rls
```

## Déploiement

`new-JV` est la branche de production du frontend. Un merge sur cette branche déclenche le déploiement Netlify de [tracker.prometheus-fit.com](https://tracker.prometheus-fit.com). `main` correspond à l’ancienne application et ne reçoit pas les développements actuels.

### Base de données

Les migrations sont dans `supabase/migrations/`. Lire `docs/MIGRATIONS.md` avant toute modification. Une migration appliquée ne doit jamais être réécrite.

### Edge Functions

La configuration JWT est dans `supabase/config.toml`. L’état live connu est enregistré dans `supabase/functions.deployed.lock.json`.

Le canal normal de déploiement depuis Git est la CLI Supabase depuis la racine du dépôt afin de résoudre les dépendances partagées :

```bash
supabase functions deploy coach-fleet-round --project-ref phyuijjekxtjvipjtdfv --no-verify-jwt
supabase functions deploy coach-agent --project-ref phyuijjekxtjvipjtdfv
```

Les secrets serveur restent dans Supabase Edge Function Secrets et ne sont jamais ajoutés au dépôt.

## Sécurité

- RLS sur les tables exposées.
- RPC privilégiées limitées et testées.
- Clés serveur uniquement côté serveur.
- Sauvegardes critiques atomiques et opérations idempotentes.
- Fichiers utilisateurs validés.
- Aucune donnée sensible dans la télémétrie produit.

## Licence

Private — all rights reserved.
