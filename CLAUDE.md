# CLAUDE.md — Prometheus (branche new-JV)

> Relis ce fichier au début de chaque réflexion. Fais un plan avant toute modification lourde.
>
> **Produit :** moteur de coaching intelligent pour l'entraînement de **force et de physique** (musculation, bodybuilding, powerlifting), **EN + FR**. Il comprend l'athlète, construit son plan, observe et propose comment le faire évoluer. **En solo, l'athlète valide ; avec un coach, Prometheus prépare et le coach valide.** Trois rôles : Coach / Client coaché / Solo. Vision complète, phase actuelle (consolidation) et chantiers : `docs/VISION.md` — lis-le avant de toucher au produit.
> **Copilote IA :** `coach-agent` (OpenAI, brouillons seulement). L'IA prépare, l'humain décide, rien ne s'auto-applique. Second / Grok Bots sont hors de la boucle — ne pas recâbler `GROK_BOT_WEBHOOK_URL`.
> **Billing :** gratuit pendant la construction. Les 3 functions Stripe répondent 410. Ce n'est pas « jamais de Premium », c'est « pas maintenant ».
> **`new-JV` = le produit et la prod.** Netlify la déploie sur `tracker.prometheus-fit.com` à chaque merge ; le projet Supabase « coaching » est la base de prod (migrations appliquées à la main avant le merge). `main` = ancien tracker solo, abandonné. Pas de test destructif sur la base de prod.

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
| Backend / DB | Supabase (PostgreSQL + Auth + Storage + Realtime) | 2.57 |
| Edge Functions | Deno (Supabase Functions) | — |
| i18n | i18next (fr par défaut, en) | 26 |
| Charts | Recharts | 3.8 |
| Icons | Lucide React | 0.344 |
| Dates | date-fns | 4.1 |
| Barcode | barcode-detector | 3.1 |
| PWA | Service Worker manuel (`public/sw.js`) | — |

---

## Build / Run / Test Commands

```bash
npm run dev          # Serveur de développement Vite
npm run build        # Build de production
npm run preview      # Prévisualise le build
npm run lint         # ESLint (flat config, eslint.config.js)
npm run typecheck    # tsc --noEmit
npm test             # Tests src/lib/*.test.ts (node:test via tsx) — liste explicite dans package.json
```

Avant de considérer une tâche finie : `npm test` + `npm run typecheck` + `npm run lint` verts. Beaucoup de tests lisent la **source** des composants (verrous produit) : si tu changes un comportement produit, mets le test à jour dans le même commit, ne le contourne pas.

Variables d'environnement requises (fichier `.env` local, jamais commité) :
```
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
VITE_VAPID_PUBLIC_KEY=...   # optionnel, push
```

---

## Architecture

