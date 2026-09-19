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

Deux futures versions : `already_scheduled` sauf `p_replace`. Historique : `historical`. Stale : `stale`.

## Logger

Un seul : `start_workout_from_template`. Tamponne `program_revision_no` + phase. Un changement futur ne réécrit pas les séances.

## Calendrier / séquence

P3.1 inchangé. En `fixed_days`, les dates ≥ `scheduled_activates_on` peuvent montrer la version future. En `in_order`, aucune date inventée.

## Legacy

Programme existant = graphe live, `active_revision_no` = dernière révision (backfill). Sans phase = programme simple. Sans version future = rien à activer.

## Migration

Candidate Git `20260919233853_program_versions` (pending jusqu’à apply production). Ne pas restamper. Pas de P4.
