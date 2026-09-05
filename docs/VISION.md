# Vision produit — Prometheus

**Statut :** source de vérité produit. Validée par Jayvy le 2 septembre 2026.
**Remplace :** `docs/AUDIT_PRODUIT_2026-08-31.md` et `AUDIT_AMELIORATIONS.md` (supprimés). Leurs « north stars » — un seul coach, solo = legacy, jamais de Premium — étaient fausses. Ne pas les réintroduire.

> Tout agent ou dev qui lit ce repo part d'ici. Si le code contredit ce fichier, c'est le code qui est en retard (voir « Aujourd'hui vs cible »), pas la vision.

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
| Copilote IA | Oui (`coach-agent`, fleet) | Non | Oui (à construire) |
| Programme | Bibliothèque + assignation | Assigné par le coach | Ses routines ; programme IA proposé (à construire) |

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
| Macros coaché | Mises à NULL à l'onboarding / intake, écriture coach-only (trigger `protect_coach_nutrition_targets`), anneaux masqués jusqu'à Envoyé | Calcul auto au setup, **puis** coach-only | Chantier 2 |
| Macros solo | Calculées à la fin de l'intake (Mifflin-St Jeor + activité + objectif, protéines ISSN), éditables dans `GoalsForm` | Idem | ✔ |
| Proposition hebdo coach | `coach-fleet-round` : Relancer si non assidu, brouillon kcal complet sinon | + explication lisible du « pourquoi » | Chantier 2 |
| Proposition hebdo solo | `SoloWeeklyReview` sur l'accueil : mêmes règles que la tournée coach (`proposeWeeklyNutrition`) sur ses 14 jours ; assiduité d'abord (jours loggés + moyenne dans la cible) sinon relance sans toucher aux chiffres ; sinon nouvelle cible **+ le pourquoi** ; Appliquer / Garder ; une décision par semaine (`solo_weekly_reviews`) | Idem | ✔ |
| Intake | 27 q standard ; mur pour tout nouveau compte (invité coaché **et** solo) ; brouillon sauvegardé à chaque écran, reprise là où on s'est arrêté ; le solo finit sur « Tes cibles » (kcal / macros / eau calculés depuis ses réponses) | Builder par coach | ✔ ; chantier 4 |
| Intake → IA | `coach-agent` lit `kinesiology_intake` (compacté : jours dispo → weekdays, drapeaux listés) ; `extras.objectifType` → `goal` ; filet déterministe honore séances / jours | L'agent voit les réponses | ✔ |
| Drapeaux médicaux | Badge roster + fiche 360 + Setup ; carte listant les questions PAR-Q à « Oui » | Visibles avant d'envoyer un programme | ✔ (gate d'accusé de réception : plus tard) |
| Programme IA solo | Aucun | Proposé depuis l'intake, refusable | Chantier 1 |
| Billing | Stripe ×3 en 410 | Gratuit pendant la construction | ✔ |
| Télémétrie d'usage | `product_events` + `track()` : écrans, compte créé, intake, invitations, brouillons résolus (kind / status / édité), messages, tracking, cibles, tournée, Ask, programme assigné, séance, check-in | Lecture : SQL / service role ; écran plus tard | ✔ démarré |
| Changer de coach | Aucun | Plus tard | — |

---

## Phase actuelle : consolidation (septembre 2026)

Avant de nouveaux chantiers, **finir correctement ce qui existe**, en trois axes :

- **A. Boucle solo** : inscription → intake → cibles → programme IA → entraînement / nutrition / poids → analyse → adaptation (programme **et** nutrition) → accepter / modifier / refuser → nouveau cycle. Doit être bonne, pas juste présente.
- **B. Boucle coach** : intake du client → analyse → proposition au coach → il modifie / valide → le client exécute → données + check-ins + performances → détection → nouvelles propositions. Même cerveau, autorité différente.
- **C. Audit exhaustif de l'existant** : UI réelle + parcours réels + code + base + vision, pour les trois rôles. Cartographier ce qui existe, ce qui est visible, ce qui est accessible mais introuvable, ce qui marche à moitié, les doublons, les vieux flows, les impasses, les données collectées jamais utilisées, les actions possibles en base mais pas en UI. Livrable : la matrice Fonction × Solo / Client / Coach × État × Problème × Cible. **Les PR suivantes se décident après.**

