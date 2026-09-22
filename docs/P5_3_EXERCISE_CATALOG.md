# P5.3 — Bibliothèque d’exercices

> En revue. Migration `20260923014500_p5_exercise_catalog` en pending. Le lock production reste 136 tant que la migration n’est pas observée.

Le catalogue existant (`exercises`, `exercise_requests`) est étendu. Il n’y a pas de seconde bibliothèque privée par Coach.

## Identité

`exercise_normalize_name` plie accents, casse et ponctuation. `exercise_aliases.normalized` est unique : un libellé ne désigne qu’un exercice actif. Les variantes restent des lignes distinctes (`Squat` et `Hack Squat`).

`exercises.merged_into_id` retire un doublon de la recherche sans le supprimer. `exercise_canonical_id` suit la chaîne.

## Lien sûr

`workout_exercises`, `routine_exercises`, `program_day_exercises` et `coach_provisional_exercises` gagnent `catalog_exercise_id`. Un trigger le remplit à l’insertion seulement si `resolve_exercise_catalog` trouve exactement un exercice actif. Le texte `name` n’est jamais modifié. Un nom inconnu reste sans lien.

Les imports P5.1/P5.2 continuent d’écrire le nom libre. Le même trigger pose le lien quand il est unique.

## Propositions

`propose_exercise` crée une `exercise_requests` `pending`. Il n’insère pas dans `exercises`. Un utilisateur authentifié ne peut plus insérer dans `exercises`, ni passer sa propre demande à `approved`.

`verify-exercise` peut décrire un nom manquant. Il ne crée pas l’exercice et ne l’approuve pas. Un hit catalogue renvoie l’exercice existant (`matched`, `applied: false`).

## Fusion

`merge_exercises(winner, loser, confirm)` exige `confirm = true`. Elle est réservée à `service_role`. Elle déplace les alias, répointe `catalog_exercise_id` et `result_exercise_id`, et journalise `exercise_merges`. Un second appel sur la même paire renvoie `already_merged`. Les noms déjà écrits et les séries restent.

`list_exercise_duplicate_candidates` est aussi réservé à `service_role`. La surface opérateur est P5.4.

## Recherche

`search_exercises` et `suggest_exercise_matches` sont exécutables par un utilisateur authentifié, y compris un Coach, un Coach lui-même Coaché, ou un ancien Coach. Elles ignorent les exercices fusionnés.
