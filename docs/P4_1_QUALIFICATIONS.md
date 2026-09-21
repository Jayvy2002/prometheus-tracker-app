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

Le chemin doit matcher `auth.uid() / qualification_id / proof-<uuid>.{pdf|jpg|jpeg|png|webp}`. Chaque upload crée un nouvel objet (`upsert: false`) ; jamais d’écrasement du même chemin. `declare` ignore un `p_proof_path` client. `save` / `submit` refusent tout autre chemin (`invalid_proof_path`). `submit` exige que l’objet existe dans `storage.objects` (`bucket = qualification-proofs`, `name = proof_path`) sinon `proof_missing`. Après soumission le `proof_path` est figé : le document vérifié est exactement celui qui existait à la soumission.

Les policies Storage n’autorisent INSERT/DELETE que si `verification_status IN ('declared', 'rejected')`. Aucune policy UPDATE : un objet n’est jamais écrasé. Dès `pending` (et pour `verified` / `expired`) la preuve est immuable. `withdraw` d’une ligne `declared`/`rejected` refuse `proof_cleanup_required` tant que l’objet Storage existe : le client doit d’abord `.remove()` via l’API Storage, puis seulement ensuite supprimer la ligne. Jamais de `DELETE FROM storage.objects`. `delete-account` nettoie récursivement les buckets personnels via l’API Storage et **refuse** `auth.deleteUser` si `list` / `remove` / un listing tronqué (>50 000) échoue.

## Écritures

| RPC | Qui | Effet |
|---|---|---|
| `declare_coach_qualification` | Coach | insert `declared` (max 20), preuve nulle |
| `save_coach_qualification` | Coach | mute `declared` / `rejected` → `declared` |
| `submit_coach_qualification` | Coach | `declared`/`rejected` → `pending` si preuve owned |
| `withdraw_coach_qualification` | Coach | `pending` → `declared` ; `declared`/`rejected` DELETE seulement si plus aucun objet Storage |
| `review_coach_qualification` | `service_role` | `pending` → `verified` / `rejected`, `reviewer_ref = marketplace_audit_actor()` |

`save_program` / marketplace publish **n’exigent pas** de badge. Pas d’étoiles.

## Migration

Candidate Git `20260921021231_p4_coach_qualifications`. Ne pas restamper `20260920014500`.
