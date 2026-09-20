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

## Logger

Si `program_day_id` est fourni, la prescription vient de `program_day_exercises`.
`p_exercises` client est ignoré. Off-plan (`program_day_id` null) reste libre.

## Versions

- Validateur canonique `validate_program_graph_payload` avant save live, save version, schedule, apply.
- `apply_program_revision_snapshot` réécrit aussi `name` / `description`.
- Snapshots live = même forme (`name`, `description`, `duration_weeks`, `phases`, `days`).
- Activation due = date civile du **client assigné** (`program_civil_date`), pas `CURRENT_DATE` UTC.
- Assignment `active` → autre statut : annule le pointeur scheduled s’il ne reste aucun assignment actif.
- Client paused : `ensure_due_program_version` no-op.

## Autorité

Writes Data API `authenticated` retirés sur `program_days`, `program_day_exercises`,
`program_phases`, et INSERT/UPDATE `programs`. SELECT conservé. DELETE `programs` conservé.
Chemins publics : `save_program`, `save_program_version`, `schedule_program_version`,
`activate_program_version`, `create_program_complete`, `sync_program_days` (2-arg).
Overloads trusted et `apply_program_revision_snapshot` non accordés à `authenticated`.
