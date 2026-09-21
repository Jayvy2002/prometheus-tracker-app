# P4.1 — Qualifications Coach

> Contrat durable. Une qualification vérifiée informe ; elle n’interdit pas de coacher ni de publier.

## Modèle

```text
coach_qualifications
- coach_id
- title
- qualification_type (certification | degree | license | continuing_education | other)
- issuer
- declared_at
- proof_path (bucket privé qualification-proofs)
- verification_status (declared | pending | verified | rejected | expired)
- verified_at
- reviewer_id
- expires_on
- review_note
```

`expired` est l’état effectif d’une ligne `verified` dont `expires_on <` date civile.

## Écritures

| RPC | Qui | Effet |
|---|---|---|
| `declare_coach_qualification` | Coach | insert `declared` (max 20) |
| `save_coach_qualification` | Coach | mute `declared` / `rejected` → `declared` |
| `submit_coach_qualification` | Coach | `declared`/`rejected` → `pending` si preuve |
| `withdraw_coach_qualification` | Coach | `pending` → `declared` ; sinon DELETE |
| `review_coach_qualification` | `service_role` | `pending` → `verified` / `rejected` |

`save_program` / marketplace publish **n’exigent pas** de badge. Pas d’étoiles.

## Lecture

Owner : toutes les lignes. Autres membres : lignes d’un profil **publié**, sauf `rejected`.
Badge public : au moins une qualification effectivement `verified`.

## Migration

Candidate Git `20260921021231_p4_coach_qualifications`. Ne pas restamper `20260920014500`.
