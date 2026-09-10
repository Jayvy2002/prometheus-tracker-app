# Chantier — Prometheus

**Statut :** plan de travail après la consolidation de septembre 2026. Validé pour exécution le 6 septembre 2026.
**Ne remplace pas** `docs/VISION.md` : la vision reste la source de vérité produit. Ce fichier dit **dans quel ordre** on la construit, et ce qui est déjà livré.

> Un agent qui ouvre le repo lit `VISION.md` puis celui-ci. Si les deux se contredisent, c’est `VISION.md` qui gagne, et ce fichier doit être corrigé.

---

## État au 10 septembre 2026 (soir — audit 30 constats, PR #68 en cours)

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
| #67 | **Recherche aliments & exercices** : recherche as-you-type (debounce 280ms), DB + Open Food Facts en parallèle (fin du blocage), ranking multicritère (`pickerSearch.ts`), repli mondial OFF, alias FR/EN d'exercices (`bp`, `rdl`, `sdt`, `fentes`, muscles traduits), migration `20260907000001_food_search_rank.sql` (pg_trgm) appliquée en prod |
| #68 (cette PR) | **Audit 10 sept. — 30 constats corrigés en 7 lots** (S01–S05, D01–D07, I01–I05, C01–C04, Q01–Q07, E01–E02 fondations). Détail ci-dessous. |

### PR #68 — lots d'audit (branche `cursor/audit-securisation-425e` → `new-JV`)

| Lot | Contenu | Migrations prod |
|---|---|---|
| 1 (P0) | S01 `batch-verify-exercises` → 410 ; S02 attributions via `assign_program_secure` ; S03 `get_my_coach_card` ; S04 exercices `created_by`+`verified=false` ; S05 caches/brouillons/minuteurs par compte | `20260910000001_audit_p0_access` ✅ |
| 2 | D01 RPC programmes atomiques ; D02 claim/finalize décisions ; D03 erreurs visibles + intake séquencé ; I05 snapshot serveur + leçons gérables ; C02 messagerie idempotente + pagination | `20260910000002_audit_decision_atomicity` ✅ |
| 3 | D04 contrat portions unique ; D05 `created_by` cache food ; D06 OFF explicite (cgi plein texte, budget, timeout) ; I03 fenêtre 14 j + cibles effectives datées + durées réelles ; I04 signaux déclarés + modules suivis + profils protégés | `20260910000003_audit_engine_proof` ✅ |
| 4 | I01 fallback exact (jours/équipement/interdits) + validation modèle + NL-edit sans fallback destructeur ; I02 patch par ID + aperçu partagé + fork + version | `20260910000004_audit_program_fork` ✅ |
| 5 | D07 file offline séances (ids stables, rejeu idempotent) ; C01 fiche 360 temps réel + fraîcheur ; C03 `close_coach_account` + `delete-account` v7 ; C04 archives + adoption ; Q01 rappels (statuts réels, modules, langue) | `20260910000005_audit_continuity`, `20260910000006_audit_reminders_invoke` ✅ |
| 6 | Q02 fichiers (validation, limites buckets, liens renouvelés) ; Q03 unités/langue ; Q04 modale + switches ; Q05 lazy routes (820 kB vs 1619), programmes 1 requête, pagination séances ; Q06 CI edges + manifest + matrice RLS ; Q07 télémétrie minimisée + `docs/TELEMETRY.md` | `20260910000007_audit_hardening` ✅ |
| 7 | E01 révisions immuables + snapshots ; E02 version intake + ids sémantiques + `custom` non interprété ; durcissement (revoke trigger, index FK, initplan) | `20260910000008_audit_program_revisions`, `20260910000009_audit_revision_snapshots` ✅ |

### ⚠️ Étapes ops REQUISES après merge (ne pas oublier)

