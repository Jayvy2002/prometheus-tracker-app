# Audit produit — Prometheus (new-JV)

**Pour :** Jayvy (Jean-Vincent Ruiz), kinésiologue, Montréal  
**Date :** 31 août 2026  
**Source de vérité :** `origin/new-JV` @ `a714e3f` (« Check-in optionnel à l’accueil + sliders 0–10 »)  
**Ce fichier remplace** `AUDIT_AMELIORATIONS.md` (avril 2026, tracker solo). Ne pas copier cet ancien plan.

Audit code + UX, pas une réécriture. Rien n’a été mergé, rien n’a été « amélioré » au passage.

---

## TLDR

La colonne vertébrale coach est déjà la bonne : **Second (agent in-app) prépare → toi tu édites / tu envoies → rien ne s’applique tout seul**. Relancer avant les cibles est codé dans `coachFleet.ts`. Les 5 onglets coach (Aujourd’hui / Clients / Programmes / Messages / Prometheus) et la File du jour existent. Côté client, la séance du jour est en haut, le check-in n’est plus forcé, l’invite-only tient.

Le trou qui casse la north star **aujourd’hui**, pas dans six mois : **les kcal/macros ne sont pas vraiment à toi**. Un client ouvre Profil → Objectifs → Enregistrer et `GoalsForm.handleSave` réécrit `daily_calorie_target` + P/C/F. Le schéma met **2000 kcal par défaut**. Le RLS « Users can update own profile » ne protège pas ces colonnes.

Ensuite, sur le téléphone client : Messages, Photos et Mon programme sont dans la SideNav desktop, **absents de la BottomNav**. Sur le coach : ouvrir le programme depuis le 360 **écrit en live**, sans brouillon/envoi.

Live `tracker.prometheus-fit.com` (`main`) est **l’ancien tracker**. Cet audit est new-JV. L’écart live ne bloque le produit coaching que si tu pilotes tes clients sur main — ne pas y coller ces findings.

---

## North star (rappel, on ne la discute pas)

- Plateforme de coaching boostée IA. **Pas un CRM. Pas un éditeur calories.**
- Second repère, prépare l’action. Toi tu acceptes / édites / envoies. **Rien ne s’auto-applique.**
- Adhérence d’abord (**Relancer**) avant de toucher aux cibles. Un draft kcal, s’il est justifié, est **complet** (kcal + P/C/F).
- 3 écrans coach du quotidien : Command Center / Client 360 / Workspace. Nav : Aujourd’hui, Clients, Programmes, Messages, Prometheus.
- Fiche client : Vue d’ensemble, Entraînement, Progression, Check-ins, Santé & récupération, Notes.
- Promesse : plus de clients, même qualité. Simplicité Hevy + dossier Hexfit + copilote.
- Clients **par invitation coach seulement**. Login coach ≠ login client.
- Gratuit pour l’instant. Toi = premier user / head coach.

---

## Déjà vrai sur new-JV (ne pas re-litiger)

