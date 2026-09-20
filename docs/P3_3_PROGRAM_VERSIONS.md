# P3.3 — Versions / activation

> Contrat durable. Les versions réutilisent `program_revisions`. Il n’existe pas de
> second graphe `program_versioning` / logger de version.

## Modèle

```text
Program (identité)
→ session_organization (P3.1)
→ optional program_phases (P3.2)
→ program_days (graphe **live** = version active)
→ program_revisions (snapshots immuables)
→ workouts (tampon au start)
```

Pointeurs sur `programs` :

| Champ | Rôle |
|---|---|
| `active_revision_no` | révision actuellement appliquée au graphe live |
| `scheduled_revision_no` | au plus une future révision |
| `scheduled_activates_on` | date civile d’activation |

États dérivés :

- **draft** — formulaire non persisté
- **saved** — révision sans `activated_at`, non planifiée
- **scheduled** — pointeur `scheduled_revision_no`
- **active** — `active_revision_no`
- **historical** — déjà activée puis remplacée

## Écritures

| RPC | Effet live | Qui |
|---|---|---|
| `save_program` | mute le graphe (édition de l’active) | owner, pas leftover |
| `save_program_version` | snapshot seulement | owner, pas leftover |
| `schedule_program_version` | pointeur ; apply immédiat si date ≤ aujourd’hui | owner + coach actif si assigné |
| `activate_program_version` | applique le snapshot, idempotent | idem |
| `ensure_due_program_version` | applique si date due | lecteur (owner / assigné / coach actif) |

`apply_program_revision_snapshot` n’est **pas** accordé à `authenticated`.

`name` / `description` du snapshot sont appliqués à l’activation. L’horloge de phase
repart de `phase_anchor_on` (date civile planifiée, sinon date d’activation).

Une version `scheduled` est validée avant le pointeur. Une relation Coach coupée
annule le pointeur futur ; un client `paused` ne déclenche pas `ensure_due`.

L’activation due utilise la date civile du client assigné, pas `CURRENT_DATE` UTC.

Deux futures versions : `already_scheduled` sauf `p_replace`. Historique : `historical`. Stale : `stale`.

## Logger

Un seul : `start_workout_from_template`. Tamponne `program_revision_no` + phase. Un changement futur ne réécrit pas les séances.

## Calendrier / séquence

P3.1 inchangé. En `fixed_days`, les dates ≥ `scheduled_activates_on` peuvent montrer la version future. En `in_order`, aucune date inventée.

## Legacy

Programme existant = graphe live, `active_revision_no` = dernière révision (backfill). Sans phase = programme simple. Sans version future = rien à activer.

## Migration

Appliqué en production avec le timestamp Git `20260919233853_program_versions` (129, pending vide). Ne pas restamper. Pas de P4.
