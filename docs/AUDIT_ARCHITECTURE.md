# Audit — Architecture et structure du repo

> **Rôle de ce document** — diagnostic de l’organisation du frontend (et de quelques contradictions docs / tests / env). Ce n’est pas un backlog. Les statuts et la file d’exécution restent dans [`CHANTIER.md`](CHANTIER.md) lots **17–23**. La destination produit reste [`VISION.md`](VISION.md). Les parcours cibles restent [`CARTE_PRODUIT.md`](CARTE_PRODUIT.md). L’audit navigation (chrome, onglets) reste [`AUDIT_NAVIGATION_UX.md`](AUDIT_NAVIGATION_UX.md) — autre sujet.
>
> **Preuve :** revue de `new-JV` au commit `2222e11` (15 septembre 2026). Verdict ~6,5/10. Ce n’est pas un ordre d’implémentation. Si ce texte contredit le Chantier, **le Chantier gagne**.
>
> **IDs.** Série **ARCH**, distincte du catalogue UX et des parcours `S01` de la carte produit. Ne pas inventer d’IDs UX.

---

## Verdict

Le repo n’est pas mal structuré. Il a **grandi plus vite que son architecture**. Racine et backend Supabase sont plutôt propres. Le frontend devient difficile à naviguer pour des agents : il n’y a pas de règle simple pour savoir **où va un nouveau fichier**.

| Axe | État | Note |
|---|---|---|
| Structure racine du repo | Bonne | 8/10 |
| Organisation par domaine frontend | Moyenne | 6/10 |
| Séparation UI / logique / données | À améliorer | 5/10 |
| Design system | Bon socle, application incomplète | 6/10 |
| Stores / état | Fonctionnel mais concentré | 5/10 |
| Tests / CI | Solides, lancement fragile | 7/10 |
| Supabase / migrations | Bonne | 8/10 |
| Documentation agents | Bonne, contradictoire par endroits | 7/10 |
| Travail multi-agents | Moyenne | 5–6/10 |

Cinq zones qui empêchent le repo d’être évident : **`src/lib`**, **`App.tsx`**, **`coachingStore`**, **les très gros fichiers**, **le design system à moitié appliqué**.

Ne pas réécrire l’application. Migration progressive vers `app` / `features` / `shared`, **PR de structure pures**, domaine par domaine, tests verts entre chaque étape. **Interdit :** une PR qui déplace 300 fichiers **et** change du comportement.

---

## Cible dossiers (rappel — le Chantier ordonne)

```text
src/
├── app/          router, guards, bootstrap, layout, navigation
├── features/     coaching, workout, nutrition, programs, marketplace, onboarding, checkin, profile, account
│                 chacun : api / components / domain / hooks / model / types
├── shared/       api/supabase, hooks, lib, types, ui
├── i18n/
└── main.tsx
```

Alias : `@/app/*`, `@/features/*`, `@/shared/*`.

Convention d’accès données : **composant → hook / model → API → Supabase**. Un composant ne devrait pas connaître `supabase.from(...)`.

---

## Constats

### ARCH01 — `src/lib` est un deuxième `src`

Règles métier, API, hooks React, utilitaires, tests, coaching, marketplace, nutrition, workout, Supabase, télémétrie, offline, questionnaires : tout est dans `lib/`. Le domaine coaching est une série `coachAgent.ts`, `coachAlerts.ts`, `coachAsk.ts`, `coachFleet.ts`, `coachNutrition.ts`, `coachQueue.ts`, `coachRecovery.ts`, etc. Le préfixe `coach*` signale un dossier `features/coaching/`.

Aujourd’hui un agent ne peut pas répondre sans explorer : « nouvelle logique de progression coaché → `components/coaching`, `lib`, `stores`, ou ailleurs ? »

**File :** lots 18 (socle) puis **20** (migration domaine par domaine, coaching d’abord).

### ARCH02 — Fichiers au mauvais endroit

`src/hooks` ne contient que `usePageTitle.ts`. En parallèle dans `lib/` : `useOnline.ts`, `useAccountContext.ts`, `useClientTracking.ts`, `useFoodCatalogSearch.ts`.

Cibles évidentes (lot **18**, pas le reste de `lib`) :

| Actuel | Cible |
|---|---|
| `lib/useOnline.ts` | `shared/hooks/` |
| `lib/useAccountContext.ts` | `features/account/hooks/` |
| `lib/useClientTracking.ts` | `features/coaching/hooks/` |
| `lib/useFoodCatalogSearch.ts` | `features/nutrition/hooks/` |
| `lib/supabase.ts` | `shared/api/supabase/` |
| `components/ui/*` | `shared/ui/` |
| `components/layout/*` | `app/layout/` |
| `navigation/*` | `app/navigation/` |
| `lib/coach*.ts` | `features/coaching/` — **lot 20**, pas 18 |
| `stores/*Store.ts` | `features/*/model/` — **progressif, lot 21** pour `coachingStore` |

### ARCH03 — `App.tsx` orchestrateur géant

Session, online/offline, flush de queue, questionnaire, marketplace, onboarding, intake, workspaces, gardes de rôle, redirections, définition des routes : un seul fichier. Une PR onboarding et une PR router se marchent dessus.

Cible : `app/App.tsx` assemble `router/`, `guards/`, `bootstrap/` (`useSessionBootstrap`, `useOfflineSync`, `useOnboardingState`). **Lot 21a.**