Constats déjà établis par l'audit base (4 sept., projet `phyuijjekxtjvipjtdfv`) :
- La base est à la migration `prometheus_p0_flow_fixes` (1er sept.) : **`kinesiology_intake`, `product_events`, `solo_weekly_reviews` ne sont pas appliquées**. Les PR #43 → #47 ne tournent nulle part encore.
- Les migrations en base portent d'autres numéros que le repo (ré-horodatées le 24 août) ; les deux « absentes » (`coach_fleet_triage_and_marc_seed`, `fix_triage_client_id_ambiguous`) sont des versions de `triage_coach_fleet` couvertes par les migrations du repo — pas une dérive de schéma. Les migrations #43 → #49 ont été appliquées le 5 sept. (idempotentes : `db push` peut les rejouer).
- ~~**La tournée nocturne est muette depuis le 1er septembre**~~ — corrigé le 5 sept. : `FLEET_CRON_SECRET` créé dans le vault + secrets Edge, tournée `cron` enregistrée à 02:19 (5 clients, déterministe).
- Usage réel : 1 coach, 5 clients liés (seedés, 0 invitation), 19 séances complétées, 47 jours de nutrition, 8 check-ins, 10 brouillons dont **0 envoyé**, 0 message coach, 0 photo, 0 note. Le produit n'a pas encore été utilisé avec de vrais clients.

---

## Chantiers (ordre proposé)

1. **Copilote solo** — ~~lot A : intake obligatoire à l'inscription avec reprise, cibles calculées~~ (livré) ; ~~lot B : proposition hebdo kcal/macros avec explication et condition d'assiduité~~ (livré, `WeeklyAdjustment` retiré) ; **lot C : programme vivant** — ouvrir le moteur existant (`coach-agent` `onboarding_plan` / `program_nl_edit`, `coach_interventions`, assignation) au cas « je suis mon propre coach » (JWT + RLS self-coach), vue de proposition solo avant / après / pourquoi, garde-fous existants (volume `programVolume.ts`, équipement et drapeaux de l'intake, filet déterministe). Pas un générateur à côté : le même moteur.
2. **Modèle macros coaché** — calcul automatique au setup, le coach ajuste, la tournée explique ses propositions. Le trigger coach-only reste.
3. ~~**Intake dans la boucle coach**~~ — livré : l'agent lit l'intake, `objectifType` → `goal`, badges et carte drapeaux médicaux, review du Setup basée sur l'intake. Reste : `joursDispo` pré-rempli dans l'éditeur manuel de programme (l'agent le fait déjà), accusé de réception d'un drapeau avant Envoyer.
4. **Builder de questionnaire par coach** — 27 questions = template éditable ; les invités remplissent le questionnaire de leur coach.
5. ~~**Télémétrie d'usage**~~ — livré (table + `track()` sur les boucles principales). Reste : écran de lecture pour le coach / l'admin.
6. **Bilingue EN + FR pour de vrai** — les valeurs de choix de l'intake sont en français en dur (`Oui/Non`, niveaux, équipement…) ; `constants.ts` affiche des libellés anglais (`GOALS`, `DIET_TYPES`…) dans des écrans français ; **le prompt système de `coach-agent` impose « Français, tutoiement »** — un coach ou un solo anglophone reçoit des brouillons en français.
7. **Recherche et changement de coach in-app.**

---

## Invariants (toujours vrais, quel que soit le chantier)

- **L'IA prépare, l'humain décide.** Coach : brouillons `coach_interventions` en `pending`, Envoyer est la seule écriture. Solo : proposition → accepter / refuser. Jamais d'auto-apply.
- **Un seul agent in-app : `coach-agent` (OpenAI).** Pas de Grok Bots, pas de webhook « Second ». `ask-second` et `suggest-client-plan` répondent 410 exprès.
- **Tracking d'un coaché piloté par `client_tracking_config`** : la ligne est créée à l'invitation avec les défauts du coach (tout ON s'il n'a rien réglé), le setup l'affine. Tout OFF uniquement quand la ligne n'existe pas encore (décision (a) du 4 sept.).
- **Un client = un coach actif** (`coach_client_links.status = 'active'`).
- **RLS sur toutes les tables**, RPC `SECURITY DEFINER` étroits pour les écritures coach.
- **new-JV est le produit et la prod.** Netlify la déploie sur `tracker.prometheus-fit.com` à chaque merge ; le projet Supabase « coaching » est la base de prod — une PR avec migration l'applique avant le merge. `main` est l'ancien tracker solo, abandonné. Pas de test destructif sur la base de prod.

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
