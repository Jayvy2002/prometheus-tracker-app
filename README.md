# Prometheus

> **PORTE D’ENTRÉE DU DÉPÔT**
>
> Ce README décrit le projet actuel et indique où trouver les sources de vérité. Il ne remplace ni la Vision ni le Chantier.

Prometheus est une plateforme FR/EN pour la musculation, le bodybuilding et le powerlifting.

Sa destination est :

> **marketplace de coaching + moteur commun de suivi de performance + système d’exploitation du coaching.**

Le produit repose sur **un compte utilisateur et un moteur commun**, pas sur trois applications séparées.

Un utilisateur possède :

- un espace personnel : Solo ou Coaché selon l’existence d’une relation Coach active ;
- éventuellement une capacité Coach indépendante ;
- éventuellement un profil marketplace publié ;
- des entitlements commerciaux séparés de ces états.

Principe central : **l’IA prépare ; l’humain décide.**

## Lire avant de modifier le projet

| Besoin | Source |
|---|---|
| Contrat obligatoire pour tout agent | [`AGENTS.md`](AGENTS.md) |
| Règles détaillées agents/dev | [`CLAUDE.md`](CLAUDE.md) |
| Destination produit | [`docs/VISION.md`](docs/VISION.md) |
| Travail restant et ordre d’exécution | [`docs/CHANTIER.md`](docs/CHANTIER.md) |
| Parcours, propriété et permissions cible | [`docs/CARTE_PRODUIT.md`](docs/CARTE_PRODUIT.md) |
| Architecture technique | [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) |
| Design system | [`docs/DESIGN_SYSTEM.md`](docs/DESIGN_SYSTEM.md) |
| Migrations | [`docs/MIGRATIONS.md`](docs/MIGRATIONS.md) |
| Télémétrie | [`docs/TELEMETRY.md`](docs/TELEMETRY.md) |

Les audits dans `docs/AUDIT_*` et les anciens rapports UX sont des diagnostics historiques. Ils ne prennent jamais le pas sur Vision → Chantier → Carte produit → Architecture.

## Capacités déjà présentes

Le dépôt possède déjà une base importante, notamment :

### Expérience personnelle

- Dashboard avec priorité + vue d’ensemble ;
- séances et historique ;
- programme ;
- progression/statistiques ;
- nutrition, recherche, scanner, recettes ;
- poids/photos/check-ins ;
- calendrier Solo ;
- offline séance ;
- propositions Solo partielles.

### Coaching

- console Coach ;
- roster et fiche client ;
- questionnaires versionnés ;
- tracking configurable ;
- programmes, copies, attribution et révisions ;
- messagerie ;
- notes/interventions ;
- Copilote `coach-agent` et analyse déterministe `coach-fleet-round` : le copilote prépare des brouillons via un appel OpenAI synchrone dans l’application ; le triage/fleet hebdomadaire reste sans appel LLM. Leurs propositions nécessitent une décision humaine avant application.

### Marketplace

- profil Coach opt-in ;
- annuaire ;
- comparaison ;
- demandes de coaching ;
- base de lifecycle à faire évoluer selon `docs/CHANTIER.md`.

Ne pas reconstruire ces moteurs sans démontrer une impossibilité structurelle.

## Architecture

```text
src/
├── app/            router, guards, bootstrap, layout, navigation
├── features/       domaines métier
├── shared/         primitives transversales
├── components/     écrans historiques / migration progressive
├── stores/         Zustand et façades historiques
├── lib/            contrats/réexports/utilitaires
└── i18n/           FR/EN

supabase/
├── migrations/     historique DB immuable
├── functions/      Edge Functions
├── tests/          tests SQL/RLS
└── cron/           tâches planifiées
```

Direction pour le nouveau code :

```text
UI
→ hook / use case / model
→ API du domaine
→ Supabase / RPC
```

Voir `docs/ARCHITECTURE.md` pour les règles détaillées.

## Stack

- React 18 ;
- TypeScript ;
- Vite ;
- React Router ;
- Zustand ;
- Tailwind CSS ;
- Supabase Auth/PostgreSQL/Storage/Realtime/Edge Functions ;
- i18next ;
- PWA / Service Worker.

Les versions exactes sont dans `package.json` et `package-lock.json`.

## Installation locale

```bash
git clone https://github.com/Jayvy2002/prometheus-tracker-app.git
cd prometheus-tracker-app
git switch new-JV
npm install
```

Puis configurer `.env`.

Pour l’environnement du dépôt actuel :

```bash
cp .env.production .env
```

`.env.production` ne doit contenir que les clés publiques frontend. Aucun `service_role` ou secret serveur dans Git.

Démarrage :

```bash
npm run dev
```

## Vérifications

Avant de considérer un changement terminé :

```bash
npm test
npm run typecheck
npm run lint
npm run build
npm run verify:migrations
npm run verify:edges
```

Pour un changement RLS/RPC sensible :

```bash
npm run test:rls
```

Une fonctionnalité normale n’est pas considérée terminée avec la CI pertinente rouge.

## Déploiement

`new-JV` est la branche active de développement/production frontend.

Les migrations Supabase sont append-only. Lire `docs/MIGRATIONS.md` avant modification.

Les secrets serveur restent dans les secrets Supabase/plateforme et ne sont jamais commités.

## Règles produit à connaître immédiatement

- Solo/Coaché = état personnel ; Coach = capacité indépendante.
- Un Coach peut lui-même être Coaché.
- Un client : un seul Coach actif maximum.
- Workspace Personal/Coaching ≠ permission.
- IA = propositions, jamais auto-application.
- Dashboard = aujourd’hui ; Calendrier = passé/futur et doit servir Solo + Coaché.
- Demande marketplace ≠ relation active ; confirmation finale = athlète.
- Programmes versionnés ; historique réalisé immuable.
- Pas d’étoiles/avis Coach dans la Vision actuelle.
- Essai Solo = 14 jours ; grâce Coach = 7 jours.
- Prix définitifs non décidés.
- Bêta : accès éventuellement bypassé, consommation/coûts mesurés.

## Licence

Private — all rights reserved.
