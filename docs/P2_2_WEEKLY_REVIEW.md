# P2.2 — Revue hebdomadaire universelle

## Audit

`solo_weekly_reviews` est **une** décision nutrition Solo par couple `(user_id, week_start)`
après un tap humain. Ce n’est pas la boucle système.

`triage_coach_fleet` + `coach_interventions` est une inbox Coach (`pending` / `sent` /
`kept` / `dismissed`). Ce n’est pas une revue partagée avec le Solo, et ça n’écrit pas
`athlete_signals`.

Le moteur commun n’est donc pas redondant. Les deux chemins existants restent : carte
nutrition Solo et drafts fleet. Ils **appellent** `runAthleteWeeklyReview`.

## Contrat

```text
agrégats autorisés
→ qualité des données (insufficient | sparse | adequate)
→ créer / rafraîchir / clôturer athlete_signals
→ confiance qualitative low → medium → high
→ wait | request_info | propose | close
→ résumé pour l’autorité humaine
```

- Autorité : athlète si Solo ; Coach si relation `coach_client_links.active`.
- Une semaine sans modification (`wait`) est un résultat **valide** et persisté.
- Un signal faible (confiance `low`) attend ; il ne propose pas.
- Module de suivi désactivé : aucun jugement dans ce domaine.
- Profil protégé : jamais `propose`.
- Écritures : RPC `save_athlete_weekly_review` seulement (REVOKE INSERT/UPDATE/DELETE).
- La RPC applique les actions signaux via les RPC P2.1 ; elle n’écrit pas programmes,
  cibles, logs.
- Agrégats uniquement — les logs bruts sont rejetés (`raw_logs_forbidden`).
- Une ligne par `(athlete_id, week_start)` ISO lundi.

## Hors scope

P2.3 journal des propositions et décisions humaines (`accepted` / `modifié` / `refusé`).
P2.4 écran « Ce que Prometheus surveille ». Stripe / P6. Pas d’application production.

## Livraison

PR [#190](https://github.com/Jayvy2002/prometheus-tracker-app/pull/190) — **non mergée**.
Candidate `20260918194013_athlete_weekly_reviews` dans `migrations.pending.json`.
Le lock production reste à 116 versions.