| Promesse | Où c’est dans le code |
|---|---|
| Invite-only client | `AuthPage.canRegister = fromInvite \|\| role === 'coach'` ; RPC `set_coaching_role` refuse `'client'` (`20260825000004_set_coaching_role_client_via_invite_only.sql`) ; le rôle client passe par `accept_coach_invite` |
| Login coach / client distinct (même shell, 2 portes) | `AuthPage` step `'role'` → `auth.coachEntry` / `auth.clientEntry` |
| Premier tap connexion | `clientLoginSubmitEnabled` ignore le bootstrap auth ; `AuthPage.handleSubmit` gate seulement `submittingRef` |
| 5 onglets coach | `SideNav` / `BottomNav` : `/dashboard` `nav.today`, `/clients`, `/programs`, `/messages`, `/prometheus` |
| Command Center + File du jour | `CoachDashboard` + `CoachTodayQueue` ; Relancer → `relanceThreadHref` → thread éditable, **jamais un send auto** |
| Rien ne s’auto-applique côté agent/fleet | `coach-fleet-round` + `_shared/coachAgent.ts` écrivent des `coach_interventions` **pending**. Apply = `setClientNutritionTargets` / `applyProgramOutline` / `sendCoachMessage` au send UI |
| Relancer avant cibles | `src/lib/coachFleet.ts` : flags adhérence → Relancer ; LLM pas appelé pour Relancer/kcal (`fleetCardNeedsLlm` = `program_adjustment` seulement) |
| Kcal fleet complets | `isCompleteCalorieDraft` + tests Marc/Sofia/Camille dans `coachFleet.test.ts` |
| Check-in plus forcé | `Dashboard` : CTA optionnel si `!todayCheckin`, pas de redirect |
| Accueil séance d’abord | `ClientGymCard` / `resolveClientGymCard` **avant** les anneaux |
| J1 calme | `isClientFirstRun` / `calmHome` ; plus de « 999 jours » |
| 0–10 + sliders | `CHECKIN_SCORE_MAX = 10`, `ScoreSlider` |
| kJ→kcal, recherche FR, rest timer, Mon programme, Photos (desktop), rescale édition | `openFoodFacts.ts`, `foodEnergy.ts`, `RestTimer`, `ClientProgramPage`, `ClientPhotosPage`, `EditFoodModal` |
| Tracker chrome caché au coach | `CoachTrackerRedirect` sur `/nutrition`, `/workout`, etc. ; FAB masqué si `isCoach` |
| Prometheus IA = coach only | `App.tsx` `/prometheus` wrappé `CoachOnly` |
| Setup client confirmé par le coach | `ClientSetupPage` écrit tracking / cibles / programme **au confirm** |
| Tests de régression coaching | 29 fichiers `src/lib/*.test.ts` (Relancer, fleet, roster, login, gym, chrome) — **zéro test de `coachingStore`** |

---

## Live (`main`) vs new-JV

`main` = PWA tracker solo (workouts, nutrition, scanner). new-JV = plateforme coach.  
**Bloquant seulement si** tes clients jouent encore sur le live. Sinon : ignorer main, shipper new-JV. Ne pas « reporter » les findings tracker d’avril sur new-JV.

---

## Findings

Légende : **P0** bloque la north star en usage réel · **P1** pourrit la journée coach ou client · **P2** polish.  
Cap : les 22 leviers qui valent un PR, pas une liste de goûts.

### A. Cibles, Relancer, « rien ne s’applique tout seul »

#### 1. P0 — Les kcal/macros ne sont pas coach-owned
- **Qui :** client (écriture) + coach (tu crois que tes cibles tiennent)
- **Où :** `GoalsForm.handleSave` (`src/components/profile/GoalsForm.tsx`) ; `ProfilePage` affiche l’accordéon Objectifs dès que `!isCoach` (donc **aussi** pour un athlète coaché) ; `profileStore.updateProfile` UPDATE brut ; RLS `"Users can update own profile"` (`20260327011533_initial_schema.sql` / `20260329195723_optimize_rls_policies_select_auth_uid.sql`) ; `user_profiles.daily_calorie_target integer DEFAULT 2000`
- **Pourquoi :** Toi tu envoies des cibles via `coach_set_client_nutrition_targets` (RPC étroit, ISSN, brouillon complet). Le client ouvre Profil → Objectifs → sauve un poids cible → `calculateCalorieTarget` + `calculateMacros` **écrase** kcal/P/C/F. Le 2000 par défaut du schéma est une cible inventée dès l’invite, avant ton setup. Ça transforme Prometheus en éditeur calories côté athlète.
- **Action :** Pour un athlète lié, interdire l’écriture de `daily_calorie_target` / `protein_target` / `carbs_target` / `fat_target` (UI + trigger/RLS). NULL (pas 2000) tant que tu n’as pas Envoyé. Masquer les anneaux si pas de cible envoyée.

