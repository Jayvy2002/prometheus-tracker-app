# Prometheus

> SaaS fitness : une plateforme pour **tous les coachs** (kinésiologie, musculation, crossfit, nutrition…) **et** pour les **athlètes solo**, avec un copilote IA qui prépare et un humain qui décide.

**Vision produit, rôles, chantiers :** [`docs/VISION.md`](docs/VISION.md) — à lire avant de toucher au produit.
**Règles pour les agents / devs :** [`CLAUDE.md`](CLAUDE.md).

`new-JV` est le produit. `main` (live [tracker.prometheus-fit.com](https://tracker.prometheus-fit.com)) est l'ancien code.

---

## Les trois rôles

| | Coach | Client coaché | Solo |
|---|---|---|---|
| Entrée | Inscription libre | Lien d'invitation de son coach | Inscription libre |
| Accueil | Command Center + File du jour | Séance du jour, messages, photos | Tracker complet |
| Kcal / macros | Décide pour ses clients | Pilotées par le coach | Ajustables par lui |
| Copilote IA | `coach-agent` + tournée `coach-fleet-round` | Non (son coach en a un) | Oui (en construction) |

Un solo peut ajouter un coach via le lien de ce coach ; le coach voit tout l'historique. Lien coupé → il redevient solo.

Gratuit pendant la construction. Stripe est en quarantaine (410).

---

## Tech Stack

| Layer | Technology | Version |
|---|---|---|
| Language | TypeScript | 5.5 |
| UI | React | 18.3 |
| Router | React Router | 7.13 |
| State | Zustand | 5.0 |
| Styling | Tailwind CSS | 3.4 |
| Build | Vite | 5.4 |
| Backend | Supabase (PostgreSQL + Auth + Storage + Realtime) | 2.57 |
| Edge Functions | Deno | — |
| i18n | i18next (fr default, en) | 26 |
| Charts | Recharts | 3.8 |
| PWA | Manual Service Worker | — |

---

## Features

**Coach**
- **Aujourd'hui** — Command Center, File du jour, Relancer, tournée (`coach-fleet-round`)
- **Clients** — roster, invitations, fiche 360 (vue d'ensemble, entraînement, progression, check-ins, santé, notes), setup des variables suivies et des cibles
- **Programmes** — bibliothèque, éditeur, assignation, brouillons IA
- **Messages** — fil par client + brouillons à envoyer
- **Prometheus** — Ask in-app (`coach-agent`) qui écrit des brouillons ; rien ne s'applique tout seul

**Client coaché**
- Séance du jour en premier, modules allumés par le coach, cibles pilotées par le coach, check-ins 0–10, messages, photos de progression
- Questionnaire d'accueil (27 questions, template des coachs)

**Solo**
- Workouts (sets avancés, superset, minuteur), nutrition (journal, scanner barcode + IA, recettes, eau), poids, stats, calendrier, routines, streaks
- Calcul kcal / macros à l'onboarding, ajustables ; copilote hebdo en construction

---

## Project Structure

```
src/
├── App.tsx                    # Routes + gardes de rôle
├── components/
│   ├── auth/                  # AuthPage (coach / client invité / solo)
│   ├── onboarding/            # OnboardingFlow (tracker), KinesiologyIntakeFlow (27 q)
│   ├── coaching/              # Console coach + pages client (messages, photos)
│   ├── programs/              # Programmes coach / Mon programme
│   ├── dashboard/ checkin/ workout/ nutrition/ scanner/ weight/ routines/ stats/ calendar/ profile/ layout/ ui/
├── stores/                    # Zustand (coachingStore, programStore, checkinStore, workout, nutrition…)
├── lib/                       # Types, utils, logique pure (coach*.ts, client*.ts, kinesiologyIntake.ts) + tests
├── i18n/locales/{fr,en}.ts
public/                        # sw.js, manifest.json
supabase/
├── migrations/                # Source de vérité DB
├── cron/                      # Fleet nocturne, rappels push
└── functions/                 # coach-agent, coach-fleet-round, notify-onboarding-complete,
                               # analyze-product, verify-exercise, send-daily-reminders, delete-account
                               # 410 : ask-second, suggest-client-plan, create-checkout-session,
                               #       create-portal-session, stripe-webhook
```

---

## Getting Started

### Prerequisites

- Node.js 20+
- Un projet [Supabase](https://supabase.com)
- Une clé OpenAI (`OPENAI_API_KEY`) pour les brouillons IA. **Ne pas créer de Grok Bots** — la revue hebdo est `coach-fleet-round`, dans l'app.

### 1. Clone & install

```bash
git clone https://github.com/Jayvy2002/prometheus-tracker-app.git
cd prometheus-tracker-app
npm install
```

### 2. Environment variables

`.env` à la racine :

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_VAPID_PUBLIC_KEY=your-vapid-public-key   # optionnel, push
```

### 3. Database

```bash
supabase db push
```

Ou appliquer `supabase/migrations/` dans l'ordre depuis l'éditeur SQL. Les crons de `supabase/cron/` s'appliquent à la main (la tournée fleet est aussi dans une migration).

### 4. Run

```bash
npm run dev       # http://localhost:5173
npm run build     # dist/
npm run preview
npm run typecheck
npm run lint
npm test          # src/lib/*.test.ts
```

---

## Deployment (Netlify)

`netlify.toml` contient build + redirects SPA. Les variables non secrètes sont dans `.env.production`. Les secrets serveur vont dans **Supabase Dashboard → Edge Functions → Secrets**.

### Edge Function secrets

| Secret | Description |
|---|---|
| `OPENAI_API_KEY` | `coach-agent`, `analyze-product`, `verify-exercise`, fleet (`program_adjustment` seulement) |
| `FLEET_CRON_SECRET` | Auth du cron nocturne `coach-fleet-round` |
| `NOTIFY_SECRET` | HMAC de `notify-onboarding-complete` |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` | Web Push |
| `SITE_URL` | Origine pour CORS |

Ne pas configurer `STRIPE_*` ni `GROK_BOT_WEBHOOK_URL` : les functions Stripe répondent 410 (gratuit pendant la construction) et Second est retiré.

```bash
npx web-push generate-vapid-keys
```

---

## Security

- **RLS** sur toutes les tables ; RPC `SECURITY DEFINER` étroits pour les écritures coach
- **Service role key** côté edge uniquement
- Schéma versionné dans `supabase/migrations/`
- Push chiffré de bout en bout (AES-128-GCM, RFC 8188)

---

## License

Private — all rights reserved.
