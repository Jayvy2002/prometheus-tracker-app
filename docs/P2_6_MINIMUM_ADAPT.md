# P2.6 — Adapter le minimum nécessaire

## Slice (cette PR)

Vision 8.7 : après un **accept** humain P2.5 sur une proposition à brouillon
calorique **complet**, appliquer **uniquement** ce brouillon depuis
« Ce que Prometheus surveille ».

Le brouillon est déjà le plus petit pas du builder canonique
(`WEEKLY_SMALL` / décalage glucides à calories constantes). Cette PR ne
recalcule pas un second draft. Elle n’écrit pas un programme.

Aucune auto-application au tap Accepter. Un refus ou une modification ne
déclenche pas d’écriture. Un Coaché n’applique pas ses propres cibles.

## Audit

P2.5 journalise `accepted` / `modified` / `refused` avec `applied_effect = {}`.
Les chemins d’effet historiques restent :

- Solo `commit_solo_weekly_review_decision` (carte ISO) ;
- Coach `apply_intervention` (inbox / programme / message) ;
- Coach `coach_set_client_nutrition_targets` (cibles client).

Le panneau ne devient pas un troisième moteur : `apply_athlete_watch_minimum`
réutilise l’écriture `user_profiles` de `commit_solo` pour le Solo, et
`coach_set_client_nutrition_targets` pour le Coach. Pas d’appel à
`commit_solo_weekly_review_decision` ni `apply_intervention`. Pas de nouvelle
table. Pas de 14ᵉ Edge Function.

## Contrat

```text
journal P2.5 accepted + brouillon P/C/F complet
+ humain Solo (pas Coaché) ou Coach actif
→ écrit daily_calorie_target / protein / carbs / fat
→ journal kind = watch_minimum_apply, applied_effect rempli
→ token = journal id + proposal exacte
→ revue plus récente → stale_proposal
→ relance / draft incomplet / modified / refused → pas d’écriture
→ signal reste ouvert
→ idempotent sur (signal, semaine, effet)
→ mesures sources et programmes inchangés
```

- Permissions : `canApplyAthleteWatchMinimum` = `canDecideAthleteWatchProposal`.
  Workspace UI n’accorde rien.
- Succès UI seulement après persistance.
- `isWatchProposalSettled` reste vrai (source `prometheus_watch`, décision
  `accepted`).

## Hors scope

- appliquer un programme ou un patch d’exercice ;
- auto-appliquer au tap Accepter ;
- réécrire une donnée source ;
- P2.7 et P3.

## Livraison

Vertical slice dans une PR draft vers `new-JV`. Ne pas merger sans feu vert.
Ne pas enchaîner P2.7. Candidat `20260919181919_watch_minimum_apply`
(`migrations.pending.json`) : le lock production reste à **124** jusqu’à
application autorisée après merge.
