# Vision produit — Prometheus

**Statut :** source de vérité produit. Validée par Jayvy le 2 septembre 2026.
**Remplace :** `docs/AUDIT_PRODUIT_2026-08-31.md` et `AUDIT_AMELIORATIONS.md` (supprimés). Leurs « north stars » — un seul coach, solo = legacy, jamais de Premium — étaient fausses. Ne pas les réintroduire.

> Tout agent ou dev qui lit ce repo part d'ici. Si le code contredit ce fichier, c'est le code qui est en retard (voir « Aujourd'hui vs cible »), pas la vision.

---

## En une phrase

Prometheus est un **SaaS fitness** : une plateforme pour **tous les coachs** (kinésiologie, musculation, crossfit, nutrition, etc.) **et** pour les **athlètes solo**, avec un copilote IA qui **prépare** et un humain qui **décide**.

---

## Les 10 points

1. **SaaS pour tous les coachs et pour les solos.** Pas un outil personnel. Jayvy est le premier coach utilisateur, pas le seul.
2. **Trois rôles officiels, tous supportés : Coach / Client coaché / Solo.** Aucun n'est « legacy ».
3. **Un solo crée son compte librement**, sans coach. Le solo est un produit complet : workouts, nutrition, scanner, poids, stats, recettes, streaks, calendrier.
4. **Un solo peut ajouter un coach via le lien de ce coach.** Le coach voit tout l'historique. Un client dont le lien est coupé redevient solo, historique intact. Un client = un coach actif à la fois (recherche / changement de coach in-app = plus tard).
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
| Écran d'accueil | Command Center + File du jour | Séance du jour, messages, photos | Tracker complet |
| Modules visibles | — | Ceux que le coach allume (`client_tracking_config`) | Tous |
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
| Macros coaché | Mises à NULL à l'onboarding / intake, écriture coach-only (trigger `protect_coach_nutrition_targets`), anneaux masqués jusqu'à Envoyé | Calcul auto au setup, **puis** coach-only | Chantier 2 |
| Macros solo | Calculées à la fin de l'intake (Mifflin-St Jeor + activité + objectif, protéines ISSN), éditables dans `GoalsForm` | Idem | ✔ |
| Proposition hebdo coach | `coach-fleet-round` : Relancer si non assidu, brouillon kcal complet sinon | + explication lisible du « pourquoi » | Chantier 2 |
| Proposition hebdo solo | `WeeklyAdjustment` : suggestion simple, sans condition d'assiduité ni explication | Copilote solo (point 6) | Chantier 1 |
| Intake | 27 q standard ; mur pour tout nouveau compte (invité coaché **et** solo) ; brouillon sauvegardé à chaque écran, reprise là où on s'est arrêté ; le solo finit sur « Tes cibles » (kcal / macros / eau calculés depuis ses réponses) | Builder par coach | ✔ ; chantier 4 |
| Intake → IA | `coach-agent` lit `kinesiology_intake` (compacté : jours dispo → weekdays, drapeaux listés) ; `extras.objectifType` → `goal` ; filet déterministe honore séances / jours | L'agent voit les réponses | ✔ |
| Drapeaux médicaux | Badge roster + fiche 360 + Setup ; carte listant les questions PAR-Q à « Oui » | Visibles avant d'envoyer un programme | ✔ (gate d'accusé de réception : plus tard) |
| Programme IA solo | Aucun | Proposé depuis l'intake, refusable | Chantier 1 |
| Billing | Stripe ×3 en 410 | Gratuit pendant la construction | ✔ |
| Télémétrie d'usage | `product_events` + `track()` : écrans, compte créé, intake, invitations, brouillons résolus (kind / status / édité), messages, tracking, cibles, tournée, Ask, programme assigné, séance, check-in | Lecture : SQL / service role ; écran plus tard | ✔ démarré |
| Changer de coach | Aucun | Plus tard | — |

---

## Chantiers (ordre proposé)

1. **Copilote solo** — ~~lot A : intake obligatoire à l'inscription avec reprise, cibles calculées~~ (livré) ; lot B : proposition hebdo kcal/macros avec explication et condition d'assiduité (remplace `WeeklyAdjustment`) ; lot C : programme proposé par l'IA depuis les réponses (accepter / refuser / faire le sien).
2. **Modèle macros coaché** — calcul automatique au setup, le coach ajuste, la tournée explique ses propositions. Le trigger coach-only reste.
3. ~~**Intake dans la boucle coach**~~ — livré : l'agent lit l'intake, `objectifType` → `goal`, badges et carte drapeaux médicaux, review du Setup basée sur l'intake. Reste : `joursDispo` pré-rempli dans l'éditeur manuel de programme (l'agent le fait déjà), accusé de réception d'un drapeau avant Envoyer.
4. **Builder de questionnaire par coach** — 27 questions = template éditable ; les invités remplissent le questionnaire de leur coach.
5. ~~**Télémétrie d'usage**~~ — livré (table + `track()` sur les boucles principales). Reste : écran de lecture pour le coach / l'admin, événements de la proposition hebdo solo quand elle existera.
6. **Recherche et changement de coach in-app.**

---

## Invariants (toujours vrais, quel que soit le chantier)

- **L'IA prépare, l'humain décide.** Coach : brouillons `coach_interventions` en `pending`, Envoyer est la seule écriture. Solo : proposition → accepter / refuser. Jamais d'auto-apply.
- **Un seul agent in-app : `coach-agent` (OpenAI).** Pas de Grok Bots, pas de webhook « Second ». `ask-second` et `suggest-client-plan` répondent 410 exprès.
- **Tracking d'un coaché piloté par `client_tracking_config`**, tout OFF par défaut jusqu'au setup du coach.
- **Un client = un coach actif** (`coach_client_links.status = 'active'`).
- **RLS sur toutes les tables**, RPC `SECURITY DEFINER` étroits pour les écritures coach.
- **new-JV est le produit.** `main` (live `tracker.prometheus-fit.com`) est l'ancien code. Ne pas toucher la base live ni la backup pour tester.

---

## À ne plus écrire dans les docs, commentaires ou prompts

| Faux | Vrai |
|---|---|
| « Prometheus est pour Jayvy », « un seul coach », « head coach », « toi = premier user » | SaaS pour tous les coachs ; Jayvy est le premier utilisateur |
| « Solo = legacy / fossile », « supprimer recettes / stats / calendrier / streaks » | Le solo est un produit complet à soigner |
| « Pas de Premium, jamais », « ne pas coder Premium » | Gratuit pendant la construction ; billing non décidé |
| « Compte client uniquement par invitation » | Client **coaché** par invitation ; **solo** libre |
| « Pas de chat / copilote IA client » | Le solo a un copilote ; le coaché non (son coach en a un) |
| « Pas de calcul kcal pour un coaché » | Calcul auto pour tous, puis le coach décide |
