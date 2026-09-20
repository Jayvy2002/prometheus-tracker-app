# P3 hardening — corrections de l’audit transversal

> Corrections obligatoires après l’audit P3.1 × P3.2 × P3.3.
> Ce n’est **pas** un P3.4 officiel de la roadmap. **Pas de P4.**

Candidate : `20260920014500_p3_hardening` (pending jusqu’au merge + apply live).
Ne pas restamper `20260919233853`. Un seul logger : `start_workout_from_template`.

## Exécution

```text
phase active (horloge version)
→ séances de cette phase seulement
→ prochaine séance (fixed_days | in_order)
```

`resolveClientGymCard` / `resolveAssignmentGymCard` filtrent d’abord la phase.
Le logger refuse un `program_day_id` hors phase courante (`program_day_not_current_phase`).

Ancre : `programs.phase_anchor_on` à l’activation (date civile planifiée si c’est
une version `scheduled`, sinon date civile du propriétaire). Sinon `assignment.start_date`.

## Weekdays multi-phase

Uniques partielles :

- `(program_id, weekday)` si `phase_id IS NULL` (legacy)
- `(program_id, phase_id, weekday)` si phase renseignée

Même lundi en Accumulation / Intensification / Deload, prescriptions distinctes.
`program_days.phase_id` est `ON DELETE CASCADE` : retirer une phase ne fait plus
`SET NULL` (ce qui violait l’unique weekday legacy).

## Logger

Si `program_day_id` est fourni, la prescription vient de `program_day_exercises`.
`p_exercises` client est ignoré. Off-plan (`program_day_id` null) reste libre.
`start_workout_from_template` est `SECURITY DEFINER` pour appeler les helpers
civils/phase internes, non accordés à `authenticated`.

## Versions

- Validateur canonique `validate_program_graph_payload` avant save live, save version, schedule, apply.
- `apply_program_revision_snapshot` réécrit aussi `name` / `description`.
- Snapshots live = même forme (`name`, `description`, `duration_weeks`, `phases`, `days`).
- Assignment `active` → autre statut : annule le pointeur scheduled s’il ne reste aucun assignment actif.
- Client paused : `ensure_due_program_version` no-op.

## Horloge des versions planifiées

`schedule_program_version` fige `scheduled_activation_timezone` (IANA) au moment
du schedule. `ensure_due_program_version` lit **cette colonne**, jamais un
lookup live des assignments.

Règle des programmes partagés : horloge civile du **propriétaire / Coach**,
pas du premier client actif. Un client Toronto puis Vancouver, ou le départ
du premier client avant activation, ne change pas le sens du schedule.

Timezone profil manquante → `America/Toronto`. Colonne frozen absente → fail-closed (`ensure_due` = 0).

## ACL helpers internes

Même principe que Hotfix A/B :

```text
RPC métier publique
→ helper interne
```

pas :

```text
authenticated
→ helper SECURITY DEFINER arbitraire
```

`authenticated` n’a **pas** `EXECUTE` sur :

- `program_actor_timezone(uuid)`
- `program_activation_timezone(uuid)`
- `program_current_phase_id(uuid, date, date)`
- `program_civil_date(text, timestamptz)`
- `program_version_is_due(date, text, timestamptz)`
- `program_has_history(uuid)`
- `validate_program_graph_payload`
- `apply_program_revision_snapshot`
- `sync_program_days` 4-arg
- `cancel_scheduled_program_version`

Ces helpers restent appelables depuis les RPC `SECURITY DEFINER` (propriétaire SQL)
et `service_role`.

RPC publiques conservées pour `authenticated` : `save_program`,
`save_program_version`, `schedule_program_version`, `activate_program_version`,
`ensure_due_program_version`, `start_workout_from_template`,
`create_program_complete`, `delete_program`, `sync_program_days` (2-arg).

## Suppression de programme

Le Data API `DELETE` sur `programs` est fermé (REVOKE + policy owner retirée).
La seule porte est `delete_program` :

```text
jamais attribué / jamais utilisé
→ hard delete possible

assignment actif
→ refus (`program_has_active_assignment`)

historique assignment / workout
→ refus (`program_has_history`)
```

Pas d’archivage P3. Fail-closed : un refus ne mute pas révisions, assignments
ni workouts. `deleteProgram()` frontend passe par cette RPC.

## Autorité graphe

Writes Data API `authenticated` retirés sur `program_days`, `program_day_exercises`,
`program_phases`, et INSERT/UPDATE/**DELETE** `programs`. SELECT conservé.
Overloads trusted et `apply_program_revision_snapshot` non accordés à `authenticated`.
