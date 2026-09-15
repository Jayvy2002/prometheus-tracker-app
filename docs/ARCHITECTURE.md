# Architecture frontend — actuel vs cible

> **Rôle** — matrice « tel fichier va ici ». Diagnostic : [`AUDIT_ARCHITECTURE.md`](AUDIT_ARCHITECTURE.md). Ordre : [`CHANTIER.md`](CHANTIER.md) lots **17–23**. Lots **18–21c** livrés. Les lots **22–23** bougent encore, une ligne à la fois.
>
> **Invariants :** zéro changement de parcours dans une PR de structure (sauf lot 19 : mêmes écrans, tokens). `coachingStore` : façade `stores/coachingStore.ts` + modules `features/coaching/model` (lot **21c**). `coachFleet.ts` et `supabase/functions/coach-fleet-round` restent jumelés. Migrations appliquées immuables.

---

## Arbre actuel (après lot 21c)

```text
src/
├── App.tsx                 Assembleur BrowserRouter + AppRoutes
├── app/
│   ├── router/             AppRoutes (public / authentifié)
│   ├── guards/             CoachOnly, CoachTrackerRedirect, CoachedAthleteRedirect
│   ├── bootstrap/          useAuthenticatedSession
│   ├── layout/             AppLayout, BottomNav, SideNav, FAB
│   └── navigation/         navConfig + test
├── features/
│   ├── account/hooks/      useAccountContext
│   ├── coaching/hooks/     useClientTracking, useClientDossier
│   ├── coaching/domain/    coach*.ts (lot 20) — réexports dans lib/
│   ├── coaching/model/     slices coachingStore (lot 21c)
│   ├── coaching/types.ts   contrats coaching (lot 22a)
│   ├── marketplace/domain/ marketplace*.ts (lot 20)
│   ├── workout/domain/     séances, exos, disques (lot 20)
│   ├── workout/types.ts    contrats séance (lot 22a)
│   ├── nutrition/          hooks + domain + types (lot 22a)
│   └── programs/           domain + types (lot 22a)
├── shared/
│   ├── api/supabase/       client
│   ├── hooks/              useOnline, usePageTitle
│   ├── types.ts            contrats transversaux (lot 22a)
│   └── ui/                 primitives (tokens lot 19)
├── components/             Écrans métier ; ui/ et layout/ = réexports temporaires
├── hooks/                  réexport usePageTitle
├── i18n/locales/{fr,en}.ts
├── lib/                    Métier + réexports (`types.ts` baril 22a)
├── navigation/             réexport navConfig
└── stores/                 Zustand ; coachingStore = façade (21c)

supabase/
├── migrations/ + schema_migrations.lock.json
├── functions/              coach-agent, coach-fleet-round, …
└── tests/                  SQL RLS / RPC (pas des `*.test.ts` Vite)
```

Alias livrés : `@/app/*`, `@/features/*`, `@/shared/*` (Vite + `tsconfig.app.json`). Les anciens chemins réexportent. `stores/coachingStore.ts` = façade (21c). `lib/types.ts` = réexport (22a). i18n : **pas** découpé (lot 22b).

Convention d’accès données **cible** (à écrire ici, à faire respecter aux lots 20 puis 23) :

`composant → hook / model → API → Supabase`

Un écran ne devrait pas appeler `supabase.from(...)`. Aujourd’hui certains le font encore (`Dashboard`, etc.). **Ne pas « nettoyer » dans cette PR.**

---

## Arbre cible (lots 18–23)

```text
src/
├── app/          router, guards, bootstrap, layout, navigation
├── features/     coaching, workout, nutrition, programs, marketplace,
│                 onboarding, checkin, profile, account
│                 chacun : api / components / domain / hooks / model / types
├── shared/       api/supabase, hooks, lib, types, ui
├── i18n/
└── main.tsx
```

Alias (lot **18**) : `@/app/*`, `@/features/*`, `@/shared/*`.

---

## Matrice « où va un fichier »

