# CLAUDE.md — Prometheus (coaching, branche new-JV)

> Relis ce fichier au début de chaque réflexion. Fais un plan avant toute modification lourde.
>
> **Produit :** plateforme de coaching boostée IA. Pas un CRM. Pas un éditeur calories. Pas Premium.
> **Agent in-app :** `coach-agent` (OpenAI, brouillons seulement). Second / Grok Bots sont **hors** de la boucle produit — ne pas recâbler `GROK_BOT_WEBHOOK_URL`.
> **Audit (source de vérité des findings) :** `docs/AUDIT_PRODUIT_2026-08-31.md`
> **Live `main`** = ancien tracker. Ne pas merger new-JV dans main depuis un audit. Ne pas toucher live/backup DB.
> **Pas de Stripe / Premium.** Les 3 functions billing répondent 410.

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
npm test             # Tests src/lib/*.test.ts (tsx)
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
│   ├── dashboard/             # Dashboard (vue unique, plus de widgets)
│   ├── workout/               # WorkoutPage, WorkoutForm, ExercisePicker, RestTimer…
│   ├── nutrition/             # NutritionPage, FoodForm, RecipesPage, WaterTracker…
│   ├── scanner/               # ScannerPage (BarcodeDetection API + UnifiedScanner)
│   ├── weight/                # WeightPage
│   ├── routines/              # RoutinesPage, RoutineForm
│   ├── profile/               # ProfilePage, GoalsForm, UnitsForm, AvatarUpload…
│   ├── stats/                 # StatsPage (analytics)
│   ├── calendar/              # CalendarPage
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
│   ├── streakStore.ts         # Suivi des streaks
│   └── preferencesStore.ts    # Préférences locales (ex. affichage RIR)
│
├── i18n/                      # i18next — locales en / fr
│
├── lib/
│   ├── supabase.ts            # Client Supabase (lit VITE_SUPABASE_URL/ANON_KEY)
│   ├── types.ts               # Tous les types/interfaces TypeScript (source de vérité)
│   ├── utils.ts               # BMR, TDEE, macros, dates locales, conversions unités
│   ├── constants.ts           # Constantes de l'app (niveaux d'activité, objectifs…)
│   ├── barcodeScanner.ts      # Intégration BarcodeDetection API
│   ├── notifications.ts       # Notifications push
│   └── offlineCache.ts        # Cache offline LocalStorage
│
public/
├── manifest.json              # Config PWA
└── sw.js                      # Service Worker (cache offline)
│
supabase/
├── migrations/                # Migrations SQL Supabase (source de vérité DB)
└── functions/
    ├── analyze-product/       # IA : analyse produit (images / barcode)
    ├── verify-exercise/       # IA : validation d'un exercice
    ├── coach-agent/           # Ask + programme IA (brouillons, jamais d’auto-apply)
    ├── coach-fleet-round/     # Tournée SQL + drafts Relancer / kcal / programme
    ├── ask-second/            # Retiré (410) — utiliser coach-agent
    ├── suggest-client-plan/   # Retiré (410)
    ├── delete-account/        # Suppression compte + données
    ├── send-daily-reminders/  # Web Push via VAPID
    └── create-checkout-session, create-portal-session, stripe-webhook
                               # Quarantaine 410 — ne pas appeler, ne pas coder Premium
```

### Routes principales (React Router)

| Route | Composant | Accès |
|---|---|---|
| `/auth` | AuthPage | Public |
| `/onboarding` | OnboardingFlow | Auth requis |
| `/dashboard` | Dashboard / CoachDashboard | Auth requis |
| `/clients` | ClientsPage | CoachOnly |
| `/clients/:id` | ClientDetailPage | CoachOnly |
| `/messages` | CoachInbox / ClientMessages | Auth requis |
| `/prometheus` | AskPrometheusPage | CoachOnly |
| `/programs` | ProgramsPage / ClientProgramPage | Auth requis |
| `/photos` | ClientPhotosPage | Client |
| `/workout` | WorkoutPage | Auth + TrackingGate |
| `/nutrition` | NutritionPage | Auth + TrackingGate |
| `/profile` | ProfilePage | Auth requis |

---

## Coach fleet — architecture lock (2026-08-29)

- **Pas de Grok Bots** (ni per-coach ni per-client). Second était trop lent ; ça ne scale pas.
- Revue hebdo **in-app** : `coach-fleet-round` + cron `invoke_coach_fleet_round`.
- `triage_coach_fleet` : SQL cheap de **tous** les clients actifs (agrégats 14 j, pas les logs bruts).
- Propositions data-driven : si le client ne suit pas → Relancer, pas de changement de cibles. S’il suit : cut perte normale = keep, stall = petite coupe, reprise = coupe plus franche, fatigue/perf = plus de glucides ; bulk/perf en miroir. kcal+P/C/F complets. ISSN = formule de départ seulement.
- LLM **seulement** s’il y a une proposition de plan/programme que les formules n’écrivent pas (`program_adjustment`). Relancer et kcal sont déterministes.
- Écrit uniquement des brouillons `coach_interventions`. Jamais d’auto-apply. Jamais de POST `GROK_BOT_WEBHOOK_URL`. L’agent in-app s’appelle `coach-agent`, pas Second.
- Copie coaching : `phyuijjekxtjvipjtdfv`. Ne pas toucher `main` / backup `nebysjpqifqphvmveowe`.

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
- **Tests** : `npm test` (tsx, `src/lib/*.test.ts`) + `npm run typecheck` + `npm run lint`. Ne pas splitter `coachingStore`.
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
