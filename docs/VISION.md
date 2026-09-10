# Vision produit — Prometheus

**Statut :** source de vérité produit. Validée par Jayvy le 2 septembre 2026.
**Remplace :** `docs/AUDIT_PRODUIT_2026-08-31.md` et `AUDIT_AMELIORATIONS.md` (supprimés). Leurs « north stars » — un seul coach, solo = legacy, jamais de Premium — étaient fausses. Ne pas les réintroduire.

> Tout agent ou dev qui lit ce repo part d'ici. Si le code contredit ce fichier, c'est le code qui est en retard (voir « Aujourd'hui vs cible »), pas la vision.
>
> **Ordre de construction et état des PR :** `docs/CHANTIER.md`. Si les deux se contredisent, c’est ce fichier qui gagne, et `CHANTIER.md` doit être corrigé.

---

## North star

> **Prometheus est un moteur de coaching intelligent pour l'entraînement de force et de physique — musculation, bodybuilding, powerlifting — en anglais et en français.**
> **Il comprend l'athlète, construit son plan, observe ce qui se passe et propose comment le faire évoluer.**
> **En solo, l'athlète valide les décisions. Avec un coach, Prometheus prépare les décisions et le coach les valide.**

EN : *Prometheus is an AI-powered coaching engine for strength and physique training. It helps bodybuilding, powerlifting and strength coaches manage individualized training and nutrition at scale — and gives solo lifters the same engine for self-coaching.*

(Validée le 4 septembre 2026. Remplace « SaaS fitness pour tous les coachs ».)

### Les trois briques du moteur

1. **Comprendre l'athlète** — intake, profil, historique complet (séances, nutrition, poids, check-ins, messages).
2. **Construire et faire évoluer le plan** — programme et cibles générés puis **vivants** : « je me suis blessé au genou », « je veux prioriser mes bras », « je passe à 4 séances » → avant → après → pourquoi → accepter / modifier / refuser. Pas une génération one-shot.
3. **Décider** — la tournée (coach) et le bilan hebdo (solo) : détecter ce qui change, proposer, expliquer.

**Un seul cerveau, deux niveaux d'autorité.** Le solo décide pour lui ; le coach décide pour ses clients. Le coach a toujours tout ce que le solo a, plus lui-même. On ne rend jamais le solo volontairement moins bon pour protéger les coachs : **Solo automatise, Coach augmente l'humain** — ce ne sont pas les mêmes clients.

### Segment

Musculation / bodybuilding / powerlifting, **EN + FR**. Autres disciplines plus tard. Le danger n'est pas la cannibalisation, c'est la **dispersion**. La formation de kinésiologue de Jayvy nourrit la qualité du moteur (PAR-Q, douleurs, blessures, mouvements à éviter) mais ne définit pas le marché.

### Modèle (cible, pas maintenant)

| Utilisateur | Qui paie |
|---|---|
| Solo | abonnement Prometheus |
| Coach | abonnement selon le nombre de clients |
| Client d'un coach | inclus avec son coach |

Un solo qui engage un coach Prometheus ne paie pas deux fois : son compte devient coaché, **son historique le suit** — c'est un argument de vente, pas un détail technique. Le solo est aussi le canal d'acquisition des coachs (B2C → B2B2C).

---

## Les 10 points

1. **Un moteur pour les coachs de force / physique et pour les solos** (voir North star et Segment). Pas un outil personnel. Jayvy est le premier coach utilisateur, pas le seul.
2. **Trois rôles officiels, tous supportés : Coach / Client coaché / Solo.** Aucun n'est « legacy ».
3. **Un solo crée son compte librement**, sans coach. Le solo est un produit complet : workouts, nutrition, scanner, poids, stats, recettes, streaks, calendrier.
4. **Un solo peut ajouter un coach via le lien de ce coach.** Le coach voit tout l'historique. **Un client dont le coach coupe le lien redevient solo, historique intact** : rôle → solo, modules tous rouverts, cibles conservées (il peut à nouveau les régler), programme mis en pause ; il voit un message « ton coach a mis fin à votre collaboration » et démarre une **période d'essai solo de 30 jours** (`solo_trial_ends_at`). Après l'essai, le compte sera bloqué sauf abonnement — **le blocage arrive avec le chantier billing**, pas avant (on n'enferme personne sans porte de sortie). Un client = un coach actif à la fois (recherche / changement de coach in-app = plus tard).
5. **Macros : calcul automatique pour tout le monde** à l'onboarding (BMR/TDEE/ISSN). Client coaché → **le coach décide** ; s'il veut changer quelque chose il en parle à son coach ou passe solo. Solo → il ajuste lui-même.
6. **Proposition hebdomadaire « garder / modifier ».** Un algorithme ou l'IA recalcule les objectifs kcal/macros **et explique pourquoi** (poids qui n'évolue pas dans le bon sens, trop vite, trop lentement). Condition : le client est **assidu** et sa **moyenne kcal/jour de la semaine respecte la cible** — sinon on relance, on ne touche pas aux chiffres. La proposition va **au coach** si coaché, **au client** si solo. Rien ne s'auto-applique.
7. **Le solo a un copilote.** Le client coaché n'en a pas : son coach en a un.
8. **Quand un solo rejoint un coach, le coach garde ou écrase ses cibles** selon son coaching.
9. **Questionnaire d'accueil.** Les 27 questions (`src/lib/kinesiologyIntake.ts`) sont **le standard pour les solos** et **le template des coachs**. Chaque coach peut partir du template ou bâtir le sien ; ses clients invités remplissent *son* questionnaire. Pour un solo, l'intake est **obligatoire à l'inscription**, reprenable là où il en était s'il ferme l'app ; l'IA lui propose ensuite un programme à partir de ses réponses, qu'il peut refuser pour faire le sien.
10. **Gratuit tant que le produit n'est pas parfait.** Stripe reste en quarantaine (410). « Pas de Premium » n'est pas une règle, c'est un « pas maintenant ». Le copilote IA est **par coach** aujourd'hui ; partagé ou par coach reste à trancher. **L'app collecte l'usage** (ce que coachs et clients utilisent, modifient, ignorent) pour piloter le produit.

