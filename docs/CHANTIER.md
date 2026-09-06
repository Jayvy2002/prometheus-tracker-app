# Chantier — Prometheus

**Statut :** plan de travail après la consolidation de septembre 2026. Validé pour exécution le 6 septembre 2026.
**Ne remplace pas** `docs/VISION.md` : la vision reste la source de vérité produit. Ce fichier dit **dans quel ordre** on la construit, et ce qui est déjà livré.

> Un agent qui ouvre le repo lit `VISION.md` puis celui-ci. Si les deux se contredisent, c’est `VISION.md` qui gagne, et ce fichier doit être corrigé.

---

## État au 6 septembre 2026

### Mergé dans `new-JV` (prod Netlify → `tracker.prometheus-fit.com`)

| PR | Quoi |
|---|---|
| #43 → #47 | Intake 27 q, vision SaaS, copilote solo lots A/B, intake dans la boucle coach, télémétrie |
| #48 | North star force & physique, 3 briques, phase consolidation |
| #49 | P0 client : fin de lien = retour solo, accueil coaché, nav mobile |
| #51 | Une seule File du jour, adhérence saisie, un seul nom (Prometheus) |
| #53 / #54 | Bilingue réel ; tournée déterministe FR/EN ; `user_profiles.language` ; **cooldown fleet restauré** |
| #55 | Tests figés sur `today` |
| #56 | **P0** verrous d’écriture `coach_client_links` / `coach_messages` / `program_assignments` |
| #57 | Lots A–E audit code : auth refresh, writes honnêtes, TDEE, RLS programme, fleet TZ, edges |

### Stack consolidation produit (ouvert, à merger dans l’ordre)