| Si tu crées / touches… | Aujourd’hui | Cible | Lot qui déplace |
|---|---|---|---|
| Route, garde, bootstrap session | `app/router`, `app/guards`, `app/bootstrap` (+ `App.tsx` assembleur) | idem | **21a livré** |
| Layout, nav, FAB | `app/layout/`, `app/navigation/` (+ réexports) | idem | **18 livré** |
| Primitive UI (`Button`, `Card`, …) | `shared/ui/` (+ réexports) | idem | **18 livré** |
| Client Supabase | `shared/api/supabase/` (+ réexport `lib/supabase.ts`) | idem | **18 livré** |
| `useOnline.ts` | `shared/hooks/` | idem | **18 livré** |
| `usePageTitle.ts` | `shared/hooks/` | idem | **18 livré** |
| `useAccountContext.ts` | `features/account/hooks/` | idem | **18 livré** |
| `useClientTracking.ts` | `features/coaching/hooks/` | idem | **18 livré** |
| `useFoodCatalogSearch.ts` | `features/nutrition/hooks/` | idem | **18 livré** |
| `coach*.ts` (agent, fleet, ask, …) | `features/coaching/domain/` (+ réexports `lib/`) | idem | **20 coaching livré** |
| Autre domaine dans `lib/` | `features/<domaine>/domain/` (+ réexports) | idem | **20 livré** |
| Utils transverses, télémétrie, offline | `lib/` | `shared/lib/` | **20** quand ce n’est plus du domaine |
| `types.ts` | réexport `lib/types.ts` + `shared/types` + `features/*/types` | idem | **22a livré** |
| i18n | `i18n/locales/fr.ts`, `en.ts` | `i18n/locales/{fr,en}/*.ts` | **22b** |
| Fetch / orchestration écrans listés | hooks `features/*/hooks` + `workout/data` | idem | **21b livré** |
| Store Zustand (sauf coaching) | `stores/*Store.ts` | `features/*/model/` | progressif, **pas 18** |
| `coachingStore.ts` | façade `stores/coachingStore.ts` + `features/coaching/model` | idem | **21c livré** |
| Écran métier | `components/<domaine>/` | `features/<domaine>/components/` | avec le domaine (20–21), pas un bang |
| Test unitaire | `src/**/*.test.ts` | reste à côté du module testé | **17b** = découverte ; **17e** livré |
| Edge Function | `supabase/functions/<nom>/` | inchangé | — |
| Migration SQL | `supabase/migrations/` | inchangé ; **jamais** réécrire l’historique | — |

**Interdit dans le lot 18** (rappel) : `coach*.ts`, split `App.tsx`, `stores/`, `types.ts`, i18n, gros composants.

---

## Tests

`npm test` lance `scripts/run-unit-tests.mjs`, qui collecte **tous** les `src/**/*.test.ts` (plus seulement `src/lib`). Un fichier `src/navigation/foo.test.ts` ou `src/components/.../foo.test.ts` est visible sans éditer `package.json`.

Hors de ce runner (volontaire, besoin d’un navigateur / Postgres local) :

- `scripts/test-profile-session.mjs`, `scripts/test-service-worker.mjs`
- `npm run test:rls` et les `.sql` sous `supabase/tests/`
- `scripts/test-questionnaire-browser.mjs` (CI `rls-matrix`)

Ne pas y coller un test unitaire : il resterait invisible pour un agent qui ne lance que `npm test` si on le met uniquement dans le workflow.

Noms historiques `auditLot*` / `uxPremium` : **lot 17e** — renommés d’après le verrou (`programAtomicWrites`, `reviewWindowAndPortions`, `clientDossierRealtime`, `programRevisionsAndIntake`, `honestTargetsAndFirstRun`).

---

## Environnement

Voir `CLAUDE.md` (convention unique, lot 17d) et [`DESIGN_SYSTEM.md`](DESIGN_SYSTEM.md) pour les tokens. Jamais `service_role` dans Git.
