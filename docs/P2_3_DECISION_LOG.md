# P2.3 — Journal des propositions et décisions humaines

## Audit

`solo_weekly_reviews` est **une** décision nutrition Solo par couple `(user_id, week_start)`
(`accepted` / `kept` / `dismissed`). Pas de `modified`, pas de raison humaine facultative,
pas d’effet réellement appliqué, pas de consommation par la revue universelle.

`coach_interventions` est une inbox Coach (`pending` / `sent` / `kept` / `dismissed`).
Ce n’est pas un journal append-only partagé avec le Solo.

Une table dédiée n’est donc pas redondante. Les deux chemins existants **restent**
(carte nutrition Solo, drafts fleet) et **enregistrent** une ligne après le tap humain.

Solo : `commit_solo_weekly_review_decision` écrit cibles (si accepté), carte ISO
et journal dans la même transaction ; la clé d’idempotence est verrouillée avant
toute mutation. Une reprise consulte aussi l’intention outbox sous ce verrou :
si elle existe, seules les écritures de journal manquantes sont terminées.
Coach : `apply_intervention` journalise dans la même TX (snapshot
initial vs effets métier, sans identifiants de routage, **preuves** dans
`data_used`) ; un trigger reprend les UPDATE de statut. File
`athlete_decision_outbox` unique par `(athlète, clé)` ; collision inter-comptes
refusée. Le contenu d’une intention est immuable (`idempotency_conflict` si le
contenu métier diffère) ; drain et rejeu n’utilisent que le payload stocké.
Validation à l’enqueue, backoff, échec permanent. `drain_athlete_decision_outbox`
rejoue sans doublon et conserve l’auteur stocké (pas l’exécuteur). Drain, enqueue
et Solo prennent le verrou advisory **avant** la ligne d’outbox, puis le journal.
Le drain ordonne par `(next_attempt_at, created_at, id)` et saute une clé occupée
(`pg_try_advisory_xact_lock`). Une reprise sur un journal existant compare
l’intention complète (`why`, `data_used`, `human_reason`, `source` inclus).
Table/RPC absente en production → fail-open.

La carte Solo et le round fleet **lisent** la dernière décision par
`(athlète, domain, type)`, pas un plafond global de lignes. Un refus n’est levé
que si les **preuves pertinentes** de cette proposition ont bougé. Mapping et
comparaison vivent dans `supabase/functions/_shared/proposalMemory.ts`.

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
- Un refus / ignoré du même `(domain, type)` sémantique empêche `propose`
  tant que les preuves **de cette proposition** n’ont pas bougé
  (`program_adjustment` ≠ `missed_sessions` ; un kcal nutrition ne lève pas
  un refus d’entraînement).
- Lecture : `list_latest_athlete_decisions` (`DISTINCT ON` par clé), pas
  `limit 50` / `limit 500` comme unique source de vérité.
- Mapping Solo : `accepted` → accepted, `kept` → ignored, `dismissed` → refused.
- Mapping intervention : `sent` → accepted ou modified selon le diff métier ;
  `kept` sans effet → ignored ; `kept` avec note/effet réel → accepted/modified ;
  `dismissed` → refused.

## Hors scope

P2.4 écran « Ce que Prometheus surveille ». Stripe / P6. Pas d’application production.
Ne pas faire évoluer `solo_weekly_reviews` ni `coach_interventions` en journal.

## Livraison

PR [#190](https://github.com/Jayvy2002/prometheus-tracker-app/pull/190) — **non mergée**.
Candidate `20260918201237_athlete_decision_log`,
`20260918224935_athlete_review_integrity` et
`20260918232507_athlete_decision_durability` dans `migrations.pending.json`.
Le lock production reste à 116 versions.