---

## Les rôles

| | Coach | Client coaché | Solo |
|---|---|---|---|
| Entrée | Inscription libre (porte « coach ») | Lien d'invitation du coach (`/invite/:token`) | Inscription libre (porte « solo ») |
| Écran d'accueil | Command Center + File du jour | Séance du jour, attente programme, check-in, photos, messages du coach — **pas** de streak, rappels repas/eau, deload ni routines perso | Tracker complet + bilan hebdo du copilote |
| Barre mobile | Aujourd'hui · Clients · Programmes · Messages · Prometheus | Accueil · Séance · Check-in · Messages · Profil (photos = carte accueil + hub Profil) | Accueil · Séance · Check-in · Nutrition · Profil (+ hub « Explorer » : stats, progression, calendrier, poids, recettes, routines, photos) |
| Modules visibles | — | Ceux que le coach allume (`client_tracking_config`) : **défauts du coach dès l'invitation** (tout ON s'il n'a rien réglé), affinés au setup | Tous |
| Kcal / macros | Décide pour ses clients | Calculées puis pilotées par le coach, lecture seule | Calculées, ajustables par lui |
| Proposition hebdo | Reçoit les brouillons de la tournée | Aucune (son coach les reçoit) | Reçoit celle de son copilote |
| Questionnaire | Bâtit le sien (template 27 q) | Celui de son coach | Les 27 questions, obligatoire |
| Copilote IA | Oui (`coach-agent`, fleet) | Non | Oui — bilan hebdo + self-coach (`onboarding_plan` / `program_nl_edit` sur soi) |
| Programme | Bibliothèque + assignation | Assigné par le coach | Routines + programme IA proposé (même moteur, refusable) |

---

## Aujourd'hui dans le code vs cible