```
src/
├── App.tsx                    # Routes + gardes de rôle (CoachOnly, CoachTrackerRedirect,
│                              #   CoachedAthleteRedirect, TrackingGate) + murs onboarding / intake
├── main.tsx                   # Point d'entrée
│
├── components/
│   ├── layout/                # AppLayout, BottomNav, SideNav, FAB, CoachProfileButton
│   ├── ui/                    # Button, Input, Card, Modal, Toast, ScoreSlider…
│   ├── auth/                  # AuthPage (3 portes : coach / client invité / solo), ResetPasswordPage
│   ├── onboarding/            # KinesiologyIntakeFlow + Review (27 q, reprise, cibles solo) ; OnboardingFlow = legacy tracker
│   ├── coaching/              # Côté coach : CoachDashboard, CoachTodayQueue, ClientsPage, ClientDetailPage (360),
│   │                          #   ClientSetupPage, InterventionDraftPage, CoachInboxPage, AskPrometheusPage,
│   │                          #   ProgramSessionEditor, CoachSettingsPanel, TrackingGate, InvitePage…
│   │                          #   Côté client : ClientMessagesPage, ClientPhotosPage
│   ├── programs/              # ProgramsPage / ProgramEditorPage (coach), ClientProgramPage (coaché)
│   ├── dashboard/             # Dashboard (accueil client / solo), ClientGymCard, SoloWeeklyReview (copilote solo hebdo)
│   ├── checkin/               # CheckInPage (0–10)
│   ├── workout/               # WorkoutPage, WorkoutForm, ExerciseCard, RestTimer, SessionTimer…
│   ├── nutrition/             # NutritionPage, FoodForm, RecipesPage, WaterTracker, WeeklyAdjustment…
│   ├── scanner/               # ScannerPage + UnifiedScanner (barcode + photo IA)
│   ├── weight/ routines/ stats/ calendar/ profile/
│   └── ErrorBoundary.tsx
│
├── stores/                    # Zustand, un fichier par domaine
│   ├── coachingStore.ts       # Rôle, invites, roster, ops, interventions, messages, realtime, tracking config
│   ├── soloCopilotStore.ts    # Décision hebdo du solo (solo_weekly_reviews), seule écriture copilote → cibles
│   ├── programStore.ts        # Programmes, jours, exercices, assignations
│   ├── checkinStore.ts        # Check-ins quotidiens
│   ├── authStore / profileStore / workoutStore / nutritionStore / weightStore
│   ├── routineStore / recipeStore / streakStore / exerciseStore / preferencesStore
│
├── lib/
│   ├── types.ts               # Tous les types (source de vérité)
│   ├── utils.ts               # BMR, TDEE, macros ISSN, dates, unités
│   ├── kinesiologyIntake.ts   # 27 questions (labels FR = source de vérité), gate du mur, patch profil, drapeaux médicaux
│   ├── telemetry.ts / telemetryClient.ts   # Télémétrie produit (pur + track())
│   ├── soloCopilot.ts         # Bilan hebdo solo : dossier depuis ses logs → règles fleet → explication
│   ├── clientTracking.ts      # Modules / variables allumés par le coach
│   ├── coachRole.ts           # isCoachedAthlete
│   ├── coach*.ts              # Logique coach pure (fleet, queue, priorities, alerts, interventions…)
│   ├── client*.ts             # Logique client pure (home, gym card, live, auth)
│   ├── supabase.ts / supabaseFunctions.ts / realtimeWait.ts
│   └── *.test.ts              # Tests node:test
│
├── i18n/locales/{fr,en}.ts    # Parité de clés obligatoire
│
supabase/
├── migrations/                # Source de vérité DB (immutables une fois appliquées)
├── cron/                      # schedule_coach_fleet_round.sql, schedule_daily_reminders.sql
└── functions/
    ├── coach-agent/           # Ask + brouillons IA (sync OpenAI, écrit coach_interventions pending)
    ├── coach-fleet-round/     # Tournée SQL de tous les clients liés + brouillons Relancer / kcal
    ├── notify-onboarding-complete/  # Trigger DB → brouillon onboarding_plan
    ├── analyze-product/ verify-exercise/   # IA nutrition / exercices
    ├── send-daily-reminders/  # Web Push VAPID
    ├── delete-account/
    ├── ask-second/ suggest-client-plan/    # Retirés — 410
    └── create-checkout-session/ create-portal-session/ stripe-webhook/  # Quarantaine — 410
```

### Routes principales

| Route | Composant | Qui |
|---|---|---|
| `*` (déconnecté) | AuthPage | Public |
| `/invite/:token` | InvitePage | Public |
| `/intake` | KinesiologyIntakeFlow | Athlète — mur pour tout nouveau compte (solo ou invité), reprenable ; le solo finit sur ses cibles |
| `/dashboard` | CoachDashboard / Dashboard | Tous |
| `/clients`, `/clients/:id`, `/clients/:id/setup`, `/clients/:id/draft/:id`, `/inbox/:id` | Console coach | CoachOnly |
| `/prometheus` | AskPrometheusPage | CoachOnly |
| `/programs` | ProgramsPage (coach) / ClientProgramPage (coaché) / → `/workout` (solo) | Selon rôle |
| `/messages` | CoachInboxPage / ClientMessagesPage | Coach / athlète |
| `/photos` | ClientPhotosPage | Athlète |
| `/workout*`, `/nutrition`, `/scanner`, `/weight`, `/checkin` | Tracker | Athlète, TrackingGate si coaché |
| `/stats`, `/calendar`, `/recipes`, `/routines`, `/exercise-progress` | Tracker | Solo seulement |
| `/profile` | ProfilePage | Tous |

