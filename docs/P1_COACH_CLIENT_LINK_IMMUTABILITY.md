# P1 — Immutabilité de `coach_client_links`

> Contrat durable. L’identité d’une relation Coach/athlète n’est pas une donnée
> éditable. Les transitions passent par les RPC métier, jamais par le Data API.

## Finding

En production (19 septembre 2026), la policy `UPDATE` « Coaches can end their links »
était :

```text
USING      coach_id = auth.uid() AND status = 'active'
WITH CHECK coach_id = auth.uid()
```

Les grants colonne `authenticated` bloquaient déjà `client_id` / `coach_id`, mais
pas `status`. La policy ne gelait pas l’identité : un `GRANT UPDATE` table-level
aurait permis à un Coach actif de B de réécrire la ligne vers C et de devenir
`is_coach_of(C)` sans confirmation athlète.

`status` restait mutable : un `UPDATE … SET status = 'ended'` contournait
`end_coach_client_link` / `client_end_coach_link`.

## Garanties serveur

- Trigger `protect_coach_client_link_identity` : `id`, `coach_id`, `client_id`
  ne changent jamais, y compris pour le table owner.
- Policy `UPDATE` : uniquement le Coach de la ligne **active**, et uniquement si
  `status` reste `'active'`.
- `authenticated` : `SELECT` + `UPDATE (last_visited_at, last_nudged_at, updated_at)`.
  Pas d’`INSERT` / `DELETE` / `TRUNCATE` / `UPDATE status`.
- `anon` / `PUBLIC` : aucun privilège table.
- Création / fin / réactivation : RPC `SECURITY DEFINER` existantes
  (`activate_coaching_relationship`, `accept_coach_invite`,
  `end_coach_client_link`, `client_end_coach_link`, `close_coach_account`, …).
- Unicité inchangée : un seul Coach actif par athlète
  (`coach_client_one_active_coach`) ; une seule ligne par paire
  (`coach_client_links_pair_idx`).

Le workspace UI n’accorde rien. `is_coach_of` continue de lire uniquement une
ligne `active` dont `coach_id = auth.uid()`.

## Hors scope

Pas de nouveau moteur d’application. Pas de changement Vision. Pas de P3.