#### 2. P1 — Brouillon kcal incomplet = impasse (pas un éditeur, une carte morte)
- **Qui :** coach
- **Où :** `InterventionDraftPage` (`showCalories` / `incompleteCals`) ; `isCompleteCalorieDraft` ; copy `coaching.fleet.noCalorieEditor`
- **Pourquoi :** La north star exige un draft **complet** s’il y a kcal — et refuse un éditeur calories. Le code fait les deux à la fois : il **cache** les 4 champs si P/C/F = 0, **et** bloque Envoyer. Fleet produit des drafts complets ; Ask / agent peut en laisser un incomplet. Toi tu lis l’avertissement et tu ne peux pas finir la proposition.
- **Action :** Garder le lock « pas d’éditeur libre ». Sur `calorie_adjustment` incomplet : afficher **les 4 champs ISSN à compléter** (même formulaire que le draft complet), ou rétrograder la carte en Relancer à l’ingest agent.

#### 3. P1 — Inbox : un tap Envoyer applique les macros
- **Qui :** coach
- **Où :** `CoachInboxPage.handleSendCard` → `setClientNutritionTargets` ; `InterventionInboxCard.primaryIsSend` si `calorie_adjustment && completeCals`
- **Pourquoi :** Relancer one-tap (message préparé, encore éditable via Modifier) est OK. Kcal one-tap **écrit les cibles du client** sans passer par `InterventionDraftPage`. Tu peux envoyer les chiffres fleet sans les relire. Ce n’est plus « acceptes ou édites puis envoies ».
- **Action :** CTA primaire kcal = **Ouvrir le brouillon**. Relancer peut rester one-tap + Modifier.

#### 4. P1 — « Ouvrir le programme » depuis le 360 mute en live
- **Qui :** coach (+ client à la séance suivante)
- **Où :** `ClientDetailPage` `navigate(\`/programs/${assignment.program_id}\`)` ; `ProgramEditorPage.handleSave` → `updateProgram` / `syncProgramDays` — **aucun** `coach_interventions`
- **Pourquoi :** Un changement de séries/reps que tu sauves dans la bibliothèque est déjà le programme de l’athlète. Pas de proposition, pas d’Envoyer, pas de leçon agent. Ça contredit « rien ne s’auto-applique » plus fort qu’un CRM.
- **Action :** Depuis un programme **assigné**, ouvrir un brouillon `program_adjustment` / NL (le chemin `InterventionDraftPage` + `canSendProgramToClient`). La bibliothèque non assignée peut rester un save direct.

---

### B. Boucle coach (Command Center / 360 / Workspace)

#### 5. P1 — Rôle et ops coach fail-open au vide
- **Qui :** coach
- **Où :** `coachingStore.fetchMyRole` — ignore `error`, `catch` → `coachingRole: 'none'` ; `fetchCoachOps` — 12 `.in(ids)`, seul `trackingRes.error` est distingué, le reste `data ?? []`
- **Pourquoi :** Un blip réseau et tu n’es « plus coach » (écran Activer le mode coach). Un blip workouts et la File du jour Relance des gens qui ont déjà trainé. La File du jour n’est honnête que si le dossier l’est.
- **Action :** Distinguer erreur ≠ absence de row (toast + retry, ne pas downgrader le rôle). `fetchCoachOps` : si une query critique fail, banner « données partielles », pas une file fantôme.

#### 6. P2 — 7e onglet « Fiche » hors north star
- **Qui :** coach
- **Où :** `DEFAULT_COACH_VISIBLE_TABS` / `CoachClientTab` dans `src/lib/types.ts` ; `ClientDetailPage` `tab === 'profile'` → `ClientProfileEditor` ; `CoachSettingsPanel`
- **Pourquoi :** Spec = 6 onglets. **Fiche** est du chrome Hexfit-CRM en plus (identité, allergies, tracking). Utile, mais ça concurrence Vue d’ensemble et Setup.
- **Action :** Fusionner Fiche dans Vue d’ensemble (bloc repliable) ou le Setup. Default tabs = les 6.