---

## Verrous produit (ne pas casser)

- **L'IA prépare, l'humain décide.** `coach-agent` et `coach-fleet-round` écrivent uniquement des `coach_interventions` `pending`. Apply = action UI du coach (Envoyer). Copilote solo : `SoloWeeklyReview` propose, la seule écriture vers les cibles est `soloCopilotStore.decide('accepted')` — le tap du solo.
- **Pas de Grok Bots, pas de Second.** Un seul invoke IA côté coach : `COACH_AGENT_FUNCTION = 'coach-agent'`.
- **Fleet :** triage SQL cheap (`triage_coach_fleet`, agrégats 14 j), Relancer si non assidu, kcal+P/C/F complets sinon. 100 % déterministe, pas d'appel LLM. Les textes FR/EN sont dans `supabase/functions/_shared/fleetCopy.ts`, partagés avec le miroir `src/lib/coachFleet.ts` ; la langue vient de `user_profiles.language` du coach.
- **Rôle client uniquement via `accept_coach_invite`.** Coach et solo s'inscrivent librement.
- **Macros d'un coaché : écriture coach-only** (RPC `coach_set_client_nutrition_targets` + trigger). Le calcul automatique au setup est un chantier ouvert (voir VISION), le verrou d'écriture reste.
- **Tracking coaché piloté par `client_tracking_config`** : ligne créée à l'invitation avec les défauts du coach, affinée au setup ; `ALL_OFF_TRACKING` seulement sans ligne ; `TrackingGate` sur les routes.
- **Fin de lien = retour solo** (`end_coach_client_link` : rôle `none`, tracking config retirée, cibles et historique conservés, programme en pause, `coach_link_ended_at` + `solo_trial_ends_at`). Le client ne doit jamais rester « coaché sans coach ».
- **Ne pas splitter `coachingStore`** dans un PR de cleanup.

---

## Conventions

- **TypeScript strict**, types centralisés dans `src/lib/types.ts`.
- **Composants fonctionnels**, un par fichier, groupés par domaine.
- **Zustand** pour l'état partagé, pas de Context.
- **Tailwind** uniquement. Pas de restyle non demandé, pas de nouvelle lib UI.
- **Nommage :** PascalCase composants, camelCase fonctions, snake_case colonnes DB.
- **i18n :** tout texte visible passe par `t()`, FR tutoiement, parité fr/en.
- **Logique pure dans `src/lib/`**, testée avec node:test ; les composants restent minces.
- **Télémétrie :** toute nouvelle boucle produit appelle `track()` (`src/lib/telemetryClient.ts`), fire-and-forget. Le nom de l'événement s'ajoute d'abord à `ProductEventName` dans `types.ts`. `props` = ids, kinds, booléens, compteurs — jamais de nom, d'e-mail ni de texte libre. Table `public.product_events`, insert-only depuis l'app.
- **Edge Functions** en Deno dans `supabase/functions/`.

---

## Sécurité

- **JAMAIS commiter `.env`** ni clés, tokens, secrets.
- **RLS activé** sur toutes les tables — ne jamais désactiver.
- Service role key côté edge uniquement.
- Toute politique RLS / RPC passe par une migration versionnée. Les migrations appliquées sont immuables : on en ajoute, on ne réécrit pas.
- Buckets Storage (`avatars`, `product-images`, `progress-photos`) avec policies.
- Avant toute commande destructive (drop, delete, reset) : évaluer l'impact, confirmer avec l'utilisateur.
- Ne jamais commiter sans instruction explicite de l'utilisateur.
