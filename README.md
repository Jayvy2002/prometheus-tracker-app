# Prometheus — plateforme de coaching

> Coaching boosté IA pour Jayvy (kinésiologue, Montréal). **new-JV** est le produit. Live `tracker.prometheus-fit.com` (`main`) est l’ancien tracker solo — ne pas y coller cette branche.

**North star :** l’agent in-app `coach-agent` prépare un brouillon → le coach édite / envoie → rien ne s’applique tout seul. Relancer avant les cibles. Pas de CRM. Pas d’éditeur calories. Pas de Premium.

**Audit produit (22 findings) :** [`docs/AUDIT_PRODUIT_2026-08-31.md`](docs/AUDIT_PRODUIT_2026-08-31.md)

**Live:** [tracker.prometheus-fit.com](https://tracker.prometheus-fit.com) — ancien produit. Cette branche n’est pas `main`.

---

## Tech Stack

| Layer | Technology | Version |
|---|---|---|
| Language | TypeScript | 5.5 |
| UI Framework | React | 18.3 |
| Router | React Router | 7.13 |
| State | Zustand | 5.0 |
| Styling | Tailwind CSS | 3.4 |
| Build | Vite | 5.4 |
| Backend / DB | Supabase (PostgreSQL + Auth + Storage) | 2.57 |
| Edge Functions | Deno (Supabase Functions) | — |
| Charts | Recharts | 3.8 |
| Icons | Lucide React | 0.344 |
| PWA | Manual Service Worker | — |

---

## Features

Boucle coach (new-JV) :

- **Aujourd’hui** — File du jour, Relancer, tournée SQL (`coach-fleet-round`)
- **Client 360** — 6 onglets spec (Vue d’ensemble, Entraînement, Progression, Check-ins, Santé, Notes)
- **Messages** — fil Relancer + brouillons à envoyer (rien ne s’auto-applique)
- **Prometheus** — Ask in-app (`coach-agent`) qui écrit des brouillons
- **Athlète coaché** — séance d’abord, modules allumés par le coach, cibles kcal envoyées par le coach

Le tracker solo (workouts, nutrition, scanner) reste pour un compte **sans** coach. Un athlète lié ne s’auto-sert pas les kcal.

---

## Project Structure

```
src/
├── App.tsx                    # Root component + all routes
├── main.tsx                   # Entry point
├── components/                # React components by domain
│   ├── layout/                # AppLayout, BottomNav, SideNav, FAB
│   ├── ui/                    # Button, Input, Card, Modal, Toast…
│   ├── auth/                  # Login / signup
│   ├── dashboard/             # Dashboard + widgets
│   ├── workout/               # Workout logging + exercise picker
│   ├── nutrition/             # Food journal + water tracker
│   ├── scanner/               # Barcode scanner + AI identification
│   ├── weight/                # Weight measurements
│   ├── routines/              # Workout templates
│   ├── stats/                 # Analytics
│   ├── calendar/              # Calendar view
│   └── profile/               # Profile + settings + notifications
├── stores/                    # Zustand stores (one per domain)
├── i18n/                      # English / French translations
├── lib/
│   ├── supabase.ts            # Supabase client
│   ├── types.ts               # All TypeScript interfaces
│   ├── utils.ts               # BMR, TDEE, unit conversions…
│   └── notifications.ts       # Web Push / VAPID
public/
├── sw.js                      # Service Worker
└── manifest.json              # PWA manifest
supabase/
├── migrations/                # SQL migrations (source of truth)
└── functions/                 # Deno Edge Functions
    ├── analyze-product/       # Food miss/photo → OpenAI in-app
    ├── verify-exercise/       # Library miss → OpenAI in-app
    ├── coach-agent/           # Coach Ask + programme IA (OpenAI sync, drafts only)
    ├── ask-second/            # Retired 410 — use coach-agent
    ├── coach-fleet-round/     # Weekly SQL triage of every active client + drafts
    ├── notify-onboarding-complete/ # HMAC then in-app onboarding_plan draft
    ├── delete-account/
    └── send-daily-reminders/  # Web Push notifications via VAPID
    # Quarantined (410, do not call, do not build Premium):
    # create-checkout-session, create-portal-session, stripe-webhook
```

---

## Getting Started

### Prerequisites

- Node.js 20+
- A [Supabase](https://supabase.com) project
- OpenAI API key on the coaching copy for in-app drafts (`OPENAI_API_KEY`). **Do not create Grok Bots** (per coach or per client) — weekly review is `coach-fleet-round` in the app.

### 1. Clone & install

```bash
git clone https://github.com/Jayvy2002/prometheus-tracker-app.git
cd prometheus-tracker-app
npm install
```

### 2. Environment variables

Create a `.env` file at the project root:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_VAPID_PUBLIC_KEY=your-vapid-public-key   # optional, for push notifications
```

### 3. Database

Run all migrations in order against your Supabase project:

```bash
# Via Supabase CLI
supabase db push
```

Or apply them manually in the SQL editor from `supabase/migrations/`.

### 4. Run

```bash
npm run dev       # Development server (http://localhost:5173)
npm run build     # Production build → dist/
npm run preview   # Preview the production build locally
npm run typecheck # TypeScript check (no emit)
npm run lint      # ESLint
```

---

## Deployment (Netlify)

The repo includes `netlify.toml` with build settings and SPA redirects pre-configured.

Connect the GitHub repo in Netlify → it will auto-deploy on every push to `main`.

Non-secret build-time variables are committed in `.env.production` and picked up by Vite automatically. Sensitive server-side secrets (OpenAI, VAPID private key) must be set in **Supabase Dashboard → Edge Functions → Secrets**.

### Architecture lock (2026-08-29) — weekly coach review

Do **not** create Grok Bots (one per coach or per client). Second was too slow; that will not scale.

Weekly / on-demand review is **in the app**:
1. `triage_coach_fleet` — cheap SQL of **every** active linked client (14-day aggregates, not raw logs).
2. Data-driven Relancer / complete kcal+P/C/F. ISSN is the starting formula only. Never auto-write cibles.
3. LLM **only** when there is a plan/program proposal the formulas do not write.
4. Writes `coach_interventions` drafts only. The coach accepts / edits / sends. Never auto-applies. Never POSTs GROK_BOT_WEBHOOK_URL. Do not set `GROK_BOT_WEBHOOK_URL`.

Cron: `invoke_coach_fleet_round` → `coach-fleet-round`. Ask + « Créer un programme IA » go through `coach-agent` (sync OpenAI), not a bot.

### Required Supabase Edge Function secrets

| Secret | Description |
|---|---|
| `OPENAI_API_KEY` | In-app OpenAI for `coach-agent`, `analyze-product`, `verify-exercise`. Fleet uses it only for `program_adjustment`. |
| `FLEET_CRON_SECRET` | Nightly auth for `coach-fleet-round`. No Grok fallback. Do not set `GROK_BOT_WEBHOOK_URL`. |
| `NOTIFY_SECRET` | HMAC for `notify-onboarding-complete` (optional fallback `GROK_BOT_WEBHOOK_SECRET` on that function only — not a Grok Bot ping). |
| `VAPID_PUBLIC_KEY` | VAPID public key (Web Push) |
| `VAPID_PRIVATE_KEY` | VAPID private key (Web Push) |
| `VAPID_SUBJECT` | `mailto:you@example.com` |
| `SITE_URL` | Site origin for CORS |

Stripe functions (`create-checkout-session`, `create-portal-session`, `stripe-webhook`) return **410**. Do not set `STRIPE_*`. Do not build Premium.

Generate VAPID keys with:

```bash
npx web-push generate-vapid-keys
```

---

## Security

- **RLS enabled** on all Supabase tables — users can only access their own data
- **Service role key** is used server-side only (Edge Functions), never exposed to the client
- All schema changes go through versioned SQL migrations in `supabase/migrations/`
- Push notification payloads are encrypted end-to-end (AES-128-GCM, RFC 8188)

---

## License

Private — all rights reserved.
