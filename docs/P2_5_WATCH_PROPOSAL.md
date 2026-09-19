# P2.5 — Décision humaine sur la proposition courante

## Slice (cette PR, avec P2.4)

Vision 8.6 : accepter / modifier / refuser **la proposition courante** depuis
« Ce que Prometheus surveille ».

Aucun troisième moteur d’apply. Aucune auto-application. Le signal reste
ouvert. Les mesures sources (nutrition, séances, pesées, programmes, cibles)
ne sont pas réécrites.

La correction de contexte (P2.4, `corrected`) reste un autre acte : elle clôt
le signal. Un refus de proposition n’est pas une correction.

## Audit

P2.1–P2.4 fournissent déjà :

- la proposition courante (`reviewProposesFor` + signal `open` + non
  supprimée) ;
- le journal `athlete_decision_log` (`accepted` | `modified` | `refused` |
  `ignored` | `corrected`) ;
- Solo `commit_solo_weekly_review_decision` (effet calorie, carte ISO) ;
- Coach `apply_intervention` (effet programme / message).

Le trou : le panneau affichait une proposition générique sans objet
jugé, et sans décision humaine. Brancher le panneau sur Solo/Coach apply
aurait fait hériter à un signal B le brouillon de A — le même trou que
P2.4 lecture.

D’où une RPC `decide_athlete_watch_proposal` qui **ne fait que journaliser**
via `queue_and_record_athlete_decision`, pour le `(domaine, type)` exact de
la revue **et** le snapshot de proposition porté par le `signal_action`.
Les apply durables restent sur leurs surfaces. Sans snapshot concret,
le panneau n’affiche pas Accepter / Modifier / Refuser.

## Contrat

```text
proposition courante = revue.decision propose
  + upsert open medium/high pour CE (domaine, type)
  + objet proposal concret sur ce signal_action (kind + action Solo/fleet)
humain Solo (pas Coaché) ou Coach actif du dossier
→ accepted | modified | refused
→ motif obligatoire pour modified / refused (1–500)
→ applied_effect = {}
→ journal.proposal = snapshot jugé (action, flag, draft calories le cas échéant)
→ data_used = evidence_for du signal_action de la revue
→ fingerprint courant ≠ revue → stale_proposal
→ signal inchangé (reste open)
→ idempotent sur la même semaine + le même payload
  (clé serveur watch-decide:{signal}:{decision}:{week_start})
→ même décision + payload différent → idempotency_conflict
→ une autre semaine propose → nouveau journal, pas collision
→ une autre décision la même semaine → already_decided
→ custom B ouvert sans upsert de revue → no_current_proposal
→ revue wait / confiance low / signal clos / pas de snapshot → no_current_proposal
```

- `isProposalSuppressed` (refused / ignored / corrected) inchangé pour Solo
  calorie et inbox Coach.
- `isWatchProposalSettled` (accepted / modified **et**
  `source = prometheus_watch`) empêche la revue suivante de `propose` tant
  que les preuves n’ont pas bougé. L’inbox fleet ne réinsère pas non plus
  la même carte.
- La carte Solo calorie reste une surface d’apply distincte : un accept
  watch n’écrit pas les cibles, et n’est pas un `commit_solo`.
- Affichage : pas de proposition courante si la dernière décision humaine
  (y compris Solo `accepted`) n’a pas vu les preuves bouger.
- Permissions : `canDecideAthleteWatchProposal` = même autorité que
  `canCorrectAthleteWatchContext`. Workspace UI n’accorde rien.
- Le panneau n’appelle pas `commit_solo_weekly_review_decision`,
  `apply_intervention`, `upsert_athlete_signal`, `resolve_athlete_signal`
  ni `record_athlete_decision`.

## Hors scope (P2.6 et plus tard)

- appliquer des cibles calories ou un programme depuis ce panneau ;
- réécrire une donnée source ;
- P3 et suivants.

## Livraison

Vertical slice dans la même PR draft que P2.4 vers `new-JV`. Ne pas merger
sans feu vert. Ne pas enchaîner P2.6. Candidats
`20260919134856_watch_context_correction` et
`20260919141146_watch_proposal_decision` (`migrations.pending.json`) : le
lock production reste à 122 jusqu’à application autorisée après merge.
