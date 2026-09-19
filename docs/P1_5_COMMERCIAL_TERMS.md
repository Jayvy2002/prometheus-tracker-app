# P1.5 — Règles commerciales constantes

## Contrat

Une seule définition métier pour chaque durée commerciale actuelle :

- essai Solo après perte du Coach = **14 jours** ;
- grâce Coach en cas de défaut de paiement = **7 jours** ;
- prix, quotas Coach et montants Stripe = **non décidés** (ne pas les inventer).

Le tampon `user_profiles.solo_trial_ends_at` n’est jamais raccourci (`COALESCE`).
**L’essai Solo est unique à vie :** un deuxième départ de Coach conserve la date
déjà tamponnée, **y compris si elle est expirée**. Ce n’est pas un renouvellement
automatique d’une période de transition. Ne pas remplacer `COALESCE` par une
prolongation.

Le mur de facturation, les entitlements et Stripe restent **P6**. Aucune colonne
`coach_grace_ends_at` dans cette sous-tâche.

## Source unique

TypeScript : `src/lib/commercialTerms.ts`

```text
SOLO_TRIAL_DAYS = 14
COACH_GRACE_DAYS = 7
COMMERCIAL_PRICES.status = 'undecided'
```

`src/lib/soloTransition.ts` réexporte `SOLO_TRIAL_DAYS`. La bannière de départ
lit l’ISO tamponné, pas une durée locale.

SQL (migration append-only candidate `20260918182954_commercial_durations`) :

- `public.solo_trial_interval()` → `interval '14 days'`
- `public.coach_grace_interval()` → `interval '7 days'`
- `transition_client_to_solo` : `COALESCE(solo_trial_ends_at, now() + public.solo_trial_interval())`

Les deux helpers sont `IMMUTABLE`, `REVOKE` de `PUBLIC` / `anon` / `authenticated`,
`GRANT EXECUTE` à `service_role` uniquement. `transition_client_to_solo` reste interne
(service_role). Les fichiers historiques qui tamponnent 30 jours ne sont pas réécrits.

## Hors scope

P6 entitlements / mur de paiement. Stripe. Prix inventés. Messagerie prospect (P4.3).
P2 cerveau Prometheus.

## Livraison

PR [#190](https://github.com/Jayvy2002/prometheus-tracker-app/pull/190) — **non mergée**.
Candidate déclarée dans `migrations.pending.json`. Le lock production reste à 116 versions
(`20260918130232_marketplace_athlete_confirm`) tant que la migration n’est pas appliquée.
