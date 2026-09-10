# Chantier — Prometheus

**Statut :** plan de travail après la consolidation de septembre 2026. Validé pour exécution le 6 septembre 2026.
**Ne remplace pas** `docs/VISION.md` : la vision reste la source de vérité produit. Ce fichier dit **dans quel ordre** on la construit, et ce qui est déjà livré.

> Un agent qui ouvre le repo lit `VISION.md` puis celui-ci. Si les deux se contredisent, c’est `VISION.md` qui gagne, et ce fichier doit être corrigé.

---

## État au 10 septembre 2026 (soir — #68 mergée, edges live via Management API)

### Mergé / Livré dans `new-JV` (prod Netlify → `tracker.prometheus-fit.com`)

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
| #58 | Programme vivant solo (self-coach) |
| #59 | `loop_context` ; `/coach/learned` |
| #60 | Historique check-in, pas, realtime, diffs kcal/Relancer |
| #62 | Restes invite/setup (bannière sans nom, toast, ops Setup) |
| #64 | Copilote OpenAI sur **`gpt-5.6-luna`** (`DEFAULT_OPENAI_MODEL`, `max_completion_tokens`) |
| #65 | **Chantier A** : Setup garder vs ISSN ; `weeklyNutritionWhy` ; `payload.why` ; `joursDispo` éditeur ; accusé PAR-Q |
| #66 | Docs : Chantier A fait, Luna en prod, cycle 0 joué |
| #67 | **Recherche aliments & exercices** : recherche as-you-type (debounce 280ms), DB + Open Food Facts en parallèle (fin du blocage), ranking multicritère (`pickerSearch.ts`), repli mondial OFF, alias FR/EN d'exercices (`bp`, `rdl`, `sdt`, `fentes`, muscles traduits), migration `20260907222909_food_search_rank.sql` (pg_trgm) appliquée en prod |
| #68 (mergée) | **Audit 10 sept. — 30 constats corrigés en 7 lots** (S01–S05, D01–D07, I01–I05, C01–C04, Q01–Q07, E01–E02 fondations). Détail ci-dessous. |

### PR #68 — lots d'audit (branche `cursor/audit-securisation-425e` → `new-JV`)

| Lot | Contenu | Migrations prod |
|---|---|---|
| 1 (P0) | S01 `batch-verify-exercises` → 410 ; S02 attributions via `assign_program_secure` ; S03 `get_my_coach_card` ; S04 exercices `created_by`+`verified=false` ; S05 caches/brouillons/minuteurs par compte | `20260910044211` ✅ |
| 2 | D01 RPC unique `create_program_complete` ; D02 `apply_intervention` (effets exactement une fois) ; D03 erreurs visibles ; I05 snapshot + leçons ; C02 messagerie idempotente | `20260910044922`–`20260910045006` + `20260910153000` ✅ |
| 3 | D04 contrat portions ; D05 `created_by` cache food ; D06 OFF explicite ; I03 fenêtre 14 j ; I04 signaux déclarés | `20260910051141`–`20260910052800` ✅ |
| 4 | I01 fallback exact + validation modèle ; I02 patch par ID + aperçu + fork + version | `20260910053617` ✅ |
| 5 | D07 file offline (dead-letter, mapping persisté) ; C01 360 temps réel ; C03 `close_coach_account` ; C04 archives ; Q01 rappels | `20260910054330`–`20260910060246` ✅ |
| 6 | Q02 fichiers ; Q03 unités/langue ; Q04 modale ; Q05 lazy routes ; Q06 CI edges (manifeste + dirs + JWT + inventaire) + matrice RLS staging ; Q07 télémétrie | `20260910061018`–`20260910061036` ✅ |
| 7 | **E01/E02 fondations** : révisions immuables + snapshots ; contrat intake versionné. Pas le versionnage semaines/blocs ni le questionnaire dynamique (chantier B). | `20260910063138`–`20260910064501` ✅ |

### ⚠️ Étapes ops (après #68)

1. **Edges — redéployées via Supabase Management API** (connexion authentifiée ChatGPT, **pas** une preuve CLI, pas de `SUPABASE_ACCESS_TOKEN` transmis) :
   - `coach-fleet-round` **v31 → v32**, `ACTIVE`, `verify_jwt=false`, `import_map` `deno.json`, SHA `b902f8524779cc2c6232e3846c223368b9a55c76f3eb266ea08f79d1c054fe2e` (identique au bundle audité).
   - `coach-agent` **v24 → v25**, `ACTIVE`, `verify_jwt=true`, `import_map` `deno.json`, SHA `5a90a069db764b90414c37da53d2e59db9a89313380a39ec87569c65593f83b6` (identique au bundle audité).
   - Smokes non destructifs : fleet OPTIONS **200** + POST sans JWT / JWT invalide / faux `X-Webhook-Key` → **401** `unauthorized`. `coach-agent` : POST sans JWT / JWT invalide / GET → **401** gateway (`UNAUTHORIZED_NO_AUTH_HEADER` / `UNAUTHORIZED_INVALID_JWT_FORMAT`).
   - **Limite du canal Management API** : le bundle `coach-agent` live est un wrapper gzip + `btoa()`. Le source Unicode (FR) fait crasher le worker au boot (`InvalidCharacterError` Latin1). OPTIONS **500** `WORKER_ERROR` (preflight navigateur). Les POST authentifiés qui atteindraient le worker échoueraient de la même façon. Ce n’est **pas** un écart de SHA. Le correctif n’est pas un patch Git : déployer les sources Git **via CLI** (sans ce wrapper). PR **#69** = workflow manuel optionnel, **draft**, secret GitHub non validé — ne pas merger tant que le workflow + le secret n’ont pas été joués. Dépôt privé GitHub **Free** : pas d’Environments ; le job lit le secret **repo** `SUPABASE_ACCESS_TOKEN`.
