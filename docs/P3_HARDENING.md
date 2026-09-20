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
`fork_program`, `adopt_client_assignment`, `get_frozen_program_archive`.
`transition_client_to_solo` n’est pas remplacé.

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

Les archives paused/completed n’ont **plus** SELECT sur le graphe LIVE
(`programs`, `program_days`, `program_day_exercises`, `program_phases`).
Seul un assignment `active` lit le live. L’owner (bibliothèque) est inchangé.
Un Coach **non-owner** ne lit le live que s’il existe un assignment `active`
vers l’un de ses clients actifs (`is_coach_of` **et** `pa.status = 'active'`).
Un nouveau Coach ne voit donc pas le graphe live d’un ancien programme paused,
ni les drafts sauvés par l’ancien Coach après le départ.
`program_revisions` : client ou Coach non-owner, assignment actif = révision
active + scheduled + workouts de **ce** client ; paused/completed =
`frozen_revision_no` (+ workouts historiques, jamais une révision créée après
le départ) ; un saved draft n’est jamais visible. L’owner voit tout
l’historique. Hydratation archive : `get_frozen_program_archive(assignment_id)`
(caller = client / assigner / owner / **Coach actuel actif** du client,
status paused/completed, snapshot `frozen_revision_no` uniquement).
`adopt_client_assignment(p_assignment_id, p_name)` copie **cette** ligne via
`apply_program_revision_snapshot` (pas les tables live, pas une autre row du
même programme). Assignment actif → `programs.active_revision_no`. Paused /
completed → `assignment.frozen_revision_no` (fail-closed si manquant).
L’ancien RPC `adopt_client_program(program_id, client_id)` (choix active /
`updated_at DESC`) est **DROP**. Verrou : mutex client, `programs FOR UPDATE`,
assignment `FOR UPDATE`, lien Coach actif `FOR SHARE`, puis `is_coach_of`
avant copie.

Toute mutation publique d’assignment (`assign_program_secure`,
`create_program_complete(... p_assign_client_id ...)`, `end_coach_client_link`,
`client_end_coach_link`, `adopt_client_assignment`, `close_coach_account`)
prend d’abord un **mutex de transaction par `client_id`**
(`lock_client_assignment_mutex` : `pg_advisory_xact_lock` à deux clés, classe
`20014500`, interne, pas PUBLIC / anon / authenticated). Ensuite seulement :

```text
client assignment mutex
→ programs ORDER BY id FOR UPDATE
→ assignment(s) FOR UPDATE
→ autres locks (lien FOR SHARE, freeze, etc.)
```

`lock_client_assignment_programs` prend ce mutex **avant** de lire les
assignments `active` et de verrouiller les programmes (actifs du client ∪
cible). Relire les programmes après une attente `FOR UPDATE` sans mutex
laisserait un waiter avec un lock-set périmé (A paused, B actif jamais
verrouillé). `transition_client_to_solo` n’est pas remplacé : ses appelants
publics tiennent déjà le mutex. `close_coach_account` mutex tous les clients
liés (`ORDER BY client_id`) jusqu’à un ensemble stable **avant** le lock-set
programmes, pour qu’une assignation qui commit pendant l’attente soit
incluse dans le fork P3.

Le trigger freeze peut alors `FOR UPDATE` le programme déjà tenu : pas
d’ordre `assignment → program` vs adopt, et pas de lock-set périmé vs
assign concurrent.

`close_coach_account` (service_role, une transaction, retry = no-op s’il n’y
a plus de lien actif) transfère **chaque** assignment du client lié via le
moteur P3 : révision source exacte (actif → `active_revision_no`, paused /
completed → `frozen_revision_no`, fail-closed) plus les révisions réellement
référencées par les workouts de **cet** assignment, mêmes `revision_no`,
snapshots remappés (`remap_program_revision_snapshot`) puis
`apply_program_revision_snapshot` **sans JWT utilisateur** (`sync_program_phases`
/ `sync_program_days` en `p_trusted` n'exigent `auth.uid()` que sur le chemin
non trusted). Les drafts Coach privés non utilisés ne
sont pas copiés. `workouts.program_id` pointe vers le programme client-owned
**avant** la suppression Auth ; `program_revision_no` continue de résoudre.
Après transfert : `assignment.program_id` = fork, status `paused`,
`frozen_revision_no` non NULL, archive RPC immédiatement fonctionnelle.

`program_assignments_freeze_on_pause` verrouille `programs … FOR UPDATE`
avant de copier `active_revision_no`. `end_coach_client_link` /
`client_end_coach_link` prennent le même verrou **avant**
`transition_client_to_solo` (ordre identique à activate/save).

`today < effectiveVersionStart` → `start_workout_from_template` refuse
(`program_not_started`) ; la gym card ne propose aucune séance programme.
`schedule_program_version` : `p_activates_on <` civil owner →
`activation_date_in_past`. Aujourd’hui = apply immédiat ; futur = pointeur.

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