| Sujet | Code (branche new-JV) | Cible | État |
|---|---|---|---|
| Inscription solo | Rouverte : porte « solo » dans `AuthPage` (`authDoorCanRegister`) | Libre | ✔ |
| Client par invitation | `accept_coach_invite` seul chemin vers le rôle `client` | Idem | ✔ |
| Solo → coach | Un compte existant accepte une invite ; historique visible via `is_coach_of` ; tracking seedé avec les défauts du coach | Idem | ✔ |
| Coach → solo (fin de lien) | `end_coach_client_link` : rôle `none`, tracking config retirée, programme en pause, cibles conservées, `coach_link_ended_at` + essai 30 j ; le client repasse solo en direct (realtime `user_profiles`) et voit la bannière | Idem + blocage post-essai avec le billing | ✔ (mur : chantier billing) |
| Accueil coaché | Séance, attente programme (aussi pour un ex-solo), check-in, carte Photos, messages ; plus de streak / deload / rappels / routines | Idem | ✔ |
| Nav mobile | Coaché : Accueil · Séance · Check-in · Messages · Profil. Solo : hub « Explorer » dans Profil (stats, progression, calendrier, poids, recettes, routines, photos) ; Messages caché sans coach | Idem | ✔ |
| Macros coaché | Setup pré-remplit ISSN ; ex-solo : radios Garder vs Écraser ISSN ; écriture coach-only (`protect_coach_nutrition_targets`) ; anneaux masqués jusqu'à Envoyé | Calcul auto, **puis** coach-only ; ex-solo : garder ou écraser explicitement | ✔ (#65) |
| Macros solo | Calculées à la fin de l'intake (Mifflin-St Jeor + activité + objectif, protéines ISSN), éditables dans `GoalsForm` | Idem | ✔ |
| Proposition hebdo coach | `coach-fleet-round` : Relancer si non assidu, brouillon kcal complet sinon ; 100 % déterministe ; FR/EN du coach ; `payload.why` via `weeklyNutritionWhyKey` (même mapping que le solo) | + phrase d'explication partagée avec le solo | ✔ (#65) |
| Proposition hebdo solo | `SoloWeeklyReview` : mêmes règles que la tournée (`proposeWeeklyNutrition`) sur 14 j ; assiduité d'abord sinon relance ; sinon nouvelle cible **+ le pourquoi** ; Appliquer / Garder ; une décision / semaine | Idem | ✔ |
| Intake | 27 q standard ; mur pour tout nouveau compte ; brouillon à chaque écran ; solo finit sur « Tes cibles » | Builder par coach | ✔ ; chantier B |
| Intake → IA | `coach-agent` lit `kinesiology_intake` (compacté) ; `objectifType` → `goal` ; filet déterministe honore séances / jours ; `loop_context` (messages, notes, check-ins, photos dates+kinds) | L'agent voit les réponses **et** la boucle | ✔ (#59) |
| Drapeaux médicaux | Badge roster + fiche 360 + Setup ; carte PAR-Q à « Oui » ; accusé avant Envoyer Setup | Visibles avant d'envoyer + accusé | ✔ (#65) |
| Programme IA solo | Même moteur (`onboarding_plan` / `program_nl_edit`, JWT + RLS self-coach) ; proposition avant / après / pourquoi ; Accepter assigne, Refuser → routines | Idem | ✔ (#58) |
| Check-in / pas / live | Historique 14 j ; `StepsTracker` ; realtime `program_days` / lifts / photos ; diffs kcal/Relancer | Idem | ✔ (#60) |
| Billing | Stripe ×3 en 410 ; `solo_trial_ends_at` posé, aucun mur | Gratuit pendant la construction | ✔ ; chantier D |
| Télémétrie d'usage | `product_events` + `track()` sur les boucles principales ; INSERT only | Écran de lecture coach / admin | ✔ démarré |
| Bilingue EN + FR | Intake, `constants.ts`, agent, tournée : langue du caller | Idem | ✔ (#53 / #54) |
| Recherche aliments & exercices | Locale instantanée + OFF explicite (cgi plein texte, budget, timeout) ; ranking multicritère ; aliases FR/EN ; portions exactes aller-retour | Idem | ✔ (#68) |
| Changer de coach | Invitation seulement ; le client ne peut pas partir seul | Annuaire + départ + changement | Chantier C |
| Fiabilité (audit 10 sept.) | Accès P0 fermés ; création programme atomique (`create_program_complete`) ; effets d'intervention exactement une fois (`apply_intervention` + clés persistées) ; preuves datées solo = coach ; file offline séances (dead-letter, mapping temp→réel) ; 360 temps réel ; suppression coach = workflow ; archives + adoption ; unités/langue ; a11y de base ; lazy routes ; télémétrie minimisée (`docs/TELEMETRY.md`) ; **E01/E02 = fondations** (révisions immuables + contrat intake versionné — pas le versionnage semaines/blocs ni le builder questionnaire) | Idem | ✔ (#68) |

---

## Phase actuelle : chantiers (après consolidation)

La consolidation de septembre 2026 est **dans `new-JV`**, suivie de l'audit de fiabilisation (#68). L’étape 0 (cycle prod), le chantier A et l'audit sont **faits**. Ensuite B → C → D, pas un nouvel audit.

Les trois axes de la consolidation restent le test de chaque livraison :

- **Boucle solo** : inscription → intake → cibles → programme IA → entraînement / nutrition / poids → analyse → adaptation → accepter / modifier / refuser.
- **Boucle coach** : intake du client → analyse → proposition → le coach valide → le client exécute → détection → nouvelles propositions. Même cerveau, autorité différente.
- **Rien ne s'auto-applique.**

Snapshot prod (10 sept. 2026, projet `phyuijjekxtjvipjtdfv`) : cycle solo + coach joué ; tournée cron active ; `coach-agent` **v26** et fleet **v32** sont `ACTIVE`, déployés via **Supabase Management API** (**pas** une preuve CLI). Le code défaut reste `gpt-5.6-luna` / `payload.why`. v26 conserve le bundle métier audité et corrige l’encodage UTF-8 du wrapper : OPTIONS 200 avec CORS et refus 401 sans JWT. #69 reste un canal CLI manuel optionnel en draft. Les migrations d'intake / télémétrie / copilote / self-coach / `loop_context` / realtime client ainsi que la migration `20260907222909_food_search_rank.sql` (recherche trigramme) sont appliquées. Les timestamps Git des fichiers `supabase/migrations` correspondent aux versions Production.

---

## Chantiers

Détail, lots et risques : **`docs/CHANTIER.md`**. Résumé :

| # | Quoi | État |
|---|---|---|
| 0 | Stack mergé (#58–#60, #62, #64, #65) ; `coach-agent` v22 / Luna ; HIBP = Pro+ (comptes test, rien de compromis) ; **cycle prod joué** | ✔ (7 sept.) |
| 1 | Copilote solo (intake + hebdo + programme vivant) | ✔ code (#46, #47, #58) |
| A | Macros coaché : garder / écraser l'ex-solo ; « pourquoi » partagé | ✔ (#65) |
| 3 | Intake dans la boucle coach | ✔ ; `joursDispo` éditeur + accusé drapeau (#65) |
| audit | 30 constats (P0→P3) : accès, atomicité, preuves, continuité, fichiers, a11y, perf, CI, télémétrie ; E01/E02 fondations (révisions + contrat intake) | ✔ (#68 mergée ; edges v32/v26 via Management API ; copilote agent/CORS opérationnel ; #69 draft optionnelle ; cron rappels actif) |
| B | Builder de questionnaire par coach (socle E02 livré : ids stables, version, `custom` — pas encore le builder ni le versionnage semaines/blocs) | À faire |
| 5 | Télémétrie d'usage | ✔ table + `track()` + `docs/TELEMETRY.md` ; écran lecture = transversal |
| 6 | Bilingue EN + FR | ✔ (#53 / #54, étendu #68) |
| C | Recherche et changement de coach | À faire |
| D | Billing Stripe + mur post-essai | À faire — décisions de prix d'abord |

---

## Invariants (toujours vrais, quel que soit le chantier)

- **L'IA prépare, l'humain décide.** Coach : brouillons `coach_interventions` en `pending`, Envoyer est la seule écriture (claim → effets → finalize, une seule validation gagne). Solo : proposition → accepter / refuser. Jamais d'auto-apply.
- **Un seul agent in-app : `coach-agent` (OpenAI).** Pas de Grok Bots, pas de webhook « Second ». `ask-second`, `suggest-client-plan` et `batch-verify-exercises` répondent 410 exprès.
- **Tracking d'un coaché piloté par `client_tracking_config`** : la ligne est créée à l'invitation avec les défauts du coach (tout ON s'il n'a rien réglé), le setup l'affine. Tout OFF uniquement quand la ligne n'existe pas encore (décision (a) du 4 sept.). Un module éteint ne déclenche ni reproche ni rappel.
- **Un client = un coach actif** (`coach_client_links.status = 'active'`).
- **RLS sur toutes les tables**, RPC `SECURITY DEFINER` étroits pour les écritures coach. Toute permission se prouve par `supabase/tests/rls_matrix.sql` sur staging.
- **new-JV est le produit et la prod.** Netlify la déploie sur `tracker.prometheus-fit.com` à chaque merge ; le projet Supabase « coaching » est la base de prod — une PR avec migration l'applique avant le merge. `main` est l'ancien tracker solo, abandonné. Pas de test destructif sur la base de prod.
- **Données : « enregistré » = persisté.** Erreurs visibles, sauvegardes atomiques, files offline rejouées sans doublon, programmes versionnés (le passé ne se réécrit pas).

---

## À ne plus écrire dans les docs, commentaires ou prompts

| Faux | Vrai |
|---|---|
| « Prometheus est pour Jayvy », « un seul coach », « head coach », « toi = premier user » | Moteur pour les coachs de force / physique et les solos ; Jayvy est le premier utilisateur |
| « Pour tous les coachs, toutes disciplines », « francophone / Québec d'abord », « app de kinésiologue » | Musculation / bodybuilding / powerlifting, EN + FR ; la kinésiologie est dans la qualité du moteur, pas dans le marché |
| « Le générateur de programme est une hypothèse à valider », « version déterministe minimale » | Le programme vivant est une des trois briques ; on ouvre le moteur existant, on ne construit pas un générateur à côté |
| « Solo = legacy / fossile », « supprimer recettes / stats / calendrier / streaks » | Le solo est un produit complet à soigner |
| « Pas de Premium, jamais », « ne pas coder Premium » | Gratuit pendant la construction ; billing non décidé |
| « Compte client uniquement par invitation » | Client **coaché** par invitation ; **solo** libre |
| « Pas de chat / copilote IA client » | Le solo a un copilote ; le coaché non (son coach en a un) |
| « Pas de calcul kcal pour un coaché » | Calcul auto pour tous, puis le coach décide |