#### 7. P2 — Couper le « mode file » enlève Relancer d’Aujourd’hui
- **Qui :** coach
- **Où :** `CoachDashboard` si `coachSettings.queue_mode_default === false` ; `CoachSettingsPanel`
- **Pourquoi :** La File du jour **est** Relancer. Le fallback priorités = `navigate(item.href)` sans CTA Relancer. Un toggle dans Profil (où tu vas pour les settings coach) peut casser la boucle du matin.
- **Action :** Garder Relancer sur les rows priorités, ou retirer le toggle.

#### 8. P2 — Workspace n’est pas un 3e écran top-level
- **Qui :** coach
- **Où :** `ExerciseWorkspace` (panneau dans l’onglet Entraînement du 360) ; `/prometheus` = `AskPrometheusPage` (5e nav)
- **Pourquoi :** La nav à 5 est conforme. Les « 3 écrans » du quotidien sont Aujourd’hui + 360 + (Workspace **ou** Prometheus). Prometheus est un Ask + drafts, pas le workspace exo. Pas cassé — juste facile de se perdre (« je bosse où ? »).
- **Action :** Ne pas créer un 6e écran. Depuis Ask, deep-link 360+workspace comme aujourd’hui ; copy Aujourd’hui : « la file, puis la fiche, tu envoies dans Messages ».

#### 9. P2 — Auth cron fleet encore branchée sur un secret Grok mort
- **Qui :** coach (coût / spam de cartes) + sécu
- **Où :** `supabase/config.toml` `[functions.coach-fleet-round] verify_jwt = false` ; `coach-fleet-round/index.ts` fallback `GROK_BOT_WEBHOOK_SECRET` ; cron `schedule_coach_fleet_round.sql`
- **Pourquoi :** Second/Grok bots sont abandonnés. Un secret legacy encore valide = tournée pour **tous** les coachs sans JWT. Pas un auto-apply (pending only), mais des drafts spam et de la facture OpenAI.
- **Action :** Exiger `FLEET_CRON_SECRET` dédié ; drop du fallback Grok ; JWT pour le bouton « Lancer la tournée » in-app (déjà `coach-agent` en JWT).

---

### C. Boucle client (aujourd’hui / log / check-in / photos)

#### 10. P1 — Téléphone : Messages, Photos, Mon programme introuvables
- **Qui :** client (mobile = le vrai usage salle)
- **Où :** `BottomNav` client = Accueil / Workout / Check-in / Nutrition / Profil. `SideNav` a `/messages`, `/photos`, `/programs` (`nav.myProgram`). `ProfilePage` n’a **aucun** lien vers ces 3. Banner messages accueil seulement si unread.
- **Pourquoi :** Hevy-simple = séance + ce que le coach a allumé. Photos « as assigned » et le fil Relancer sont au cœur du coaching. Un client qui a lu le message ne sait plus où répondre. Photos n’existe que md+.
- **Action :** 1 entrée claire sur mobile : soit 5e tab Messages (badge), soit un hub dans Profil (Messages / Photos / Mon programme). Aligner Bottom et Side.

#### 11. P1 — Tracking coach off, tracker encore allumé
- **Qui :** client
- **Où :** `ALL_ON_TRACKING` défaut store (`coachingStore.myTrackingConfig`) ; `resolveViewerTracking(null, true)` → `parseResolvedTracking(null)` → tout à `true` ; `/nutrition` etc. seulement `CoachTrackerRedirect` (bloque le **coach**, pas le module off) ; `fetchMyTrackingConfig` seulement après `startClientRealtime` (`AppLayout`, rôle `client`)
- **Pourquoi :** « Logger uniquement les variables que le coach a allumées. » Tant que tu n’as pas Confirmé le setup, **pas de row** → full tracker (kcal 2000, check-in, nutrition). Deep link `/nutrition` ignore `track_nutrition`. Flash ALL_ON avant le fetch.
- **Action :** Athlète coaché : défaut **tout off / inconnu** jusqu’au fetch. Redirect route si `!showModule`. Créer la row tracking à l’accept invite (tes defaults coach), pas à J+ n setup.

