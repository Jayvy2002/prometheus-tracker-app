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

Dates : `iso` / `dmy` / `mdy`. Un slash sans format choisi reste invalide. Une date impossible (`2026-02-31`, `31/02/2026`) est une erreur de ligne `invalid_date`, pas un échec de tout l’aperçu. La séance importée est stockée à midi UTC, comme les séances saisies dans l’app, pour rester le même jour civil à Montréal et dans les fuseaux supportés.

## Idempotence

- `idempotency_key` unique par Coach et liée au sujet. Une clé déjà utilisée pour un autre `subject_user_id`, ou un commit dont le fichier ou le mapping diffère, renvoie `import_conflict`. Une preview du même sujet et du même fichier peut encore corriger le mapping. Une collision concurrente applique les mêmes vérifications.
- Empreinte `(coach_id, subject_user_id, file_sha256, mapping_hash)` pour previewed/committed.
- Retry du même commit : même résultat, pas de doublon.
- Fichier ou mapping changé depuis l’aperçu → `file_changed` / `mapping_changed`.
- Ordre de verrous : mutex de cycle de vie du Coach si le sujet n’est pas le Coach, puis `lock_coach_import` (classe `20014504`), puis `coach_imports` `FOR UPDATE`, puis revalidation, puis la ligne active `coach_client_links` en `FOR SHARE` pour tout le commit. Pas de mutex d’affectation (`20014500`) dans l’import.

## Provenance

Conservée sur `coach_imports` / `coach_import_rows` (fichier, hash, mapping, `coach_ref` immuable `user:<uuid>`, sujet, ligne, erreurs, ids appliqués). `coach_id` est nullable `ON DELETE SET NULL` : supprimer le compte Coach ne détruit pas la provenance ni les séances du client. Les tables métier ne sont pas polluées. Un ancien Coach ne lit plus le CSV tant que la relation n’est plus active. L’import pour soi-même reste lisible.

## Permissions

Un Coach importe pour **lui-même** ou un **client actif** (`is_coach_of`). Relock lifecycle + `coach_relationship_is_open` si le sujet n’est pas soi. Le commit verrouille la relation active avant les écritures et revalide : si le client part pendant le commit, aucune ligne métier n’est écrite (`not_your_client`). Un ancien Coach, un client d’un autre Coach, un athlète sans capability : `not_your_client` / `coach_capability_required`. `get_coach_import` pagine les lignes et les erreurs au-delà des 50 premières.

P5.2 (dossier provisoire sans compte) n’est pas un contournement.

## Sécurité

Fichier hostile : 512 KiB, 2 000 lignes, 32 colonnes, 400 caractères/cellule. Formules `[=+@|-]` rejetées sur chaque champ écrit (exercice, séance, notes, série, RIR, charge, reps, date). Deux en-têtes de même sens restent `duplicate_header` tant qu’un n’est pas choisi et l’autre ignoré. `set_index` absent est dérivé dans l’ordre du fichier ; une valeur fournie doit être un entier de 1 à 100. RIR absent reste null ; un RIR fourni doit être un entier de 0 à 10. Une cellule vide de charge, reps ou RIR reste null, jamais 0. L’ordre des exercices suit la première occurrence. Le mapping client n’est pas l’autorité. RLS : SELECT seulement pour soi ou un client encore actif ; INSERT/UPDATE table révoqués. Helpers (`lock_coach_import`, parse, plan) non exécutables par `authenticated`.

## UX

Route CoachOnly `/coach/import` (desktop muted + réglages + dashboard + clients). **Pas** de 6ᵉ onglet mobile. FR/EN, aucun jargon (`% compatible`, `€`). Confirmation : X importées / Y ignorées / Z à corriger.

## Migration

Candidate : `20260922014500_p5_coach_csv_import`. Lock production **134**. Pending Git uniquement. Ne pas restamper `20260921024426`.
