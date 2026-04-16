# Prometheus Tracker

> A full-stack fitness tracking PWA — workouts, nutrition, weight, barcode scanner, AI food identification, streaks, and more.

**Live:** [tracker.prometheus-fit.com](https://tracker.prometheus-fit.com)

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
| Payments | Stripe | — |
| PWA | Manual Service Worker | — |

---

## Features

- **Workout tracking** — log sessions, exercises, sets, reps, weight; view progress per exercise
- **Nutrition journal** — log meals by day, track macros (protein, carbs, fat, calories)
- **Barcode scanner** — detects barcodes via camera, looks up local DB then Open Food Facts
- **AI food identification** — take up to 3 photos (front, back, nutrition label) for AI analysis
- **Weight tracking** — log measurements, view trend chart
- **Routines** — save and reuse workout templates
- **Calendar** — view activity per day (workouts, nutrition entries, weight)
- **Stats** — analytics and trends across all categories
- **Streaks** — daily activity streak tracker
- **Recipes** — save and reuse meal recipes
- **Premium** — Stripe-powered subscription (monthly / annual)
- **PWA** — installable, offline-capable, push notifications
- **i18n** — English and French

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
    ├── analyze-product/       # AI product analysis (OpenAI)
    ├── verify-exercise/       # AI exercise verification
    ├── create-checkout-session/
    ├── create-portal-session/
    ├── stripe-webhook/
    ├── delete-account/
    └── send-daily-reminders/  # Web Push notifications via VAPID
```

---

## Getting Started

### Prerequisites

- Node.js 20+
- A [Supabase](https://supabase.com) project
- (Optional) Stripe account for payments
- (Optional) OpenAI API key for AI features

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

Non-secret build-time variables are committed in `.env.production` and picked up by Vite automatically. Sensitive server-side secrets (Stripe, OpenAI, VAPID private key) must be set in **Supabase Dashboard → Edge Functions → Secrets**.

### Required Supabase Edge Function secrets

| Secret | Description |
|---|---|
| `OPENAI_API_KEY` | OpenAI API key (AI food/exercise analysis) |
| `STRIPE_SECRET_KEY` | Stripe secret key |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret |
| `STRIPE_PREMIUM_MONTHLY_PRICE_ID` | Stripe monthly price ID |
| `STRIPE_PREMIUM_ANNUAL_PRICE_ID` | Stripe annual price ID |
| `VAPID_PUBLIC_KEY` | VAPID public key (Web Push) |
| `VAPID_PRIVATE_KEY` | VAPID private key (Web Push) |
| `VAPID_SUBJECT` | `mailto:you@example.com` |
| `SITE_URL` | `https://tracker.prometheus-fit.com` |

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