#### 12. P1 — Un client peut s’auto-promouvoir coach via `/clients`
- **Qui :** client (URL) — le toggle Profil est déjà caché si `isCoachedAthlete`
- **Où :** `App.tsx` `path="/clients"` **sans** `CoachOnly` ; `ClientsPage` si `coachingRole !== 'coach'` → `enableCoachMode` ; RPC `set_coaching_role` : `WHEN p_role = 'coach' THEN 'coach'` **même si** le user est déjà `client`
- **Pourquoi :** Invite-only + login séparé. Un athlète qui tape `/clients` active le mode coach, crée des invites, voit un roster. Le Profil a fait le job (`!coached`). La route non.
- **Action :** `CoachOnly` sur `/clients` (et `/clients/:id`). Garder `enableCoachMode` pour **toi** (premier siège) derrière un chemin que tu contrôles, pas derrière une URL client.

#### 13. P1 — Onboarding EN si l’invité ne tape pas « Passer »
- **Qui :** client FR
- **Où :** `App.tsx` : onboarding forcé si `!onboarding_completed && !deferClientOnboarding` ; `deferClientOnboarding` = `isOnboardingDeferred() && myCoach` (flag **manuel**) ; `OnboardingFlow` Step 1 : `title="About You"`, `placeholder="Your name"` — 7 steps en dur EN
- **Pourquoi :** L’invite pose un compte FR. S’il ne skippe pas, il prend un questionnaire tracker EN, qui calcule encore des cibles (voir #1). Tutoiement + i18n cassés sur le premier écran post-signup.
- **Action :** Invite + `myCoach` → defer auto (pas un bouton). Ou i18n de chaque step. Ne plus écrire kcal pendant cet onboarding client.

#### 14. P2 — SideNav client = chrome tracker solo
- **Qui :** client desktop
- **Où :** `SideNav` : `/calendar`, `/stats`, `/exercise-progress` `show: true` / `track_workouts`
- **Pourquoi :** Ce n’est pas Hevy-simple. Stats/calendrier sont le produit `main`, pas le dossier coach.
- **Action :** Si `isCoachedAthlete`, drop ces 3. Progression réelle = onglet 360 côté coach + graphiques que **toi** tu lis.

#### 15. P2 — Accueil : anneaux kcal + CTA check-in violet + WeeklyAdjustment
- **Qui :** client
- **Où :** `Dashboard` `todaySummary` (anneau, `?? 2000`) + bandeau check-in full-width violet ; `NutritionPage` rend `WeeklyAdjustment` **sans** guard `coached` (copy `coachDecides` OK, carte encore là)
- **Pourquoi :** Séance d’abord est vrai. En dessous, l’accueil redevient un journal macros. WeeklyAdjustment est une suggestion calorique sous les yeux du client alors que la north star dit que **toi** tu décides via une carte fleet.
- **Action :** Athlète coaché : anneaux seulement si cible **envoyée** + module on. Check-in = lien discret sous la gym card. `WeeklyAdjustment` : `if (coached) return null`.

#### 16. P2 — Login : une app Prometheus, un chip rôle
- **Qui :** client + toi
- **Où :** `AuthPage` même shell, `chooseRole('coach'|'client')`
- **Pourquoi :** « Login séparé » est un picker, pas une porte client (lien d’invite) vs une porte coach (`/auth?role=coach` ou sous-domaine). Suffisant pour un premier user. Fragile dès le 2e coach.
- **Action :** Plus tard : `/invite/:token` reste **la** porte client (déjà le cas en register). Login coach bookmarkable sans le chip « je suis client ».

---

### D. Santé du code, IA, i18n, tests

#### 17. P2 — `coachingStore` god-object (~1770 lignes), 0 test store
- **Qui :** les deux (régressions silencieuses)
- **Où :** `src/stores/coachingStore.ts` — rôle, invites, ops, fleet, messages, realtime, cibles, photos, notes, `commandStats` **stocké** (dérivé)
- **Pourquoi :** Les 29 tests `src/lib/*.test.ts` lockent Relancer/fleet/chrome par **lecture de source** (`coachChrome.test.ts`, `clientLiveBugs.test.ts`). `enableCoachMode`, `setClientNutritionTargets`, `fetchCoachOps`, accept invite : **pas couverts**. Un refactor store cassera la journée sans rouge.
- **Action :** Ne pas splitter le store dans un PR « cleanup ». Ajouter 4 tests mock Supabase : rôle error, targets RPC, send Relancer, tracking défaut coached. Puis extraire selecteurs `commandStats` / `priorities`.

#### 18. P2 — Stripe + docs tracker encore dans le repo
- **Qui :** toi (bruit de roadmap) + sécu billing fantôme
- **Où :** `supabase/functions/create-checkout-session|create-portal-session|stripe-webhook` ; `billingRole` dans le store ; i18n `premium.*` ; `CLAUDE.md` / `README.md` = tracker 2026 ; `AUDIT_AMELIORATIONS.md`
- **Pourquoi :** « Gratuit pour l’instant. » Aucun `functions.invoke` checkout côté UI. Le webhook peut encore muter `user_roles.role` si Stripe est configuré. `CLAUDE.md` pousserait un agent à reconstruire le tracker.
- **Action :** Quarantiner les 3 functions Stripe (ne pas les appeler). Pointer README/CLAUDE vers ce fichier. Ne **pas** coder Premium.

#### 19. P2 — Tutoiement cassé + EN dur
- **Qui :** les deux
- **Où :** `fr.ts` `common.tryAgain: 'Veuillez réessayer.'`, `profile.password.currentPlaceholder`, `profile.notifications.blocked` (« Vous pouvez… ») ; `OnboardingFlow` EN dur (voir #13) ; `ProfilePage` fallback `'User'`
- **Pourquoi :** Le chrome coach est tu (`coaching.command.subtitle`). Profil / erreurs vouvoient. Un client FR lit deux voix.
- **Action :** Sweep `Veuillez` / `Vous pouvez` / `votre mot de passe` → tu. Sortir l’EN d’OnboardingFlow.

#### 20. P2 — Ajout repas : pas le même rescale que l’édition
- **Qui :** client
- **Où :** `EditFoodModal` → `rescaleNutritionMacros` ; `FoodForm` `scale = grams/100` à la soumission, champs perçus /100 g
- **Pourquoi :** Le rescale édition est livré. L’ajout (le geste salle) reste un modèle mental « per 100 g ». Pas un blocker coaching, une source de logs faux → de fausses cartes Relancer nutrition.
- **Action :** Reprendre le live-rescale de `EditFoodModal` dans `FoodForm` (portion d’abord).

#### 21. P2 — `catch {}` vides sur programmes + rôle
- **Qui :** coach (save programme) / les deux (rôle)
- **Où :** `programStore.ts` 5× `catch {}` ; `fetchMyRole` (voir #5)
- **Pourquoi :** Un save programme qui throw = toast succès possible côté UI + rien en base. Tu crois avoir proposé.
- **Action :** Toast erreur sur `updateProgram` / `syncProgramDays`. Silent catch **uniquement** localStorage quota.

#### 22. P2 — Alias `ask-second` + `suggestClientPlan` mort
- **Qui :** coach (confusion copilote)
- **Où :** `COACH_AGENT_ALIAS_FUNCTION = 'ask-second'` ; `coachingStore.suggestClientPlan` (plus aucun appel composant) ; edge `suggest-client-plan/`
- **Pourquoi :** L’agent in-app s’appelle `coach-agent`. « Second » dans l’UI (`coaching.second.badge`) est le copilote — OK comme **nom produit**. Deux functions + un store mort = le prochain agent recâble Grok.
- **Action :** Un invoke (`coach-agent`). Soft-delete `suggest-client-plan`. Garder le mot « Second » dans le copy FR.

---

## Ne pas faire

- **Pas de CRM** (pipeline, tags, inbox commerciale, 12 onglets fiche).
- **Pas d’éditeur calories coach** (champs ISSN sur un brouillon ≠ un MacroFactor).
- **Pas d’auto-apply** fleet / WeeklyAdjustment / « Apply +100 kcal ».
- **Pas de chat IA client.** Second prépare, toi tu envoies.
- **Pas de Stripe / Premium / seats** tant que tu es le seul coach.
- **Pas de social, leaderboard, défis entre clients.**
- **Pas de roadmap tracker d’avril** (`AUDIT_AMELIORATIONS.md` : gamification, planificateur de repas, undo toast, widget dashboard).
- **Pas de suivre `CLAUDE.md` / `README.md` tels quels** — ils décrivent `main`, pas new-JV.
- **Pas de rewrite `coachingStore`** ni « split monorepo » dans le prochain PR.
- **Pas de recâbler Grok Bots / `GROK_BOT_WEBHOOK_URL`.**
- **Pas merger new-JV dans `main`** depuis cet audit. Live = ancien produit.
- **Pas toucher live/backup DB** pour « tester le RLS ».

---

## 3 PRs suivants (stackés sur new-JV, chacun shippable)

1. **Cibles à toi.** Athlète lié : plus d’écriture kcal/macros (GoalsForm + trigger/RLS). `NULL` au lieu de `DEFAULT 2000`. Anneaux masqués tant que tu n’as pas Envoyé. `WeeklyAdjustment` caché si coaché.
2. **Téléphone client.** `CoachOnly` sur `/clients`. Hub mobile Messages + Photos + Mon programme (BottomNav ou Profil). Routes tracker gated `showModule` ; défaut coached = caché jusqu’au fetch ; row tracking créée à l’invite.
3. **Envoyer = seule porte d’écriture coach.** Programme **assigné** → brouillon `program_adjustment`, pas `ProgramEditorPage.handleSave`. Inbox kcal : primaire = Ouvrir le brouillon. Draft kcal incomplet : 4 champs ISSN à finir, ou Relancer.

---

## Méthode

Lu, pas deviné : `src/App.tsx`, `SideNav` / `BottomNav` / `AppLayout`, `CoachDashboard`, `CoachTodayQueue`, `ClientsPage`, `ClientDetailPage`, `InterventionDraftPage`, `CoachInboxPage`, `ProgramEditorPage`, `AskPrometheusPage`, `ClientSetupPage`, `Dashboard`, `AuthPage`, `InvitePage`, `OnboardingFlow`, `GoalsForm`, `ProfilePage`, `NutritionPage`, `WeeklyAdjustment`, `FoodForm`, `CheckInPage`, `ClientPhotosPage`, `ClientProgramPage`, `ClientMessagesPage`, `coachingStore.ts`, `clientTracking.ts`, `coachFleet.ts`, `coachQueue.ts`, `coachAgent.ts`, `coachInterventions.ts`, `coachRole.ts`, `i18n/locales/fr.ts`, migrations coaching août 2026, `config.toml`, edge `coach-agent` / `coach-fleet-round` / `ask-second`.  
Relu `AUDIT_AMELIORATIONS.md` (avril) : **hors sujet** (rétention, undo, scanner vision, macros % vs g/kg — ce dernier est déjà ISSN dans `calculateMacros`).

---

*Audit new-JV 31 août 2026. Pas de rewrite. PR doc only.*