### ARCH04 — Gros fichiers = mini-applications

Ordres de grandeur sur `new-JV` / l’empilement : `coachingStore.ts` ~89 KB (clients, invitations, messages, questionnaires, paramètres, interventions, suivi, photos, IA, marketplace) ; `ClientDetailPage.tsx` ~49 KB ; `workoutStore.ts` ~42 KB ; `ExerciseCard.tsx` ~40 KB ; `coachFleet.ts` ~37 KB ; `ProgramSessionEditor.tsx` ~34 KB ; `Dashboard.tsx` ~32 KB.

`CLAUDE.md` : ne pas découper `coachingStore` dans un simple nettoyage. **Lot 21c** : façade `coachingStore.ts` + modules (`clients`, `messages`, `questionnaires`, `interventions`, `tracking`) pour que les imports existants tiennent.

Gros composants : **lot 21b**, extraire orchestration / fetch, pas un restyle.

### ARCH05 — UI qui parle à Supabase

Certaines pages passent par stores / services ; d’autres interrogent Supabase dans le composant (`Dashboard.tsx` importe le client et requête). Deux modèles « valides » pour un agent.

Convention à écrire en lot **17**, à faire respecter par déplacement (20) puis règle CI (**23**) : pas de `supabase.from()` dans l’UI.

### ARCH06 — Design system à moitié

`tailwind.config.js` a des tokens sémantiques (`page`, `surface`, `ink`, `line`, `primary`, `success`, `warning`, `danger`). Primitives : `Button`, `Card`, `Input`, `Select`, `Modal`, `PageHeader`, `EmptyState`, `ErrorState`, `TabList`, `IconButton`.

Les primitives contournent encore les tokens (`bg-blue-600`, `neutral-*`, `rose-*`). Deux systèmes parallèles : théorique (`bg-surface`, `text-ink`, `bg-primary`) vs réel (`bg-neutral-900`, `border-neutral-800`, `bg-blue-600`).

Cible : les primitives **sont** la source de vérité et n’utilisent que les tokens. Couleurs Tailwind brutes : visualisations rares (graphes). Relie le lot premium **1**. **File : lot 19.**

### ARCH07 — `types.ts` hotspot

`src/lib/types.ts` ~26 KB : comptes, marketplace, coaching, workouts, exercices, programmes, abonnements. Conflits de merge. Transversal → `shared/types` ; le reste → `features/<domaine>/types.ts`. Réexport de transition depuis `lib/types.ts`. **Lot 22.**

### ARCH08 — i18n monolithique

`fr.ts` / `en.ts` ~87–95 KB, importés en bloc. Découper par domaine (`common`, `navigation`, `coaching`, `workout`, `nutrition`, `programs`, `marketplace`). Garder i18next. **Lot 22.**

### ARCH09 — `npm test` liste manuelle

`package.json` → `"test"` = liste de fichiers. Un `foo.test.ts` hors liste n’est jamais lancé. Passer à `**/*.test.ts` (ou équivalent du runner `tsx --test`). Noms historiques (`auditLot2.test.ts`, `uxPremium.test.ts`) : les renommer **progressivement** d’après le comportement protégé, pas d’un coup. **Lot 17.**

Jusqu’au lot 17 : tout nouveau test **doit** être ajouté à la liste `package.json`.

### ARCH10 — Pas de garde-fous d’architecture

ESLint vérifie le code, pas les dépendances entre dossiers. Pas d’alias `@/`.

**Erreur de l’audit source :** il affirme `strict: false` / `noImplicitAny: false`. **`tsconfig.app.json` a déjà `"strict": true`.** Ne pas « passer tout en strict d’un coup » — c’est déjà là. Ne pas ajouter d’un coup `noUncheckedIndexedAccess` / flags extra.

Règles CI (**lot 23**, après que la cible existe) :

- `shared` n’importe jamais `features`
- une feature ne deep-importe pas les internes d’une autre
- `shared/ui` ne connaît ni Supabase ni Zustand
- les composants UI n’appellent pas `supabase.from()`

### ARCH11 — Supabase : ne pas « nettoyer »

`supabase/functions`, `_shared`, `migrations`, `tests`, `cron` : logique. Deux migrations `notify_onboarding_signed_ping` identiques **sont dans le lock**. **Ne pas les supprimer.** Historique appliqué immuable.

### ARCH12 — Contradiction `.env`

`CLAUDE.md` : ne jamais commiter `.env`. `.env.production` **est versionné** (URL + anon key + VAPID **public** — pas `service_role`). Trancher **une** convention : `.env.example` + variables Netlify, **ou** garder des clés **publiques** frontend versionnées en le disant clairement dans `CLAUDE.md`. **Lot 17.** Ne pas y mettre de secrets serveur.

---

## Ce que cet audit ne change pas

- Décisions produit (5 onglets, pas de 6ᵉ, IA jamais auto-apply, billing fermé, vérité des séries, etc.).
- Lots **11–16** (biblio, Ask, types de séries, confort, outillage coach) : **ne pas** y injecter le refactor dossiers.
- `coachingStore` : pas de split opportuniste.
- Migrations appliquées.

La navigation / le chrome restent l’audit UX existant. Cette restructuration **va dans le même sens** (une source de vérité) sans rouvrir les parcours.
