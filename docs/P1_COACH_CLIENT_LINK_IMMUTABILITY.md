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

L’ACL table `authenticated` héritait encore `INSERT`, `DELETE`, `TRUNCATE`,
`REFERENCES`, `TRIGGER` et `MAINTAIN` (pas d’`UPDATE` table-level ; l’`UPDATE`
passait par `attacl`). `anon` avait `ALL`.

## Garanties serveur

- Trigger `protect_coach_client_link_identity` : `id`, `coach_id`, `client_id`
  ne changent jamais, y compris pour le table owner.
- Policy `UPDATE` : uniquement le Coach de la ligne **active**, et uniquement si
  `status` reste `'active'`.
- Allowlist `authenticated` : `REVOKE ALL` puis `GRANT SELECT` et
  `GRANT UPDATE (last_visited_at, last_nudged_at)`. Pas d’`INSERT` / `DELETE` /
  `TRUNCATE` / `REFERENCES` / `TRIGGER` / `MAINTAIN` / `UPDATE` table-level.
  Pas d’`UPDATE` sur `status`, `coach_id`, `client_id`, `id`, `created_at`,
  `updated_at`.
- `updated_at` est un timestamp technique : le Data API Coach n’écrit que
  `last_visited_at` / `last_nudged_at` ; le trigger existant
  `public.update_updated_at` le maintient côté serveur.
- `anon` / `PUBLIC` : aucun privilège table ni colonne.
- Création / fin / réactivation : RPC `SECURITY DEFINER` existantes
  (`activate_coaching_relationship`, `accept_coach_invite`,
  `end_coach_client_link`, `client_end_coach_link`, `close_coach_account`, …).
- Unicité inchangée : un seul Coach actif par athlète
  (`coach_client_one_active_coach`) ; une seule ligne par paire
  (`coach_client_links_pair_idx`).

Le workspace UI n’accorde rien. `is_coach_of` continue de lire uniquement une
ligne `active` dont `coach_id = auth.uid()`.

ACL finale attendue après application :

```text
relacl authenticated = SELECT
relacl anon / PUBLIC = (aucun)
attacl authenticated UPDATE = last_visited_at, last_nudged_at
postgres / service_role = ALL (inchangé)
```

## Hors scope

Pas de nouveau moteur d’application. Pas de changement Vision. Pas de P3.
