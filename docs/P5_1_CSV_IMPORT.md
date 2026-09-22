# P5.1 — Import spreadsheet / CSV intelligent

> Candidate Git uniquement. **Ne pas merger. Ne pas appliquer en production.** P5.2 n’est pas commencé.

## Parcours

```text
Upload → parsing → détection des colonnes → mapping proposé
→ ambiguïtés → preview serveur → corrections → confirmation → transaction
```

Le frontend parse et propose. Preview obligatoire. Le serveur **reparse, remap, revalide** au preview et au commit. Aucune écriture métier avant confirmation.

## Pipeline

| Étape | Où | Écriture |
|---|---|---|
| Parse CSV (BOM, `,` `;` tab, quotes) | client + `coach_import_parse_csv` | non |
| Détection / mapping / ambiguïtés | `src/features/imports/domain` | non |
| Preview | `preview_coach_import` | journal `coach_imports` / `coach_import_rows` seulement |
| Commit | `commit_coach_import` | séances historiques **ou** mesures de poids, atomique |

XLSX n’est pas livré. Le moteur (kind, mapping, preview, commit) est indépendant du parseur CSV.

## Mapping

Rôles : date, exercice, série, reps, charge, poids corporel, RIR, RPE, notes, nom de séance, unité.

`Weight` / `poids` / `load` / `charge` / `wt` est **ambigu** (charge vs poids corporel). Jamais d’interprétation silencieuse. Le Coach choisit ou ignore.

Deux natures d’import :

- `workout` — séances **terminées** historiques (`completed = true`), noms d’exercices en texte libre. Pas de catalogue (P5.3). **Pas** `start_workout_from_template` / `save_program`. Pas de `program_day_id`.
- `body_weight` — `weight_measurements`. Unique `(user_id, measured_at)` : jour déjà présent → `already_exists`, pas d’écrasement.

RPE : notes, ou conversion explicite vers RIR (`10 − RPE`). Jamais les deux silencieusement.

Dates : `iso` / `dmy` / `mdy`. Un slash sans format choisi reste invalide.

## Idempotence

- `idempotency_key` unique par Coach.
- Empreinte `(coach_id, subject_user_id, file_sha256, mapping_hash)` pour previewed/committed.
- Retry du même commit : même résultat, pas de doublon.
- Fichier ou mapping changé depuis l’aperçu → `file_changed` / `mapping_changed`.
- Mutex `lock_coach_import` classe `20014504`.

## Provenance

Conservée sur `coach_imports` / `coach_import_rows` (fichier, hash, mapping, Coach, sujet, ligne, erreurs, ids appliqués). Les tables métier ne sont pas polluées.

## Permissions

Un Coach importe pour **lui-même** ou un **client actif** (`is_coach_of`). Relock lifecycle + `coach_relationship_is_open` si le sujet n’est pas soi. Un ancien Coach, un client d’un autre Coach, un athlète sans capability : `not_your_client` / `coach_capability_required`. Si le client part entre preview et commit, le commit refuse.

P5.2 (dossier provisoire sans compte) n’est pas un contournement.

## Sécurité

Fichier hostile : 512 KiB, 2 000 lignes, 32 colonnes, 400 caractères/cellule. Formules `[=+@|-]` rejetées. Le mapping client n’est pas l’autorité. RLS : SELECT Coach uniquement ; INSERT/UPDATE table révoqués. Helpers (`lock_coach_import`, parse, plan) non exécutables par `authenticated`.

## UX

Route CoachOnly `/coach/import` (desktop muted + réglages + dashboard + clients). **Pas** de 6ᵉ onglet mobile. FR/EN, aucun jargon (`% compatible`, `€`). Confirmation : X importées / Y ignorées / Z à corriger.

## Migration

Candidate : `20260922014500_p5_coach_csv_import`. Lock production **134**. Pending Git uniquement. Ne pas restamper `20260921024426`.