2. **Rappels cron** : poser le secret `REMINDERS_CRON_SECRET` (valeur transmise hors git) dans Vault **et** dans les secrets de `send-daily-reminders`, vérifier les secrets VAPID, puis jouer `supabase/cron/schedule_daily_reminders.sql`.
3. **Protection de branche** : protéger `new-JV` (reviews + CI verte requises) — non faisable via API ici.
4. **Matrice RLS** : job CI `rls-matrix` (`supabase start` + `scripts/run-rls-matrix.mjs`) **vert** post-merge #68. Rejouer aussi sur une branche staging après chaque changement de policy / RPC DEFINER.

## E01 / E02 — fondations, pas le produit annoncé

- **E01 (révisions)** : table `program_revisions`, snapshots à chaque save structurel, fork/adopt. Suffit à ne pas écraser l’historique. **Manque** le versionnage semaines/blocs (cycles, deload, bascule de phase) — hors de #68.
- **E02 (questionnaire)** : ids sémantiques stables, `INTAKE_VERSION`, bac `custom` non interprété. **Pas** le builder coach ni le rendu dynamique par définition — c’est le chantier B.

### Drafts orphelins

- [#50](https://github.com/Jayvy2002/prometheus-tracker-app/pull/50) — **fermée** (6 sept.) : restes dans #62.
- [#42](https://github.com/Jayvy2002/prometheus-tracker-app/pull/42) — **fermée** (6 sept.) : « vider le tracker solo » est contraire à la vision.

### Prod (`phyuijjekxtjvipjtdfv`, snapshot 10 sept. soir)

- Edges : `coach-agent` **v25** (SHA audité, wrapper Management API — worker crash `btoa`/Latin1, voir ops) ; `coach-fleet-round` **v32** (SHA audité, worker OK) ; `notify-onboarding-complete` **v21** ; `analyze-product` **v14** ; `verify-exercise` **v12** ; `delete-account` **v8** ; `send-daily-reminders` **v10** ; `batch-verify-exercises` **v7** (410).
- **Modèle OpenAI :** le code défaut est `gpt-5.6-luna` (`resolveOpenAiModel` : override → secret `OPENAI_MODEL` → défaut). Un secret `OPENAI_MODEL` n’est pas nécessaire — la clé `OPENAI_API_KEY` suffit. Logs Edge 7 sept. : `openai_chat` → `model: gpt-5.6-luna` (0 appel `gpt-4o-mini` sur 24 h). Si un jour les logs montrent autre chose, c’est qu’un secret `OPENAI_MODEL` a été posé.
- Cycle réel joué (7 sept.) : solo intake → programme IA → accepter → séance ; coach invite → Setup ISSN → tournée → Envoyer → le client voit les kcal + le message.
- Tournée `cron` `0 4 * * *` active, 100 % déterministe. Cron rappels : fonction `invoke_send_daily_reminders` en place, schedule à jouer après pose du secret (voir étapes ops).
- Tests : **411/411** (`npm test`), `typecheck` + `lint` verts, `verify:edges` (manifeste + dirs + JWT + lock déployé ; live si token), `verify:migrations` (Git = lock, 29 audit + `20260910153000`), job CI `rls-matrix` (staging-like `supabase start` PG17).
- Advisors : **0 erreur**. Index FK ajoutés (12), initplan corrigés (7), trigger historique revoké. Restent (acceptés, documentés) : `SECURITY DEFINER` exposés = par design (RPC étroites vérifiées) ; `pg_trgm`/`pg_net` dans `public` (posture Supabase par défaut — déplacement risqué sans staging) ; paires de policies SELECT permissives (OR correct, fusion reportée après tests RLS) ; index « inutilisés » (base quasi vide, signal non significatif) ; `ai_usage_logs` sans policy cliente (journal serveur, refus voulu).
- **HIBP / leaked passwords :** warning Auth toujours là. Org **Free** (`Prometheus fitness`) — la protection HaveIBeenPwned est **Pro+**, pas activable aujourd’hui. **Rien n’est compromis** : tous les comptes présents sont des comptes de test. À cocher au passage Pro : [Auth → Email](https://supabase.com/dashboard/project/phyuijjekxtjvipjtdfv/auth/providers?provider=Email).

---

## Étape 0 — Fermer la consolidation

**Faite.** Plus rien à attendre ici avant B.

1. **Fait** — #58, #59, #60, #62, #64, #65 mergées. Netlify déploie à chaque merge.
2. **Fait** — `coach-agent` **v22** en prod (`phyuijjekxtjvipjtdfv`) : `loop_context` / self-coach / Luna, `verify_jwt` true. `coach-fleet-round` **v25** (déterministe, `payload.why`).
3. **Fait** — restes #50 dans #62. #50 et #42 fermées.
4. **HIBP :** pas activable sur le plan Free. Comptes = test, rien de compromis. À faire au passage Pro.
5. **Fait (7 sept.)** — cycle prod : solo → intake → programme proposé → accepter → séance ; coach → tournée → Envoyer → le client voit.

---

## Ordre des chantiers

**0, A et audit (#68) faits → B → C → D.** Le transversal restant (écran télémétrie, fusion des policies permissives) se glisse entre deux. E01 (semaines/blocs) et E02 (builder questionnaire) restent des **fondations** : le produit annoncé est le chantier B.

B et C rendent l’acquisition de coachs possible. D attend une décision de prix et des utilisateurs réels — « gratuit tant que le produit n’est pas parfait » reste vrai.

Hors scope de ces chantiers : changer le north star, un second agent, désactiver le RLS, auto-apply.

---

## Chantier A — Macros coaché (VISION point 5 + 8)

**Fait — #65** (mergé 7 sept.). Trigger `protect_coach_nutrition_targets` inchangé. Jamais d’auto-apply.

### A1 — Garder ou écraser (point 8)

Setup d’un profil qui a déjà des cibles (≥ 800 kcal) : radios **Garder** (défaut, aucune écriture) vs **Écraser ISSN**. Nouveau coaché (macros vides) : ISSN prérempli, case d’écriture décochée. Éditer les chiffres après « Garder » coche la case.

### A2 — Le « pourquoi »

`weeklyNutritionWhyKey(reason, 'self' | 'coach')` : le solo garde `soloReview.*` (tutoiement), le coach lit `weeklyWhy.coach.*`. Les cartes `calorie_adjustment` portent `payload.why` (from / to / delta / …). Vieilles cartes sans `why` : fallback `cause`. Fleet **v25** en prod écrit `why`.

### Tests

`weeklyNutritionWhy`, `coachOwnedTargets`, lock de copy fleet.

---

## Transversal — à glisser entre deux chantiers

- **Fait (#65)** — `joursDispo` pré-rempli dans l’éditeur manuel de programme ; accusé de réception d’un drapeau médical avant Envoyer Setup.
- **Fait (#67)** — Recherche aliments & exercices unifiée : recherche as-you-type (debounce 280ms), DB + Open Food Facts en parallèle (fin du blocage mutuel), scoring multicritère (`pickerSearch.ts`), aliases d'exercices (`bp`, `rdl`, `sdt`, `fentes`, muscles traduits), migration `20260907222909_food_search_rank.sql` (`pg_trgm`) appliquée en prod.
- **Fait (#68)** — Audit 30 constats. E01/E02 livrés comme **fondations** : révisions programme immuables + snapshots ; contrat intake (`INTAKE_VERSION`, ids stables, bac `custom`). **Pas livré** : versionnage semaines/blocs, builder de questionnaire dynamique (chantier B).
- Écran de lecture télémétrie coach/admin. `product_events` n’a aujourd’hui qu’une policy INSERT.
- Plus tard : fusion des paires de policies SELECT permissives (OR correct, micro-perf) après tests RLS (`supabase/tests/rls_matrix.sql`) ; déplacement `pg_trgm`/`pg_net` hors `public` avec staging ; formats de prescription (`reps` vs durée) ; historique visuel des révisions ; file offline au-delà des séances.

---

## Chantier B — Builder de questionnaire par coach (VISION point 9)

**Le plus structurant.** 27 questions aujourd’hui en dur dans `src/lib/kinesiologyIntake.ts` (libellés FR/EN, options, 9 écrans, jsonb `kinesiology_intake`, `compactIntake` côté agent, drapeaux PAR-Q, cibles solo dérivées).

### B1 — Données

Table `coach_questionnaires (coach_id, name, version, questions jsonb, is_default)`.

Schéma d’une question : `id`, `type` (`single` | `multi` | `text` | `number` | `yes_no` | `weekdays`), `label_fr`, `label_en`, `options`, `required`, `medical_flag`, `maps_to`.

Le template = les 27, exporté depuis `kinesiologyIntake.ts`. Les **ids standards ne changent pas** : `compactIntake`, `medicalFlagIds`, `soloTargetsFromIntake`, `available_weekdays` continuent de marcher via `maps_to`. Socle déjà livré (#68, E02) : `INTAKE_VERSION`, `STANDARD_INTAKE_IDS`, `INTAKE_SEMANTIC_MAP` (+ extras), version préservée par `parseIntake`, `compactIntake` avec `contract_version` et bac `custom` non interprété (miroir `KNOWN_INTAKE_IDS` côté agent).

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
