# P5.1 — Import spreadsheet / CSV intelligent

> Livré en production le 22 septembre 2026 (`#213`, lock **135**). P5.2 réutilise ce pipeline pour un dossier provisoire via `preview_provisional_import`. La signature à 5 arguments de `preview_coach_import` reste celle des comptes.

## Parcours

```text
Upload → parsing → détection des colonnes → mapping proposé
→ ambiguïtés → preview serveur → corrections → confirmation → transaction
```

Le frontend parse et propose. Preview obligatoire. Le serveur parse, mappe et valide au preview. Le commit applique le plan déjà prévisualisé (il ne relit pas le fichier) et refuse un hash vide. Aucune écriture métier avant confirmation.

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

- `workout` — séances **terminées** historiques (`completed = true`), noms d’exercices en texte libre. P5.3 peut remplir `catalog_exercise_id` seulement si le nom normalisé correspond à un seul exercice actif. Le texte écrit ne change pas. **Pas** `start_workout_from_template` / `save_program`. Pas de `program_day_id`.
- `body_weight` — `weight_measurements`. Unique `(user_id, measured_at)` : jour déjà présent → `already_exists`, pas d’écrasement.

RPE : notes, ou conversion explicite vers RIR (`10 − RPE`). Si les deux colonnes sont mappées et que le mode est `convert_to_rir`, le Coach choisit `effort_source` (`rir` ou `rpe`) avant l’aperçu. Sans ce choix : `rir_rpe_conflict`. En mode notes, le RIR reste et le RPE est ajouté à la note.

Unité : une colonne `unit` mappée est lue. `kg` / `lb` (et alias) convertit cette ligne, puis le plafond s’applique en kg (`500` pour le poids, `2000` pour la charge). `501 lb` reste valide. Une cellule vide retombe sur `load_unit` ou `body_weight_unit`. Une unité inconnue est `invalid_unit`. Le menu global ne remplace jamais une unité écrite dans le fichier.

Dates : `iso` / `dmy` / `mdy`. Le format `iso` n’accepte qu’une date `AAAA-MM-JJ` : `31/01/2026` est invalide tant que le format n’est pas `dmy`. Une date impossible (`2026-02-31`, `31/02/2026`) est une erreur de ligne `invalid_date`, pas un échec de tout l’aperçu. La séance importée est stockée à midi UTC, comme les séances saisies dans l’app, pour rester le même jour civil à Montréal et dans les fuseaux supportés.

Séparateur : la détection compte les `,` `;` et tabulations hors guillemets. Le Coach peut le corriger. Le serveur parse avec le séparateur du mapping.

## Idempotence

- `idempotency_key` unique par Coach et liée au sujet. Une clé déjà utilisée pour un autre `subject_user_id`, ou un commit dont le fichier ou le mapping diffère, renvoie `import_conflict`. Une preview du même sujet et du même fichier peut encore corriger le mapping. Une collision concurrente applique les mêmes vérifications.
- Empreinte `(coach_id, subject_user_id, file_sha256, mapping_hash)` pour previewed/committed.
- Source déjà committée pour le même athlète : index `(subject_user_id, file_sha256)` où `status = committed`, indépendant du Coach. Un second import du même fichier renvoie `already_imported`, y compris après un changement de Coach. Le retry du même mapping renvoie l’import existant.
- Collision avec une séance déjà présente (même jour civil et même nom, ou même exercice) : `potential_duplicate`. Le commit est refusé tant que `acknowledge_duplicates` n’est pas vrai. L’acceptation fige l’empreinte de la liste montrée. Si cette liste a changé au commit : `duplicates_changed`, et il faut un nouvel aperçu. Deux séances légitimes le même jour, avec un autre nom et d’autres exercices, ne sont pas bloquées. Pas de contrainte unique `(user, date, name)`.
- Deux commits du même athlète se sérialisent sur le mutex de sujet `20014506` avant ce contrôle et les écritures. Le second revoit la séance du premier.
- Retry du même commit : même résultat, pas de doublon.
- Fichier ou mapping changé depuis l’aperçu → `file_changed` / `mapping_changed`.
- Ordre de verrous : mutex de cycle de vie du Coach si le sujet n’est pas le Coach, puis `lock_coach_import` (classe `20014504`), puis `coach_imports` `FOR UPDATE`, puis revalidation, puis la ligne active `coach_client_links` en `FOR SHARE`, puis le mutex de sujet `20014506`. Pas de mutex d’affectation (`20014500`) dans l’import.

