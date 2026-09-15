# Architecture frontend — actuel vs cible

> **Rôle** — matrice « tel fichier va ici ». Diagnostic : [`AUDIT_ARCHITECTURE.md`](AUDIT_ARCHITECTURE.md). Ordre : [`CHANTIER.md`](CHANTIER.md) lots **17–23**. Ce fichier **n’autorise pas** un déplacement : le lot **17** documente ; les lots **18–23** bougent, un domaine ou une ligne à la fois.
>
> **Invariants :** zéro changement de parcours dans une PR de structure (sauf lot 19 : mêmes écrans, tokens). `coachingStore` : **pas** de découpage avant le lot **21c** (façade obligatoire). `coachFleet.ts` et `supabase/functions/coach-fleet-round` restent jumelés. Migrations appliquées immuables.

---

## Arbre actuel (ne pas inventer l’autre)

```text
src/
├── App.tsx                 Routes, gardes, bootstrap session / offline / onboarding
├── main.tsx
├── index.css
├── vite-env.d.ts
├── components/             Écrans et blocs par domaine (chemins relatifs)
│   ├── auth/ calendar/ checkin/ coaching/ dashboard/
│   ├── layout/             AppLayout, BottomNav, SideNav, FAB
│   ├── marketplace/ nutrition/ onboarding/ profile/ programs/
│   ├── routines/ scanner/ solo/ stats/ ui/ weight/ workout/
│   └── ErrorBoundary.tsx
├── hooks/                  Aujourd’hui : usePageTitle.ts seulement
├── i18n/locales/{fr,en}.ts
├── lib/                    Logique, contrats, hooks mal placés, **tous les tests unitaires**
├── navigation/             navConfig + test
└── stores/                 Zustand, un fichier par domaine (coachingStore = gros)

supabase/
├── migrations/ + schema_migrations.lock.json
├── functions/              coach-agent, coach-fleet-round, …
└── tests/                  SQL RLS / RPC (pas des `*.test.ts` Vite)
```

Imports : chemins relatifs dans `src/`. **Pas d’alias `@/`** tant que le lot **18** n’est pas livré.

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
| Route, garde, bootstrap session | `App.tsx` | `app/router`, `app/guards`, `app/bootstrap` | **21a** |
| Layout, nav, FAB | `components/layout/*`, `navigation/*` | `app/layout/`, `app/navigation/` | **18** |
| Primitive UI (`Button`, `Card`, …) | `components/ui/*` | `shared/ui/` | **18** |
| Client Supabase | `lib/supabase.ts` | `shared/api/supabase/` | **18** |
| `useOnline.ts` | `lib/` | `shared/hooks/` | **18** |
| `usePageTitle.ts` | `hooks/` | `shared/hooks/` | **18** |
| `useAccountContext.ts` | `lib/` | `features/account/hooks/` | **18** |
| `useClientTracking.ts` | `lib/` | `features/coaching/hooks/` | **18** |
| `useFoodCatalogSearch.ts` | `lib/` | `features/nutrition/hooks/` | **18** |
| `coach*.ts` (agent, fleet, ask, …) | `lib/coach*.ts` | `features/coaching/` | **20** — **pas 18** |
| Autre domaine dans `lib/` | `lib/<domaine>` | `features/<domaine>/` | **20** (une PR / domaine) |
| Utils transverses, télémétrie, offline | `lib/` | `shared/lib/` | **20** quand ce n’est plus du domaine |
| `types.ts` | `lib/types.ts` | `shared/types` + `features/*/types` + réexport | **22a** |
| i18n | `i18n/locales/fr.ts`, `en.ts` | `i18n/locales/{fr,en}/*.ts` | **22b** |
| Store Zustand (sauf coaching) | `stores/*Store.ts` | `features/*/model/` | progressif, **pas 18** |
| `coachingStore.ts` | `stores/coachingStore.ts` | modules + **façade** du même nom | **21c** seulement |
| Écran métier | `components/<domaine>/` | `features/<domaine>/components/` | avec le domaine (20–21), pas un bang |
| Test unitaire | `src/**/*.test.ts` | reste à côté du module testé | **17b** = découverte ; **17e** = renommer `auditLot*` plus tard |
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

Noms `auditLot*.test.ts` / `uxPremium.test.ts` : **lot 17e**, un rename progressif, pas dans la même PR que la découverte.

---

## Environnement

Voir `CLAUDE.md` (convention unique, lot 17d) et [`DESIGN_SYSTEM.md`](DESIGN_SYSTEM.md) pour les tokens. Jamais `service_role` dans Git.