1. **Edges à redéployer en CLI** (le déploiement API échoue sur ces fonctions à cause d'un chemin import-map stale côté plateforme — bug constaté, versions actuelles intactes) :
   ```bash
   supabase functions deploy coach-fleet-round --no-verify-jwt   # v26 : règles I03/I04 (sinon v25 + triage v2 = OK déterministe)
   supabase functions deploy coach-agent                          # leçons désactivées + contraintes I01/I02
   ```
   Déjà déployés via API : `batch-verify-exercises` v6 (410), `delete-account` v7, `send-daily-reminders` v9.
2. **Rappels cron** : poser le secret `REMINDERS_CRON_SECRET` (valeur transmise hors git) dans Vault **et** dans les secrets de `send-daily-reminders`, vérifier les secrets VAPID, puis jouer `supabase/cron/schedule_daily_reminders.sql`.
3. **Protection de branche** : protéger `new-JV` (reviews + CI verte requises) — non faisable via API ici.
4. **Matrice RLS** : jouer `supabase/tests/rls_matrix.sql` sur staging à chaque changement de policies.

### Drafts orphelins

- [#50](https://github.com/Jayvy2002/prometheus-tracker-app/pull/50) — **fermée** (6 sept.) : restes dans #62.
- [#42](https://github.com/Jayvy2002/prometheus-tracker-app/pull/42) — **fermée** (6 sept.) : « vider le tracker solo » est contraire à la vision.

### Prod (`phyuijjekxtjvipjtdfv`, snapshot 10 sept. soir)

- Edges : `coach-agent` **v22** (v23 en attente : CLI) ; `notify-onboarding-complete` **v20** ; `analyze-product` **v13** ; `verify-exercise` **v11** ; `coach-fleet-round` **v25** (v26 en attente : CLI — v25 + triage v2 reste déterministe et correct) ; `delete-account` **v7** (transition coach) ; `send-daily-reminders` **v9** (modules + langue) ; `batch-verify-exercises` **v6** (410, trou S01 fermé).
- **Modèle OpenAI :** le code défaut est `gpt-5.6-luna` (`resolveOpenAiModel` : override → secret `OPENAI_MODEL` → défaut). Un secret `OPENAI_MODEL` n’est pas nécessaire — la clé `OPENAI_API_KEY` suffit. Logs Edge 7 sept. : `openai_chat` → `model: gpt-5.6-luna` (0 appel `gpt-4o-mini` sur 24 h). Si un jour les logs montrent autre chose, c’est qu’un secret `OPENAI_MODEL` a été posé.
- Cycle réel joué (7 sept.) : solo intake → programme IA → accepter → séance ; coach invite → Setup ISSN → tournée → Envoyer → le client voit les kcal + le message.
- Tournée `cron` `0 4 * * *` active, 100 % déterministe. Cron rappels : fonction `invoke_send_daily_reminders` en place, schedule à jouer après pose du secret (voir étapes ops).
- Tests : **402/402** (`npm test`), `typecheck` + `lint` verts, `verify:edges` (13/13 bundlent), build 820 kB initiaux (246 kB gzip) contre 1619 kB avant lazy.
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

**0, A et audit (#68) faits → B → C → D.** Le transversal restant (écran télémétrie, fusion des policies permissives, finitions E01) se glisse entre deux.

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
- **Fait (#67)** — Recherche aliments & exercices unifiée : recherche as-you-type (debounce 280ms), DB + Open Food Facts en parallèle (fin du blocage mutuel), scoring multicritère (`pickerSearch.ts`), aliases d'exercices (`bp`, `rdl`, `sdt`, `fentes`, muscles traduits), migration `20260907000001_food_search_rank.sql` (`pg_trgm`) appliquée en prod.
- **Fait (#68)** — Audit 30 constats : accès P0, atomicité, preuves datées, file offline, continuité coach, fichiers, a11y de base, lazy routes (820 kB initiaux), CI edges, télémétrie minimisée (`docs/TELEMETRY.md`), révisions programmes, contrat questionnaire E02.
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
