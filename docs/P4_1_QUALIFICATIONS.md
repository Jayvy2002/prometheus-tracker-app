# P4.1 — Qualifications Coach

> Contrat durable. Une qualification vérifiée informe ; elle n’interdit pas de coacher ni de publier.

## Modèle

```text
coach_qualifications
- coach_id
- title
- qualification_type (certification | degree | license | continuing_education | other)
- declared_at
- proof_path (owner only; bucket privé qualification-proofs)
- verification_status (declared | pending | verified | rejected | expired)
- verified_at
- reviewer_id (nullable, may be absent under service_role)
- reviewer_ref (durable: user:<uid> | role:<role>)
- expires_on
- review_note (owner / reviewer only)
```

`expired` est l’état effectif d’une ligne `verified` dont `expires_on <` date civile.

## Surfaces

| Lecteur | Chemin | Champs |
|---|---|---|
| Owner | RLS table `SELECT *` | état complet, y compris preuve et revue interne |
| Autre membre | `list_public_coach_qualifications` / `list_public_coach_qualification_cards` | id, coach_id, title, type, issuer, declared_at, status, verified_at, expires_on |

Un utilisateur public ne lit jamais `proof_path`, `reviewer_id`, `reviewer_ref` ni `review_note`. Un Coach suspendu (`directory_suspended`) n’expose plus la surface publique (P4.4).

## Preuve

Le chemin doit matcher `auth.uid() / qualification_id / proof[.pdf|.jpg|.jpeg|.png|.webp]`. `declare` ignore un `p_proof_path` client. `save` / `submit` refusent tout autre chemin (`invalid_proof_path`). `submit` exige que l’objet existe dans `storage.objects` (`bucket = qualification-proofs`, `name = proof_path`) sinon `proof_missing`.

Les policies Storage n’autorisent INSERT/UPDATE/DELETE que si `verification_status IN ('declared', 'rejected')`. Dès `pending` (et pour `verified` / `expired`) la preuve est immuable. `withdraw` d’une ligne `declared`/`rejected` supprime d’abord les objets du catalogue Storage, puis la ligne. La suppression de compte nettoie récursivement le bucket via l’API Storage.

## Écritures

| RPC | Qui | Effet |
|---|---|---|
| `declare_coach_qualification` | Coach | insert `declared` (max 20), preuve nulle |
| `save_coach_qualification` | Coach | mute `declared` / `rejected` → `declared` |
| `submit_coach_qualification` | Coach | `declared`/`rejected` → `pending` si preuve owned |
| `withdraw_coach_qualification` | Coach | `pending` → `declared` ; sinon DELETE |
| `review_coach_qualification` | `service_role` | `pending` → `verified` / `rejected`, `reviewer_ref = marketplace_audit_actor()` |

`save_program` / marketplace publish **n’exigent pas** de badge. Pas d’étoiles.

## Migration

Candidate Git `20260921021231_p4_coach_qualifications`. Ne pas restamper `20260920014500`.
