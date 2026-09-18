# P2.3 — Journal des propositions et décisions humaines

## Audit

`solo_weekly_reviews` est **une** décision nutrition Solo par couple `(user_id, week_start)`
(`accepted` / `kept` / `dismissed`). Pas de `modified`, pas de raison humaine facultative,
pas d’effet réellement appliqué, pas de consommation par la revue universelle.

`coach_interventions` est une inbox Coach (`pending` / `sent` / `kept` / `dismissed`).
Ce n’est pas un journal append-only partagé avec le Solo.

Une table dédiée n’est donc pas redondante. Les deux chemins existants **restent**
(carte nutrition Solo, drafts fleet) et **enregistrent** une ligne après le tap humain
déjà réussi. L’échec du journal ne rollback pas l’écriture humaine (candidate absente
en production).

## Contrat

```text
proposition + pourquoi + données utilisées
→ qui a décidé (athlète Solo / Coach actif)
→ accepted | modified | refused | ignored
→ raison humaine facultative
→ snapshot de l’effet déjà appliqué (jamais écrit par cette RPC)
→ la revue suivante lit ce contexte
```

- Écritures : RPC `record_athlete_decision` seulement (REVOKE INSERT/UPDATE/DELETE).
- Append-only : pas de RPC UPDATE.
- Lecture : athlète propriétaire ou Coach avec relation **active**.
- `refused` / `ignored` exigent `applied_effect = {}`.
- Agrégats uniquement — les logs bruts sont rejetés (`raw_logs_forbidden`).
- Un refus / ignoré du même `(domain, type)` empêche `propose` tant que les preuves
  n’ont pas bougé (kcal ±150, séances ±2, jours nutrition +3, delta poids ±0.4 kg).
- Le signal continue d’être upserté ; seule la décision `propose` est retenue.
- Mapping Solo : `accepted` → accepted, `kept` → ignored, `dismissed` → refused.
- Mapping intervention : `sent` → accepted (payload édité → modified), `kept` → ignored,
  `dismissed` → refused.

## Hors scope

P2.4 écran « Ce que Prometheus surveille ». Stripe / P6. Pas d’application production.
Ne pas faire évoluer `solo_weekly_reviews` ni `coach_interventions` en journal.

## Livraison

PR [#190](https://github.com/Jayvy2002/prometheus-tracker-app/pull/190) — **non mergée**.
Candidate `20260918201237_athlete_decision_log` dans `migrations.pending.json`.
Le lock production reste à 116 versions.