| PR | Quoi | Prod déjà appliquée | Reste |
|---|---|---|---|
| [#58](https://github.com/Jayvy2002/prometheus-tracker-app/pull/58) PR 4 — programme vivant solo | Même `coach-agent` (`onboarding_plan` / `program_nl_edit`) ouvert au cas « je suis mon propre coach ». Jamais d’auto-apply. Coaché sans copilote. | SQL `solo_self_coach` ; `notify-onboarding-complete` v13 | **Mergée** dans `new-JV` (6 sept.) |
| [#59](https://github.com/Jayvy2002/prometheus-tracker-app/pull/59) PR 5 — le moteur consomme les données | `loop_context` (messages, notes, check-ins, photos dates+kinds) ; priorités hunger/mood/stress ; onboarding sans champs morts ; `/coach/learned` | SQL `engine_consumes_data` ; **`coach-agent` v15** (`loop_context`, JWT on, 6 sept.) | **Mergée** dans `new-JV` (6 sept.) |
| [#60](https://github.com/Jayvy2002/prometheus-tracker-app/pull/60) PR 6 — restes client/solo | Historique check-in, journal de pas, realtime `program_days` / `program_day_exercises` / `progress_photos`, diffs kcal + Relancer | SQL `client_program_photos_realtime` | Retargetée sur `new-JV` ; CI en cours puis merger |

La CI GitHub ne tourne que sur les PRs vers `new-JV`. #59 et #60 n’ont donc pas de check tant qu’elles sont empilées.

### Drafts orphelins

- [#50](https://github.com/Jayvy2002/prometheus-tracker-app/pull/50) — 22 commits derrière. Deux trous déjà bouchés par #57. Les 3 restes sont dans [#62](https://github.com/Jayvy2002/prometheus-tracker-app/pull/62). Fermer #50 après merge de #62.
- [#42](https://github.com/Jayvy2002/prometheus-tracker-app/pull/42) — **fermée** (6 sept.) : « vider le tracker solo » est contraire à la vision.

### Prod (`phyuijjekxtjvipjtdfv`, snapshot 6 sept.)

- `coach-agent` **v15** : source #59 (`loop_context`, self-coach), JWT requis.
- 9 comptes, 2 coachs, 5 coachés, 2 solos, 5 liens actifs.
- 14 brouillons dont **1 envoyé**, 0 message, 0 photo, 0 note, 1 intake complet, 140 `product_events`, 0 bilan solo, 0 intervention self-coach.
- Tournée `cron` `0 4 * * *` active. Dernière : 6 sept. 04:00 UTC, 5 vus / 5 cartes / `deterministic` / 0 erreur.
- Advisors : **0 erreur**. Warnings connus (`SECURITY DEFINER` exposés = par design ; `pg_trgm`/`pg_net` dans `public` ; 3 triggers `updated_at` sans `search_path` ; 18 paires de policies SELECT permissives ; 7 `auth.uid()` par ligne). Rien de bloquant à 9 utilisateurs.
- **HIBP / leaked passwords :** warning Auth toujours là. Org **Free** (`Prometheus fitness`) — la protection HaveIBeenPwned est **Pro+**, pas activable aujourd’hui. **Rien n’est compromis** : tous les comptes présents sont des comptes de test. À cocher au passage Pro : [Auth → Email](https://supabase.com/dashboard/project/phyuijjekxtjvipjtdfv/auth/providers?provider=Email).

---

## Étape 0 — Fermer la consolidation

À faire **avant** tout nouveau chantier produit.

1. **#58 et #59 mergées.** Retargeter **#60** sur `new-JV` (fait) → merger. Netlify déploie à chaque merge.
2. **Fait (6 sept.)** — `coach-agent` **v15** en prod (`phyuijjekxtjvipjtdfv`) : source #59, `loop_context` / `compactLoopContext` / self-coach, `verify_jwt` true. `coach-fleet-round` (mapDossier étendu) reste optionnel — le SQL fleet renvoie déjà les clés, l’ancienne edge les ignore sans casser.
3. Mini-PR restes #50 : **[#62](https://github.com/Jayvy2002/prometheus-tracker-app/pull/62)**. #42 fermée. Fermer #50 après merge de #62.
4. **HIBP :** pas activable sur le plan Free. Comptes = test, rien de compromis. À faire au passage Pro.
5. **Un vrai cycle en prod**, Jayvy aux commandes : solo → intake → programme proposé → accepter → séance ; coach → tournée → Envoyer un brouillon → le client le voit. Le « 1 envoyé » doit monter avant de bâtir plus haut.

---

## Ordre des chantiers

**0 → A → transversal → B → C → D.**

A est petit et ferme la table VISION. B et C rendent l’acquisition de coachs possible. D attend une décision de prix et des utilisateurs réels — « gratuit tant que le produit n’est pas parfait » reste vrai.

Hors scope de ces chantiers : changer le north star, un second agent, désactiver le RLS, auto-apply.

---

## Chantier A — Macros coaché (VISION point 5 + 8)

**Petit.** Le Setup **pré-remplit déjà** les 4 champs ISSN (`issnTargetsFromProfile`) et le trigger `protect_coach_nutrition_targets` tient.

### A1 — Garder ou écraser (point 8)

Au Setup d’un **ex-solo**, montrer clairement « ses cibles actuelles » vs « ISSN » et laisser le coach **garder** ou **écraser**. Aujourd’hui la comparaison n’apparaît que si le profil a des cibles > 0, sans dire d’où elles viennent.

### A2 — Le « pourquoi »

Le solo l’a (`soloCopilot.ts`, clé i18n). La tournée coach a des observations chiffrées (`fleetCopy.kcal`) mais pas de phrase d’explication partagée. Une seule fonction d’explication, utilisée par le copilote solo **et** la carte avant / après du brouillon kcal (PR 6).

### Tests

`coachOwnedTargets`, lock de copy fleet. Jamais d’auto-apply. Le trigger coach-only reste.

---

## Transversal — à glisser entre deux chantiers

- `joursDispo` pré-rempli dans l’éditeur manuel de programme ; accusé de réception d’un drapeau médical avant Envoyer (reste du chantier 3 VISION).
- Écran de lecture télémétrie coach/admin. `product_events` n’a aujourd’hui qu’une policy INSERT.
- Migration perf (plus tard, pas urgent à 9 users) : `auth_rls_initplan` ×7 en `(select auth.uid())` ; fusion des paires de policies SELECT permissives.
- Bundle JS ~1,6 MB : `React.lazy` par route.

---

## Chantier B — Builder de questionnaire par coach (VISION point 9)

**Le plus structurant.** 27 questions aujourd’hui en dur dans `src/lib/kinesiologyIntake.ts` (libellés FR/EN, options, 9 écrans, jsonb `kinesiology_intake`, `compactIntake` côté agent, drapeaux PAR-Q, cibles solo dérivées).

### B1 — Données

Table `coach_questionnaires (coach_id, name, version, questions jsonb, is_default)`.

Schéma d’une question : `id`, `type` (`single` | `multi` | `text` | `number` | `yes_no` | `weekdays`), `label_fr`, `label_en`, `options`, `required`, `medical_flag`, `maps_to`.

Le template = les 27, exporté depuis `kinesiologyIntake.ts`. Les **ids standards ne changent pas** : `compactIntake`, `medicalFlagIds`, `soloTargetsFromIntake`, `available_weekdays` continuent de marcher via `maps_to`.

`coach_invites.questionnaire_id` nullable → défaut du coach.

RLS : le coach possède ; le client lit celui de son coach via le lien actif.

### B2 — Rendu

`KinesiologyIntakeFlow` piloté par la définition (écrans = groupes de questions). Solo = template. Invité = questionnaire de son coach (token → coach → défaut). Reprise du brouillon inchangée.

### B3 — Builder coach

Route `/coach/questionnaire` : liste, édition FR+EN, options, requis, drapeau médical, réordonner, ajouter/retirer, « Revenir au template », aperçu. Modifier crée une **version** ; les réponses existantes gardent la leur.

### B4 — Moteur

`compactIntake` : questions custom en générique (libellé + réponse) à côté des standards mappées. Fiche 360 « Questionnaire » rendue par définition. Badges médicaux = `medical_flag`.

### B5 — Télémétrie + tests

`intake_completed` avec questionnaire / version. Tests source-lock dans le même commit.

### Risques

Une question custom n’a qu’une langue (celle du coach) ; taille du prompt agent ; stabilité des ids standards.

---

## Chantier C — Recherche et changement de coach (VISION point 4 + 7)

**Constat :** invitation seulement. `end_coach_client_link` refuse `p_client_id = auth.uid()` — le client ne peut pas partir seul.

### C1 — Le client peut partir

RPC `client_end_coach_link()` : mêmes effets que côté coach (rôle solo, tracking retirée, programme en pause, cibles conservées, essai 30 j) + information au coach. UI Profil coaché « Mettre fin au coaching » avec confirmation. Télémétrie.

### C2 — Profil public coach (opt-in)

`coach_profiles (display_name, bio, disciplines bb/pl/force, langues, à distance / ville, accepting_clients, is_public)`. Page `/coach/profile`.

### C3 — Annuaire

`/coaches` (filtres discipline, langue, distance) → « Demander à rejoindre » → `coach_join_requests` → le coach accepte dans le Command Center, réutilise la logique d’`accept_coach_invite`. **Le coach choisit ses clients.**

### C4 — Changer de coach

C1 puis C3 dans un seul parcours. L’historique suit (VISION point 4).

RLS : profils publics lisibles par `authenticated` seulement ; requêtes visibles des deux parties.

---

## Chantier D — Billing Stripe (VISION point 10 + mur post-essai du point 4)

**Constat :** table `subscriptions` (tier `free`/`premium`) héritée, 3 edges en 410, **zéro code Stripe côté front**, `solo_trial_ends_at` posé à la fin de lien mais aucun mur.

### D1 — Décisions de Jayvy avant toute ligne de code

Prix solo ; paliers coach (ex. 1–5 / 6–15 / 16+ clients) ; essai gratuit pour tout solo neuf ou seulement l’ex-coaché ; devise ; taxes (Stripe Tax, TPS/TVQ).

### D2 — Entitlement en base

`subscriptions` étendue (plan, limite clients, `trial_ends_at`) + fonction `entitlement(user)` → actif / essai / expiré. Essai aussi à l’inscription solo.

### D3 — Edges

Remplacer les 410 : Checkout Sessions, portail client, webhook signé et idempotent → `subscriptions`. Secrets serveur uniquement, clés restreintes. Pas de `service_role` côté client.

### D4 — Mur doux

Solo expiré : lecture de ses données et **acceptation d’une invitation coach restent possibles** (porte de sortie du point 4). Coach au-dessus du palier : plus de nouvelles invitations, clients existants intacts.

### D5 — Télémétrie + tests

Paywall / checkout. Tests source-lock.

---

## Invariants (rappel, identiques à VISION)

- L’IA prépare, l’humain décide. Jamais d’auto-apply.
- Un seul agent in-app : `coach-agent` (OpenAI). `ask-second` / `suggest-client-plan` = 410.
- Un client = un coach actif.
- RLS partout. Migrations versionnées. new-JV = prod.
- FR + EN pour toute copie UI.
- Tests source-lock dans le même commit que le code qu’ils figent.
