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

Ancre : `programs.phase_anchor_on` à l’activation.

- `activate_program_version` (« Activer maintenant ») : date civile propriétaire `now`.
- `ensure_due_program_version` / schedule déjà dû : `scheduled_activates_on` d’origine.

Sinon `assignment.start_date`. Semaine, durée, calendrier et phase utilisent
`effectiveVersionStart = laterOf(assignment.start_date, version_start_on / phase_anchor_on)`.
Un client assigné après l’activation d’une version commence semaine 1 à sa
`start_date`. Un preview `date >= scheduled_activates_on` lit `duration_weeks`
et l’ancre dans le snapshot scheduled (`parseRevisionMeta`), toujours via laterOf
avec `assignment.start_date`.

`program_revisions.version_start_on` fige le début civil réel de la révision
quand `apply_program_revision_snapshot` calcule `v_anchor`. Un snapshot live
copie `programs.phase_anchor_on` sans redémarrer. Legacy non prouvable : NULL,
fallback `assignment.start_date`.

Horloge civile programme = timezone du **profil** (`useProgramCivilClock`),
pas `todayStr()` device. Les différences de jours civils frontend utilisent
un ordinal UTC (`Date.UTC(y, m-1, d)`), jamais `/ 86_400_000` local (DST).
Dashboard (semaine + gym), Workout, ClientProgram, calendrier des jours
planifiés. Nutrition/streak restent device-local.

## Weekdays multi-phase

Uniques partielles :

- `(program_id, weekday)` si `phase_id IS NULL` (legacy)
- `(program_id, phase_id, weekday)` si phase renseignée

Même lundi en Accumulation / Intensification / Deload, prescriptions distinctes.
`program_days.phase_id` est `ON DELETE CASCADE` : retirer une phase ne fait plus
`SET NULL` (ce qui violait l’unique weekday legacy).
`workouts.program_day_id` et `workouts.program_phase_id` restent
`ON DELETE SET NULL`, mais **DEFERRABLE INITIALLY IMMEDIATE** : un DELETE de
phase ne revalide plus `program_day_id` alors que le jour est déjà parti.
`save_program` n’est pas remplacé.

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
- `program_effective_version_start(date, date)`
- `program_has_history(uuid)`
- `validate_program_graph_payload`
- `apply_program_revision_snapshot` (3-arg, `p_anchor_mode`)
- `sync_program_days` 2-arg et 4-arg
- `sync_program_phases` 2-arg et 3-arg
- `snapshot_program_revision`
- `save_program_day_exercises`
- `create_program_with_days`
- `cancel_scheduled_program_version`

Les helpers RLS (`actor_owns_program`, `actor_can_read_program`,
`actor_can_activate_program_version`, `coached_client_cannot_edit_program`)
restent `EXECUTE` pour `authenticated`.

`save_program` n’est pas remplacé. Après `sync_program_phases`,
`sync_program_days` recharge les phases live pour le validateur canonique
(durée obligatoire si weekdays partagés).

Ces helpers restent appelables depuis les RPC `SECURITY DEFINER` (propriétaire SQL)
et `service_role`.

RPC publiques conservées pour `authenticated` : `save_program`,
`save_program_version`, `schedule_program_version`, `activate_program_version`,
`ensure_due_program_version`, `start_workout_from_template`,
`create_program_complete`, `delete_program`, `assign_program_secure`,
`fork_program`, `adopt_client_program`. `transition_client_to_solo` n’est
pas remplacé.

`program_revisions`, graphe (`programs`, `program_days`,
`program_day_exercises`, `program_phases`) et `program_assignments` :
`REVOKE ALL` PUBLIC/anon/authenticated puis `GRANT SELECT` authenticated.
Aucun INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER/MAINTAIN Data API.
Les mutations d’assignment passent par `assign_program_secure`,
`create_program_complete`, `transition_client_to_solo`. Identité assignment
(`id`, `program_id`, `client_id`, `assigned_by`, `start_date`) et `status`
immuables pour `authenticated` même si un GRANT UPDATE est rouvert.

`workouts` / `workout_exercises` / `workout_sets` : SELECT+INSERT+UPDATE+DELETE
seulement (logger / file offline). Pas TRUNCATE/REFERENCES/TRIGGER/MAINTAIN.

Provenance workout (`program_id`, assignment/day/phase/revision) : RPC-only.
`workout_exercises.prescription_source` (`program` | `user`) : le logger
écrit `program` ; un INSERT authenticated ne peut écrire que `user` ;
la source est immuable ; `prescribed_*` d’une ligne `program` est immuable.
Les cibles d’une ligne `user` (Solo `addExercise`) ne sont pas une
prescription Coach.

Limite canonique `default_sets` : **1..20** (validateur, create, save,
version, logger, UI). 21 est rejeté dès save/version.

Phases : toutes avec durée **ou** toutes sans durée. Mélange rejeté
(`mixed phase durations`). Pas de span silencieux d’1 semaine.

`actor_can_activate_program_version` ne regarde que les assignments **actifs**.
Un historique paused/completed figé (`frozen_revision_no` stampé
active→paused/completed) ne bloque pas le propriétaire pour les clients
encore actifs. Les archives lisent le snapshot de `frozen_revision_no`,
jamais le graphe live.

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

`delete_program` verrouille `programs` (`SELECT owner_id … FOR UPDATE`) **avant**
ownership, leftover, assignment actif et historique. Le verrou est tenu jusqu’à
la fin de la transaction : un `INSERT` concurrent dans `program_assignments`
(FK vers `programs(id)`) attend / entre en conflit au lieu de se glisser entre
les checks et le `DELETE` (`ON DELETE CASCADE`).

Pas d’archivage P3. Fail-closed : un refus ne mute pas révisions, assignments
ni workouts. `deleteProgram()` frontend passe par cette RPC.

## Autorité graphe

Writes Data API `authenticated` retirés (Hotfix A `REVOKE ALL` + GRANT SELECT)
sur `program_days`, `program_day_exercises`, `program_phases`, `programs`,
`program_assignments`, `program_revisions`. SELECT conservé.
Overloads trusted et `apply_program_revision_snapshot` non accordés à `authenticated`.
