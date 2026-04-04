# CLAUDE.md — Prometheus Tracker App

> Relis ce fichier au début de chaque réflexion. Fais un plan avant toute modification lourde.

---

## Tech Stack & Versions

| Couche | Technologie | Version |
|---|---|---|
| Language | TypeScript | 5.5 |
| Framework UI | React | 18.3 |
| Routeur | React Router | 7.13 |
| State Management | Zustand | 5.0 |
| Styling | Tailwind CSS | 3.4 |
| Build | Vite | 5.4 |
| Backend / DB | Supabase (PostgreSQL + Auth + Storage) | 2.57 |
| Edge Functions | Deno (Supabase Functions) | — |
| Charts | Recharts | 3.8 |
| Icons | Lucide React | 0.344 |
| Dates | date-fns | 4.1 |
| Barcode | barcode-detector | 3.1 |
| PWA | Service Worker manuel (`public/sw.js`) | — |

---

## Build / Run / Test Commands

```bash
npm run dev          # Démarre le serveur de développement Vite
npm run build        # Build de production
npm run preview      # Prévisualise le build de production
npm run lint         # ESLint (config flat dans eslint.config.js)
npm run typecheck    # Vérification TypeScript sans emit
```

Variables d'environnement requises (fichier `.env` local, jamais commité) :
```
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

---

## Architecture (dossiers clés + leur rôle)

```
src/
├── App.tsx                    # Racine React + toutes les routes (React Router)
├── main.tsx                   # Point d'entrée, montage React
├── index.css                  # Styles globaux Tailwind
│
├── components/                # Composants React organisés par domaine
│   ├── layout/                # AppLayout, BottomNav, SideNav, FAB, FullPageLayout
│   ├── ui/                    # Composants génériques : Button, Input, Card, Modal, Toast…
│   ├── auth/                  # AuthPage (login / signup)
│   ├── onboarding/            # OnboardingFlow (setup initial)
│   ├── dashboard/             # Dashboard, DashboardGrid, WidgetCard + /widgets/
│   ├── workout/               # WorkoutPage, WorkoutForm, ExercisePicker, RestTimer…
│   ├── nutrition/             # NutritionPage, FoodForm, RecipesPage, WaterTracker…
│   ├── scanner/               # ScannerPage (BarcodeDetection API), CreateProductForm
│   ├── weight/                # WeightPage
│   ├── routines/              # RoutinesPage, RoutineForm
│   ├── profile/               # ProfilePage, GoalsForm, UnitsForm, AvatarUpload…
│   ├── stats/                 # StatsPage (analytics)
│   ├── calendar/              # CalendarPage
│   ├── health/                # HealthIntegrations (Apple Health, Garmin, Fitbit…)
│   └── ErrorBoundary.tsx
│
├── stores/                    # Zustand stores (un fichier par domaine)
│   ├── authStore.ts           # Auth : login, signup, logout, session
│   ├── profileStore.ts        # Profil utilisateur + préférences
│   ├── workoutStore.ts        # Séances, exercices, sets
│   ├── exerciseStore.ts       # Bibliothèque d'exercices
│   ├── nutritionStore.ts      # Journal alimentaire, macros
│   ├── recipeStore.ts         # Recettes sauvegardées
│   ├── routineStore.ts        # Templates de routines
│   ├── weightStore.ts         # Mesures de poids
│   └── streakStore.ts         # Suivi des streaks
│
├── lib/
│   ├── supabase.ts            # Client Supabase (lit VITE_SUPABASE_URL/ANON_KEY)
│   ├── types.ts               # Tous les types/interfaces TypeScript (source de vérité)
│   ├── utils.ts               # Fonctions pures : BMR, TDEE, macros, conversions unités
│   ├── constants.ts           # Constantes de l'app (niveaux d'activité, objectifs…)
│   ├── barcodeScanner.ts      # Intégration BarcodeDetection API
│   ├── notifications.ts       # Notifications push
│   ├── offlineCache.ts        # Cache offline LocalStorage
│   └── gridLayout.ts          # Logique de layout du dashboard
│
public/
├── manifest.json              # Config PWA
└── sw.js                      # Service Worker (cache offline)
│
supabase/
├── migrations/                # 15 migrations SQL Supabase (source de vérité DB)
└── functions/
    ├── analyze-product/       # Edge Function : analyse produit barcode par IA
    ├── delete-account/        # Edge Function : suppression compte + données
    └── verify-exercise/       # Edge Function : vérification exercice par IA
```

### Routes principales (React Router)

| Route | Composant | Accès |
|---|---|---|
| `/auth` | AuthPage | Public |
| `/onboarding` | OnboardingFlow | Auth requis |
| `/dashboard` | Dashboard | Auth requis |
| `/workout` | WorkoutPage | Auth requis |
| `/workout/new` | WorkoutForm | Auth requis |
| `/workout/:id` | WorkoutForm | Auth requis |
| `/nutrition` | NutritionPage | Auth requis |
| `/scanner` | ScannerPage | Auth requis |
| `/recipes` | RecipesPage | Auth requis |
| `/routines` | RoutinesPage | Auth requis |
| `/weight` | WeightPage | Auth requis |
| `/profile` | ProfilePage | Auth requis |
| `/stats` | StatsPage | Auth requis |
| `/calendar` | CalendarPage | Auth requis |
| `/exercise-progress` | ExerciseProgressPage | Auth requis |
| `/health` | HealthIntegrations | Auth requis |

---

## Coding Conventions & Style

- **TypeScript strict** — pas de `any` implicite, toujours typer les props et retours
- **Types centralisés** — tout dans `src/lib/types.ts`, jamais de types inline dupliqués
- **Composants fonctionnels** uniquement, avec hooks React
- **State global** via Zustand uniquement (pas de Context API pour l'état partagé)
- **Tailwind CSS** pour le style — pas de CSS modules ni styled-components
- **Nommage** : PascalCase pour composants, camelCase pour fonctions/variables, snake_case pour les colonnes DB
- **Organisation** : un composant par fichier, groupés par domaine métier
- **Imports** : chemins relatifs dans `src/`, pas d'alias sauf si configuré dans Vite
- **Pas de tests automatisés** en place actuellement — vérifier manuellement et via `typecheck`
- **ESLint** flat config (`eslint.config.js`) avec règles react-hooks et react-refresh
- **Edge Functions** en Deno (TypeScript) dans `supabase/functions/`

---

## Règles de sécurité

- **JAMAIS commiter `.env`** ni aucun fichier contenant des clés API, tokens ou secrets
- Les variables d'environnement Supabase (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`) restent dans `.env` local uniquement
- **RLS activé** sur toutes les tables Supabase — ne jamais désactiver sans raison explicite
- Les Edge Functions utilisent le service role key côté serveur uniquement — ne jamais l'exposer côté client
- Toute modification de politique RLS doit passer par une migration SQL versionnée dans `supabase/migrations/`
- Les images uploadées (avatars, produits) passent par les buckets Supabase Storage avec policies RLS
- Avant toute commande bash risquée (drop, delete, reset) : évaluer l'impact d'abord, confirmer avec l'utilisateur
- Ne jamais commiter sans instruction explicite de l'utilisateur