## Provenance

Conservée sur `coach_imports` / `coach_import_rows` (fichier, hash, mapping, `coach_ref` immuable `user:<uuid>`, sujet, ligne, erreurs, ids appliqués) **une fois l’import commité**. `coach_id` est nullable `ON DELETE SET NULL` : supprimer le compte Coach ne détruit pas la provenance ni les séances du client. Les tables métier ne sont pas polluées. Un ancien Coach ne lit plus le CSV tant que la relation n’est plus active. L’import pour soi-même reste lisible.

Les aperçus non confirmés ne sont pas de la provenance durable. Au plus **20** aperçus `previewed` par Coach (`preview_quota`). `cancel_coach_import` passe le statut à `cancelled` et supprime les lignes brutes. Un aperçu encore ouvert après **7 jours** est aussi annulé au prochain preview, get ou list de ce Coach, et par la purge horaire `coach-import-preview-purge` (`coach_import_purge_stale_previews`), même si le Coach ne revient pas. L’enregistrement de ce job est fail-closed : si `pg_cron` est absent ou si `cron.schedule` ne crée pas exactement `15 * * * *` / `SELECT public.coach_import_purge_stale_previews()`, la migration échoue. Les imports `committed` ne sont pas annulés et leur audit n’est pas supprimé.

## Permissions

Un Coach importe pour **lui-même** ou un **client actif** (`is_coach_of`). Relock lifecycle + `coach_relationship_is_open` si le sujet n’est pas soi. Le commit verrouille la relation active avant les écritures et revalide : si le client part pendant le commit, aucune ligne métier n’est écrite (`not_your_client`). Un ancien Coach, un client d’un autre Coach, un athlète sans capability : `not_your_client` / `coach_capability_required`. `get_coach_import` pagine les lignes et les erreurs au-delà des 50 premières.

P5.2 (dossier provisoire sans compte) n’est pas un contournement.

## Sécurité

Fichier hostile : 512 KiB, 2 000 lignes, 32 colonnes, 400 caractères/cellule. Formules `[=+@|-]` rejetées sur chaque champ écrit (exercice, séance, notes, série, RIR, charge, reps, date). Deux en-têtes de même sens restent `duplicate_header` tant qu’un n’est pas choisi et l’autre ignoré. `set_index` absent est dérivé dans l’ordre du fichier ; une valeur fournie doit être un entier de 1 à 100. RIR absent reste null ; un RIR fourni doit être un entier de 0 à 10. Une cellule vide de charge, reps ou RIR reste null, jamais 0. L’ordre des exercices suit la première occurrence. Le mapping client n’est pas l’autorité. RLS : SELECT seulement pour soi ou un client encore actif ; INSERT/UPDATE table révoqués. Helpers (`lock_coach_import`, parse, plan) non exécutables par `authenticated`.

## UX

Route CoachOnly `/coach/import` (desktop muted + réglages + dashboard + clients). **Pas** de 6ᵉ onglet mobile. FR/EN, aucun jargon (`% compatible`, `€`). Confirmation : X importées / Y ignorées / Z à corriger.

## Migration

Appliqué : `20260922014500_p5_coach_csv_import` (même timestamp Git, 97 statements, `created_by` null). Lock production **135**. Pending vide. Ne pas restamper `20260921024426` ni `20260922014500`.
