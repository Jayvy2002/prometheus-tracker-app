# Chantier — Prometheus

> **RÔLE — SEULE SOURCE DU TRAVAIL RESTANT**
>
> Ordre des travaux, décisions, défauts à corriger, fonctionnalités à construire, critères de fin.
>
> **Instruction agents :** un élément sort uniquement après **preuve de code + parcours réel**, ou après abandon produit noté ici. Ne pas en faire un journal de PR. Git garde l’historique ; `README.md` décrit l’app actuelle ; `VISION.md` la destination ; `RAPPORT_UX_FONCTIONNALITES.md` et `AUDIT_NAVIGATION_UX.md` diagnostiquent — **ils n’ordonnent pas**. Si un diagnostic contredit ce fichier, **ce fichier gagne**.

**Mis à jour : 14 septembre 2026.** Recalé sur `new-JV` `3233932` (PRs #91–#92) et la contre-expertise code du même jour. Une CI verte ne clôt pas une ligne UX.

**Prochain lot à ouvrir : 1 — vérité des séries réalisées.**

**Principe d’écran :** dire vrai sur ce qui a été fait, enregistré, qui voit, et quelle est la prochaine action — y compris « rien aujourd’hui ».

---

## Mode d’emploi

| Statut | Sens |
|---|---|
| **À décider** | Une décision produit manque. |
| **À concevoir** | Le résultat est connu, le contrat de parcours non. |
| **À construire** | Assez précis pour implémenter. |
| **Partiel** | Une partie du critère est dans le code ; le reste est faux ou absent. |
| **À vérifier** | Le code semble là ; il manque la preuve de parcours (et souvent l’apply prod). |
| **Reporté** | Volontairement plus tard (billing, P3, confort). |
| **Terminé** | Code, tests nécessaires **et** parcours attendu vérifiés. Retirable dans le même changement. |

| Priorité | Sens **à l’intérieur d’un lot ouvert** |
|---|---|
| **P1** | Ment, verrouille, ou détruit un accès / un travail. |
| **P2** | Gain de temps ou de clarté sur un parcours fréquent. |
| **P3** | Confort à tester avant de construire. |

**Règle d’arbitrage.** Un défaut qui **ment sur un résultat**, **verrouille l’app** ou **détruit un accès coach** se traite **maintenant**, même si un lot M n’est pas « Terminé ». Ne pas reconstruire un lot M dont le code existe : le **vérifier**, documenter la preuve, puis le retirer. Ne pas attendre M8 pour corriger un bilan de séance faux.

**Une PR = une capacité observable** (un lot de la file, ou un item numéroté du lot 10). Accessibilité du parcours **dans** le lot, pas un cosmétique final.

---

## Ce que ce fichier remplace (ne pas ressusciter)

| Ancienne règle | Décision actuelle |
|---|---|
| Lots M1–M5 « à construire from scratch » | Le code est là → **À vérifier** (+ apply prod + parcours) |
| M5 « demande acceptée ≠ lien » | **Faux.** `respond_coaching_request('accepted')` appelle déjà `activate_coaching_relationship`. Ce n’est **pas** un paiement. |
| « Ne pas activer le lien tant que M6 n’existe pas » | **Annulé.** Retirer l’activation re-casserait le suivi. M6 = encaissement seulement. |
| UX reportée après « finalisation fonctionnelle » | Trop tardif pour les mensonges / murs / roster orphelin |
| Lots A–D du rapport UX (§11) | Diagnostic d’usage, **mauvais ordre** (progression coaché avant vérité des séries, confirm à chaque séance libre, « transmis ») |
| Journal CI / typecheck / smoke perdu | Git, pas ici |

IDs **jamais attribués** (ne pas les inventer) : UX71–73, UX79, UX82, UX83.

---

## Décisions stables — ne pas défaire

- Un moteur de séances / programmes / progression. Pas de second logger par rôle.
- Cinq onglets mobile. **Pas** de 6ᵉ onglet, **pas** de Copilote dans la tab bar.
- Switcher Personnel / Coaching **uniquement dans Profil**.
- FAB hors espace Coaching, hors `/messages`, `/checkin`, marketplace.
- `TrackingGate` : module off = disparu. Photos hors tab bar coaché.
- L’IA prépare, un humain décide. Jamais d’auto-apply.
- Billing **fermé** : pas de Stripe, paywall, commission.
- L’espace affiché n’accorde aucun droit.
- Simplifier en **nommant** et en mettant l’action principale devant — pas en interdisant séance libre, recettes ou FAB entier.
- Accueil = prochaine action **utile** ou **vide honnête**.
- Accessibilité bloquante : dans le lot du parcours.

### Interdit (propositions tranchées)

| Ne pas faire | Faire plutôt |
|---|---|
| Ouvrir `/stats` / calendrier / hub progression au coaché **avant** la vérité des séries | Lot 1, puis lecture `/exercise-progress` (lot 8) |
| Réduire l’intake à « 3 questions » | Seulement ce qui sert la **prochaine** action (UX03) |
| Forcer le chercheur de coach sur un accueil solo | Intention respectée ; Personnel utilisable |
| Interdire la séance libre si un jour de plan est dû | Jour prescrit en premier ; libeller « hors programme » |
| Confirmer chaque séance libre | Confirmer seulement une conséquence particulière |
| Retirer le FAB de tout `/dashboard` | Masquer **Nouvelle séance** si le jour de plan est dû et cliquable |
| Photos = 5ᵉ interrupteur tracking | Suivi proposé / conservation / partage (UX54) |
| « Enregistré » → « Transmis au coach » | « Enregistré — visible par {coach} » après succès serveur (UX26) |
| Fusionner Messages, brouillons et Prometheus | Relier les parcours ; trois jobs distincts |
| Recettes coupées au coaché « parce qu’il a un coach » | Trancher utilité + contrat de suivi, pas l’autonomie |
| Déclarer nav / accueil / 0C « terminés » | `navConfig` existe ; trouvabilité et chiffres mentent encore |
| Confondre lock questionnaire coach et intake kiné | Kiné (7 écrans, 0B) = sécurité médicale. UX80 = questionnaire **prise en charge** incomplet |

---

## Déjà dans le code — ne pas reconstruire

Preuve = revue `3233932`. **Parcours live souvent manquant** → ne pas marquer Terminé pour autant.

| Livré | Reste éventuel |
|---|---|
| Notice proposition programme solo (plus de mur Accueil) | — |
| `navConfig` unique, 5 onglets, Copilote hors tab, switcher Profil, 5ᵉ onglet Compte coach | Trouvabilité mobile ≠ desktop (lots 8, 10) |
| Cibles macros inventées (150/250/65) retirées | — |
| 1 reminder / jour (deload/repas/eau masqués si coaché) | Message + check-in + reminder peuvent encore coexister (UX07) |
| Heroes d’accueil exclusifs | Vide honnête un jour sans tâche |
| File coach : empty, sévérité **texte**, une carte featured | « Depuis quand » ; Passer = tout le groupe (lot 9) |
| Ancres check-in haut/bas (#91) | Accusé « visible par {coach} » (lot 10) |
| `Terminer` **n’écrit plus** `completed` sur les séries restantes | L’**affichage** les compte encore (lot 1) |
| Repos 90 s lancé après coche | Préférence auto **volontaire** (UX15) |
| Assign programme : plus de premier client auto | Recap destinataire à rejouer (UX21) |
| Inputs séance agrandis, cibles 44 px (#91) | OverflowMenu clavier (lot 10) |
| RPC `client_end_coach_link` + UI Profil + tests | Preuve prod, notif, sérialisation, copy 3 listes (M2a) |
| Annuaire / offre / demandes en code | Copy « accepté = suivi actif » (M5) |
| `accountContext`, espaces Personnel / Coaching | Trou : `set_coaching_role('none')` (lot 2) |

---

## File d’exécution — ce qu’il reste à faire maintenant

Travailler **un lot à la fois**, dans cet ordre. Les IDs entre parenthèses sont le contrat du catalogue. Un ID **absent de cette file** ne se commence pas tant que les lots 1–10 ne sont pas verts (sauf P1 nouveau du même type : ment / verrouille / détruit un accès).

| # | Lot | Statut | Preuve de fin |
|---|---|---|---|
| **1** | **Vérité des séries réalisées** (UX12, UX17, UX49) | À construire | Une série non cochée n’est **jamais** une performance. Même définition dans bilan, graphes, **dernière séance 360** (`readableSets`). Auto-close 30 s retiré ; bilan retrouvable. Tips génériques ≠ « Conseil du coach ». `prCount` mort : supprimer. |
| **2** | **Désactivation mode coach** (UX78) | À construire | `set_coaching_role('none')` refusé tant qu’un lien **actif** `coach_id = auth.uid()` existe. UI : confirmation avec le **nombre** de clients. Pas de roster orphelin. |
| **3** | **Programmes : écriture honnête** (UX20, UX21, UX63) | À construire | Sauvegarde solo **une** opération (métadonnées + jours) avec version ; échec ≠ plan à moitié. `deleteProgram` n’ôte la liste **qu’après** succès. `fetchPrograms` en erreur ≠ `[]`. Assign : destinataire choisi (code : à vérifier en parcours). |
| **4** | **Questionnaire sans prison** (UX80, UX02, UX03, UX04) | À construire | Plus de `path="*"` sur questionnaire **prise en charge** incomplet, ni mur sur échec de fetch. Aujourd’hui, messages et compte restent accessibles. Bannière + **lien** « Mon questionnaire » (`/questionnaire` n’a aucun `Link` dans `src/`). Brouillon conservé. Audience avant questions sensibles. Retirer « 60 secondes » non mesuré. **Ne pas** casser l’intake kiné. |
| **5** | **Photos et audience** (UX54) | À construire | Solo ne lit plus « Ton coach les voit ». Texte = audience réelle. Consentement marketplace (`progress_photos` dans le paquet) = phrase d’acceptation. Coach actuel : dire si l’historique antérieur au lien est visible. Pas un 5ᵉ module unique. |
| **6** | **Calendrier, recherche, erreur ≠ vide** (UX48, UX49, UX63) | À construire | Plusieurs séances (et pesées) le même jour listées. Recherche progression : **tous** les matchs — `filteredExercises.slice(5)` saute les 5 premiers **après filtre**. Stats / progression : erreur avec réessai, pas un historique fantôme. |
| **7** | **Messages : brouillon et lu** (UX29–31, UX85) | À construire | Brouillon par compte × conversation, restauré au retour. Relance préremplie n’écrase pas un brouillon perso. Écarter une carte Accueil ≠ marquer lu. `read_at` seulement si le serveur a réussi. Pas d’accusé « lu » sans preuve. |
| **8** | **Trouver programme et progression** (UX08, UX10, UX81, UX84, UX07 athlète) | À construire **après 1** | Coaché : lien **lecture** « Mon programme » depuis Entraînement (aujourd’hui `!coached`). Puis `/exercise-progress` en lecture — **pas** `/stats` ni calendrier dans le même PR. `waiting_program` → Messages (aujourd’hui `ListRow` sans `to`). FAB / **Nouveau** : pas « nouvelle séance » en doublon du jour dû ; libeller hors programme. Accueil : vide honnête si rien à faire. |
| **9** | **File coach et continuité** (UX09, UX33, UX34, UX07 coach, UX35) | À construire | Chaque carte : pourquoi, **depuis quand**, une action. « Passer » = **un** signal, annulable. Contexte roster conservé au retour. 360 : « depuis ta dernière visite » ; dernière séance = définition lot 1. |
| **10** | **Cohérence restante** | À construire | Une PR par ligne ci-dessous. |

### Lot 10 — une PR par ligne

| # | Contenu | IDs |
|---|---|---|
| 10a | Recettes dans le chrome Nutrition (pas `SessionShell` entier) | UX77, UX53 |
| 10b | Revue solo compacte (3 chiffres, pas un pavé). Notice Accueil **gardée** | UX45 |
| 10c | Onglet 360 « health » → **Récupération**. Learned / priorités en français | UX46, UX35 |
| 10d | Ask : qui + effet avant envoi | UX42, UX43 |
| 10e | Check-in : « Enregistré — visible par {coach} » après succès serveur. Pas « transmis » | UX26 |
| 10f | Unités kg/lbs partout (progression encore collée en kg) | UX14, UX65 |
| 10g | OverflowMenu : Échap + focus. `aria-current` / badge onglet | UX62, UX76 |
| 10h | `PageTransition` reset au changement de persona | UX74, UX75 |
| 10i | Vocabulaire séance / programme / modèle. Plus de « routine » zombie | UX11 |
| 10j | Preview setup : ce que le client **verra** | UX37 |

**Ensuite seulement :** preuve prod des lots M encore « À vérifier », M7 (accueils / suite d’objectif), confort P2/P3 du catalogue, billing.

---

## Ancres code (lot 1–9) — ne pas chercher à l’aveugle

| Lot | Où ça ment / casse aujourd’hui |
|---|---|
| 1 | `WorkoutSummaryScreen.computeStats` : ignore `completed` (sauf échauffement). `useEffect` 30 s. Titre i18n `workout.summary.coaching.title` = « Conseil du coach ». `prCount = 0` jamais rendu. `ExerciseProgressPage` : `if (!s.completed && !ex.workouts.completed) continue` — séance `completed` ⇒ séries non cochées comptées. `readableSets` : `completed \|\| weight \|\| reps \|\| duration`. |
| 2 | SQL `set_coaching_role` (`20260831235414`) : si `p_role = 'none'`, protège seulement `client_id = moi`. Un coach en Personnel (`ProfilePage` toggle, `!coached && !inCoaching`) peut passer à `'none'` avec un roster actif. |
| 3 | `ProgramEditorPage` : `updateProgram` puis `syncProgramDays`. `deleteProgram` : delete puis retire la liste **sans** `error`. `fetchPrograms` `catch` → `programs: []`. |
| 4 | `App.tsx` ~324–332 : `activeAssignment.response && !completed_at` → `path="*"`. Échec fetch : écran retry (mieux) mais toujours un mur. Route `/questionnaire` sans aucun lien. |
| 5 | `coaching.photos.subtitle` inconditionnel. `DIRECT_INVITE_CONSENT_SCOPES` inclut `progress_photos`. `is_coach_of` exige `status = 'active'` (pas « sans statut ») ; le trou est l’**audience affichée** et l’historique vu par le coach **actuel**. |
| 6 | `CalendarPage` : `workouts` et `weight_measurements` du jour en `.maybeSingle()`. Recherche : `filteredExercises.slice(5)` **après** le filtre. |
| 7 | Brouillon local au composant. `Dashboard` `onDismiss` → `markCoachMessageRead`. Store : `update({ read_at })` **sans** check `error`, puis état local optimiste. |
| 8 | `WorkoutPage` : `CardLink` programmes si `!coached && !assignment?.program`. `CoachedAthleteRedirect` bloque `/exercise-progress`. `waiting_program` : `ListRow` sans `to`. FAB `nav.addWorkout` → `/workout/new`. |
| 9 | `CoachTodayQueue` `onSkip` → `dismissQueueItems(group.items.map(...))` (tout le groupe). Pas d’ancienneté sur la carte. |

---

## Chantier 2 — Continuité, identité, marketplace

**Décision :** un moteur, identité durable, capacité coach ≠ accompagnement personnel, marketplace et suivi dans la même app.

**État code (14 sept. 2026, `3233932`) — ce n’est pas la preuve prod.** Intention après compte, espaces Personnel/Coaching, `client_end_coach_link`, invitation consentie, annuaire / demandes / offre, `respond_coaching_request` **active déjà** le lien **sans paiement**. Les lignes M restent ici tant que migration Git + apply prod + parcours n’ont pas été **prouvés**.

| Lot | Statut | Conditions de fin | Reste réel |
|---|---|---|---|
| **M0** Inventaire rôles / policies vs carte | À vérifier | Scénarios solo, coaché, coach, coach-athlète. Aucun changement de droits. | Revues UX 14 sept. = UI ; confirmer vs policies live, puis retirer. |
| **M1** Capacités + espaces Personnel/Coaching | À vérifier | Backfill coachs ; aucun auto-lien ; rollback UI sans drop de colonnes. | `accountContext` existe. Prouver droits serveur ≠ espace affiché, dual-rôle. **Lot 2 (UX78) est un trou de cette projection.** `user_roles` reste l’écriture tant que la bascule n’est pas prouvée. |
| **M2a** Départ client autonome | À vérifier | RPC `client_end_coach_link` ; même `transition_client_to_solo` que le coach ; historique conservé ; notes privées non transférées ; notif minimale coach ; sérialisation vs adaptation en cours. | RPC + UI + tests présents (`20260913184325`, Profil). Manquent preuve prod, notif, sérialisation, copy « tu gardes / ça s’arrête / ça ne se transmet pas » (UX57–58). **Ne pas reconstruire la RPC.** |
| **M2b** Invitation + consentement versionné | À vérifier | Acceptation explicite ; ancienne RPC révoquée après bascule. | Consentement versionné en code. Vérifier révocation de l’ancienne signature et cas expiré / mauvais compte (UX02). |
| **M3** Intention après identité | À vérifier | Login direct ; pas de rôle avant le formulaire ; OAuth plus tard. | `EntryIntentionPage` existe. Parcours `find_coach` : Personnel utilisable. Ne pas fusionner intake / onboarding **avant** d’avoir testé chaque chemin. |
| **M4** Offres opt-in | À vérifier | Coach sans publier ; publication / retrait. | `/coach/profile` existe. Compte ≠ offre publique (libellés). |
| **M5** Annuaire, comparaison, demandes | À vérifier | Filtres exacts ; pas de dossier prospect ; empty honnête. | Vitrine en code. **Accepté = suivi actif**, pas un paiement. L’UI doit le dire (UX56). Annuaire si déjà lié : expliquer, pas un formulaire qui échoue. Matching riche / modération / avis : **pas** dans M4–M5. |
| **M6** Paiement / accord commercial | **Reporté** | Une RPC d’activation **déjà** utilisée à l’acceptation et à l’invitation. M6 = encaissement, pas ré-activer le lien. | Chantier 3 fermé. |
| **M7** Accueils et suite d’objectif | À concevoir | Trois parcours jusqu’au bilan ; coach autorité du plan. | Après lots 1, 4, 8, 9. |
| **M8** Ouverture graduelle | À concevoir | Pas de lancement large sur CI seule. | |

### Livraison chantier 2

- Une PR = une capacité. Pas de monolithe départ + rôles + annuaire.
- SQL uniquement dans `supabase/migrations/` au merge. `supabase/changes/` n’est pas la production.
- Front et SQL cassant : nouvelle signature, bascule, **puis** révocation.
- Réutiliser `transition_client_to_solo` / `end_coach_client_link` / `client_end_coach_link`.
- Questionnaire **prise en charge** ≠ questionnaire **recherche** (ce dernier n’est pas un parcours dédié).
- `activate_coaching_relationship` n’est **pas** grant `authenticated` (appel interne). Ne pas l’exposer au client.

### Continuité (invariants)

- Un client : un coach actif.
- Après départ : lien terminé, tracking retiré, programme en pause, données personnelles conservées.
- Pas de transfert des notes privées ni de la conversation de l’ancien coach.

---

## Chantier 3 — Billing

**Fermé** jusqu’à décision explicite. Pas de Stripe, Checkout, webhook, mur d’essai, commission.

À trancher **avant** toute ligne le jour de l’ouverture : prix solo / paliers coach ; essai, devise, taxes ; qui encaisse le coaching vs le logiciel ; effet d’un départ.

`solo_trial_ends_at` existe **sans mur**. Ne pas en faire une règle commerciale.

UX59–61 restent le contrat **le jour où** le billing s’ouvre. D’ici là : **Reporté**.

---

## Après la file 1–10 (ne pas commencer avant)

| Thème | IDs | Statut |
|---|---|---|
| Reprendre valeurs ≠ ajouter une série | UX13 | À construire |
| Offline en langage courant ; file hors séances | UX16 | À construire / transversal |
| Sélecteur d’exercice (variantes, récents) | UX18 | À construire |
| Remplacement « cette séance » vs plan | UX19 | À concevoir |
| Cycles / phases / prescriptions hors reps | UX22 | À concevoir / transversal |
| Historique visuel des révisions | UX23 | À concevoir / transversal |
| Check-in : champs vraiment utilisés | UX25 | À construire |
| Relier réponse coach au bilan | UX27 | À concevoir |
| Manque ≠ faute ; relances | UX28 | À construire |
| Lier séance / check-in dans le fil | UX32 | Après lot 7 |
| Filtres roster visibles | UX36 | À construire |
| Builder questionnaire (modèle, preview, publication) | UX39–41 | À construire |
| Attente IA quittable | UX44 | À construire |
| Calendrier : prévu / commencé / terminé | UX47 | À concevoir |
| Du point de courbe vers la séance | UX50 | À concevoir |
| Provenance alimentaire en mots | UX51 | À construire |
| Scanner : issue si pas de caméra / produit | UX52 | À vérifier |
| Permission notif au bon moment | UX64 | À construire |
| Audience, export, delete compte | UX66 | À construire |
| Aide contextuelle | UX67 | À concevoir |
| Stabilité chargement / double submit | UX68 | À vérifier |
| Raccourcis Accueil | UX69 | Reporté P3 |
| Silhouette vs liste | UX06 | Reporté P3 |
| Actions groupées coach | UX38 | Reporté P3 |
| Télémétrie utilité | UX70 | Continu, pas un projet préalable |

Travaux techniques **seulement** s’ils débloquent un lot ci-dessus ou un défaut mesuré : écran interne télémétrie ; policies SELECT après preuve RLS ; protection Auth mots de passe compromis ; `pg_trgm` / `pg_net` hors `public` (staging + mesure) ; perf fondée sur des mesures (lot premium 15).

---

## Règles de livraison

- Chargement, vide, **erreur** et reprise : une erreur n’est jamais un écran vide silencieux.
- Toute copie visible : FR **et** EN (y compris toasts ; pas de `deleted` hardcodé).
- Écriture critique : atomique ou idempotente.
- RLS / `SECURITY DEFINER` : matrice de sécurité dans le même changement.
- Télémétrie : `docs/TELEMETRY.md` dans le même commit.
- Migration appliquée : jamais réécrite.
- Proposition IA : validation humaine.

---

## Couverture déjà dans le code (lots premium 0A–16)

Ne pas reconstruire. Recaler le statut quand un trou UX est **prouvé**.

| Lot | Statut | Reste |
|---|---|---|
| **0A** i18n options | À vérifier | Toasts / intake / unités encore hors clés (ex. `"… deleted"`). |
| **0B** auth / intention / invite | À vérifier | Lock questionnaire après invite (lot 4). Intake kiné : 7 écrans **conservés**. |
| **0C** vérité produit | **Partiel** | Cibles macros : corrigé. **Terminer n’écrit plus** `completed` sur le reste : corrigé. **Le bilan et les graphes comptent encore les séries non cochées** → lot 1. |
| **1** design system | À vérifier | `ListRow` / 44 px (#91). OverflowMenu clavier (10g). |
| **2** accessibilité | À vérifier | Cibles 44 px présentes ; clavier / zoom / lecteur restants. |
| **3** navigation | **Partiel** | `navConfig`, 5 onglets, Copilote hors tab, switcher Profil. Trouvabilité ; recettes ; `PageTransition` (lots 8, 10). |
| **4** dashboard | **Partiel** | Un hero ; proposition IA = notice (#91). Message + check-in + reminder peuvent coexister. `waiting_program` inerte. |
| **5** Coach Today | **Partiel** | Empty + sévérité texte + featured. Pas de « depuis quand ». Passer écarte **tous** les signaux du client. |
| **6** Client 360 | À vérifier | Structure en code ; « ce qui a changé » et dernière séance **fausse** tant que lot 1 n’est pas fait. Onglet « health » à renommer (10c). |
| **7** Setup 4 étapes | À vérifier | Preview écrans client encore faible (10j). |
| **8** Messages / Prometheus | **Partiel** | Retry / safe-area. Brouillon non durable ; lu local trop optimiste (lot 7). |
| **9** Marketplace vitrine | À vérifier | Pas de faux prix. Acceptation = **lien actif**. Copy à aligner. |
| **10** Programmes builder | **Partiel** | Pas de premier client auto. Sauvegarde solo non atomique ; delete ignore l’erreur (lot 3). |
| **11** Nutrition / séance / scanner | À vérifier | Recettes hors chrome (10a). UX15 = auto **optionnel** après coche. |
| **12** Progression / photos | **Partiel** | Hub solo. Coaché bloqué. Calculs faux (lots 1, 6). Sous-titre photos menteur (lot 5). |
| **13** Profil | **Partiel** | Groupes OK. Toggle mode coach dangereux (lot 2). SoloHub encore un tiroir mobile. |
| **14** PWA / offline | À vérifier | File = séances seulement. |
| **15** Performance | À vérifier | Mesure live. |
| **16** Polish | À vérifier | Revue visuelle live. |

---

## Catalogue UX — contrat détaillé

Les constats « 11 septembre » sont **périmés** là où le statut dit autre chose. Avant d’implémenter : relire le HEAD. **P1** dans un lot ouvert = faire maintenant si ça bloque ce lot.

**Base :** `C` constat code ; `H` hypothèse ; `F` cible d’un chantier pas encore prouvé. **Portée :** `I` interface ; `I+D` état durable.

**Colonne File :** lot de la file, `M*`, `ens.` (après 1–10), `rep.`, `chaque`, `fait`.

### Entrée et questionnaire

| ID | P | File | Statut | Travail restant | Critère de fin |
|---|---|---|---|---|---|
| **UX01** | P2 | M3 | À vérifier | Connexion directe / intention à l’inscription. | Habitué → son espace sans redéfinir un rôle. |
| **UX02** | P1 | 4 | Partiel | Invitation : contexte OK en code. Après accept : **plus de lock**. | Aucune invite invalide sans issue ; rattachement clair. |
| **UX03** | P2 | 4 | À construire | Complément au moment utile. **Pas** « 3 questions ». Retirer durée non mesurée. | On sait pourquoi maintenant ; reprise sans ressaisie. |
| **UX04** | P1 | 4 | À construire | Audience et facultatif avant les questions sensibles. | Destinataire et conséquence d’un refus connus. |
| **UX05** | P2 | ens. | À construire | Résumé + correction par rubrique ; nouvelle version = complément. | Pas de parcours entier à refaire. |
| **UX06** | P3 | rep. | Reporté | Silhouette facultative vs liste. | Seulement si un test le justifie. |
| **UX80** | P1 | 4 | À construire | Bannière, pas `path="*"`. Hub « Mon questionnaire ». Brouillon. Échec fetch ≠ mur. | Messages / Aujourd’hui / compte accessibles ; réponses conservées. |

### Accueil et navigation

| ID | P | File | Statut | Travail restant | Critère de fin |
|---|---|---|---|---|---|
| **UX07** | P1 | 8+9 | Partiel | Heroes exclusifs : oui. Encore message + check-in + reminder. Jour sans tâche = vide honnête. | Prochaine action évidente **ou** absence honnête. |
| **UX08** | P2 | 8 | Partiel | Hub Progression solo : oui. Programme trop Profil / desktop. Coaché : lecture lot 8. | Programme / historique sans deviner Profil. |
| **UX09** | P1 | 9 | À construire | Filtres, position, client courant. | Enchaîner des fiches sans reconstruire la liste. |
| **UX10** | P1 | 8 | À construire | `waiting_program` **inerte**. CTA Messages. | On sait quoi faire maintenant. |
| **UX11** | P2 | 10i | À construire | Séance / programme / modèle. Plus de « routine » zombie. | Un nom = une action. |
| **UX74** | P1 | 10h | Partiel | `navConfig` existe. Reste : **même carte** mobile/desktop. | Un ajout de destination = un endroit. |
| **UX75** | P1 | 10h | À vérifier | Switcher Profil, 5ᵉ onglet Compte. Dual-rôle : Objectifs selon **espace**. | Changer d’espace change Profil et onglets. |
| **UX76** | P2 | 10g | Partiel | Labels / 44 px en cours. `aria-current`, badge, zoom. | Onglet actif identifiable clavier / lecteur. |
| **UX77** | P2 | 10a | À construire | Recettes **dans** Nutrition. Séance immersive : sortie évidente. **Pas** tout regrapher. | Recettes ≠ session ; séance a une sortie. |
| **UX84** | P1 | 8 | À construire | FAB + Nouveau `/workout` : pas de doublon vs jour dû. | Hors programme **nommé** ; pas d’interdiction. |

### Séance

| ID | P | File | Statut | Travail restant | Critère de fin |
|---|---|---|---|---|---|
| **UX12** | P1 | 1 | **Partiel** | L’écriture ne coche plus le reste. Le **calcul d’affichage** ignore `completed`. Une définition unique « réalisé ». | Séries non cochées absentes du volume / 1RM / dernière séance coach. |
| **UX13** | P2 | ens. | À construire | Reprendre les valeurs ≠ ajouter une série. | Pas de série en trop par raccourci. |
| **UX14** | P2 | 10f | À vérifier | Inputs séance agrandis. Unités partout. | Édition conservée ; unité du profil. |
| **UX15** | P2 | ens. | À vérifier | Repos 90 s déjà lancé après coche. Préférence auto **volontaire** ; pas au préremplissage. | Désactivable ; jamais sur un simple fill. |
| **UX16** | P1 | ens. | À construire | Langage : appareil / sync / action requise. | Après coupure, on sait ce qui est conservé. |
| **UX17** | P1 | 1 | À construire | Plus de `setTimeout` 30 s. Bilan retrouvable. Faits, pas leçon. | Fermeture volontaire seulement. |

### Exercices et programmes

| ID | P | File | Statut | Travail restant | Critère de fin |
|---|---|---|---|---|---|
| **UX18** | P2 | ens. | À construire | Variantes / matériel / récents. | Bonne variante avant sélection. |
| **UX19** | P2 | ens. | À concevoir | Remplacement « cette séance » vs « proposer au plan ». | Pas de réécriture silencieuse du futur. |
| **UX20** | P1 | 3 | À construire | Brouillon / enregistré / actif **et** sauvegarde solo atomique + version. | Le client voit ou ne voit pas ; pas de plan à moitié. |
| **UX21** | P1 | 3 | À vérifier | Plus de premier client auto. Recap destinataire / date. | Parcours bibliothèque sans destinataire accidentel. |
| **UX22** | P2 | ens. | À concevoir | Athlète = séance ; coach = structure. | Séance identifiable après report. |
| **UX23** | P1 | ens. | À concevoir | Diff avant/après, auteur, date d’effet. | Restaurer ≠ réécrire le passé. |
| **UX81** | P1 | 8 | À construire | **Après UX12.** Progression **lecture** coaché (`/exercise-progress`). Pas stats/calendrier dans le même PR. | Tendances d’exo accessibles ; plan non éditable. |

### Check-in et relation

| ID | P | File | Statut | Travail restant | Critère de fin |
|---|---|---|---|---|---|
| **UX24** | P2 | fait | À vérifier | Ancres bas/haut livrées (#91). | Historique comparable. |
| **UX25** | P2 | ens. | À construire | Champs vraiment utilisés ; cœur vs détails. | Chaque champ explicable. |
| **UX26** | P1 | 10e | À construire | **Pas** « transmis ». « Enregistré — visible par {coach} » si accès réel. | Succès ≠ lu. |
| **UX27** | P2 | ens. | À concevoir | Relier réponse coach / adaptation au bilan. | Le coaché voit à quoi ça a servi. |
| **UX28** | P1 | ens. | À construire | Manque ≠ faute. Relances respectueuses. | Pas d’interprétation santé automatique. |

### Messagerie

| ID | P | File | Statut | Travail restant | Critère de fin |
|---|---|---|---|---|---|
| **UX29** | P1 | 7 | À vérifier | Ancrage au chargement de l’historique. | Page ancienne ≠ saut en bas. |
| **UX30** | P1 | 7 | À construire | Brouillon durable hors du composant. | Changer de fil restaure le bon texte. |
| **UX31** | P1 | 7 | À construire | États serveur. Pas de lu local si l’update a échoué. | Pas de doublon ; pas de faux lu. |
| **UX32** | P2 | ens. | À concevoir | Lier séance / check-in (résumé). Après le socle 7. | Objet identifiable dans le fil. |
| **UX85** | P1 | 7 | À construire | Dismiss carte Accueil ≠ `markCoachMessageRead`. | Masquer un rappel ne marque pas lu. |

Cadrage : conversation intégrée, **pas** WhatsApp. Pièces jointes, vocaux, recherche, présence : **après** le socle. Pas de E2E promis.

### Travail coach

| ID | P | File | Statut | Travail restant | Critère de fin |
|---|---|---|---|---|---|
| **UX33** | P1 | 9 | Partiel | Pourquoi + action : oui. **Depuis quand : non.** | Priorité compréhensible sans ouvrir la fiche. |
| **UX34** | P2 | 9 | À construire | Passer = un signal ; report ; undo. | Pas d’écartement en bloc. |
| **UX35** | P2 | 9+10c | À vérifier | « Depuis ta dernière visite ». Dernière séance = UX12. | Répondre sans relire tout le dossier. |
| **UX36** | P2 | ens. | À construire | Filtres visibles, éditables, effaçables. | On sait pourquoi un client est dans la liste. |
| **UX37** | P2 | 10j | À construire | Preview de ce que le client **verra**. | Pas de surprise d’onglets / champs. |
| **UX38** | P3 | rep. | Reporté | Actions groupées limitées. | Seulement si gain prouvé. |
| **UX78** | P1 | 2 | À construire | SQL `coach_id` + confirmation chiffrée. | Dual-rôle Personnel ne peut pas couper le roster. |

### Questionnaire coach (builder)

| ID | P | File | Statut | Travail restant | Critère de fin |
|---|---|---|---|---|---|
| **UX39** | P2 | ens. | À construire | Partir d’un modèle court. | Questionnaire court sans jargon. |
| **UX40** | P2 | ens. | À construire | Preview effort (écrans, obligatoires, FR/EN). | Aperçu = parcours client. |
| **UX41** | P1 | ens. | À construire | Publication : qui doit compléter. | Pas de reset massif pour une typo. |

### IA

| ID | P | File | Statut | Travail restant | Critère de fin |
|---|---|---|---|---|---|
| **UX42** | P1 | 10d | À construire | Cible client / programme visible avant Ask. | Pas d’ambiguïté de destinataire. |
| **UX43** | P1 | 10d | À construire | Effet : réponse / filtre / brouillon / message. | « Envoyer » ne cache pas un changement de plan. |
| **UX44** | P2 | ens. | À construire | Attente IA quittable. | L’app reste utilisable. |
| **UX45** | P2 | 10b | À construire | Solo : aide sur programme / séance, pas un chat `/prometheus`. Notice Accueil : **garder**. Revue = 3 chiffres. | Aucune application sans choix. |
| **UX46** | P2 | 10c | À vérifier | Learned en langage humain. | Désactivation sans clés techniques. |

### Calendrier et indicateurs

| ID | P | File | Statut | Travail restant | Critère de fin |
|---|---|---|---|---|---|
| **UX47** | P2 | ens. | À concevoir | Prévu / commencé / terminé ; report expliqué. | Le passé ne disparaît pas. |
| **UX48** | P1 | 6 | À construire | Plus de `maybeSingle()` séance (ni pesée) du jour. Fenêtre = période vue. Requête périmée ignorée. | Deux séances le même jour visibles. |
| **UX49** | P2 | 1+6 | À construire | Manque ≠ 0. Record égalé ≠ battu. Jours ≠ séances. | Pas de conclusion sur données insuffisantes. |
| **UX50** | P2 | ens. | À concevoir | Du point de courbe vers la séance. | Origine retrouvable. |

### Nutrition, recettes, photos

| ID | P | File | Statut | Travail restant | Critère de fin |
|---|---|---|---|---|---|
| **UX51** | P2 | ens. | À construire | Provenance en mots, pas seulement icônes. | Source ≠ certifié. |
| **UX52** | P2 | ens. | À vérifier | Produit introuvable / pas de caméra : issue. | Le journal reste possible. |
| **UX53** | P2 | 10a | À construire | Recettes pour cuisiner ; **dans** le shell. Contrat onglet FoodForm vs page CRUD pour le coaché. | Utiles sans tableau de macros. |
| **UX54** | P1 | 5 | À construire | Texte selon `myCoach`. Partage ≠ interrupteur UI. Scopes marketplace = phrase d’acceptation. | Audience connue avant upload. |

### Marketplace et fin de relation

| ID | P | File | Statut | Travail restant | Critère de fin |
|---|---|---|---|---|---|
| **UX55** | P2 | M5 | À vérifier | Filtres exacts en code. Pas de % inventé. | On sait ce qu’on demande. |
| **UX56** | P1 | M5 | Partiel | États pending/… existent. **Copy :** accepté = **suivi actif**, pas un paiement. | Pas de 2ᵉ demande identique ; effet compris. |
| **UX57** | P1 | M2a | À vérifier | UI départ présente. Listes *gardes / s’arrête / ne se transmet pas*. | Anticiper accès après départ. |
| **UX58** | P1 | M2a | À vérifier | Reprise solo sans onboarding ; programme en pause. | Pas d’histoire effacée ni dossier transféré. |
| **UX59–61** | P1 | M6 | Reporté | Billing fermé. | Quand chantier 3 s’ouvre. |

### Qualité transversale

| ID | P | File | Statut | Travail restant | Critère de fin |
|---|---|---|---|---|---|
| **UX62** | P1 | chaque | Partiel | Dans chaque lot. OverflowMenu : Échap + focus (10g). | Parcours essentiels sans souris, zoom 200 %. |
| **UX63** | P1 | 3+6 | À construire | `fetchPrograms` / stats / progression : erreur ≠ vide. | Données déjà là conservées + réessai. |
| **UX64** | P2 | ens. | À construire | Permission au bon moment ; rappel = objet encore vrai. | Pas de relance d’une tâche finie. |
| **UX65** | P2 | 10f | Partiel | FR/EN clés ≠ UI. Progression en kg collé. Fuseau lisible. | Changer d’unité ne change pas la donnée. |
| **UX66** | P2 | ens. | À construire | Audience, export éventuel, delete, liens. | Contrôle sans écrire au support. |
| **UX67** | P2 | ens. | À concevoir | Aide contextuelle. | Pas de dump de parcours. |
| **UX68** | P1 | ens. | À vérifier | Stabilité chargement ; pas de double submit. | Action prise en compte tout de suite. |
| **UX69** | P3 | rep. | Reporté | Raccourcis Accueil seulement si la nav par défaut échoue. | Test comparatif. |
| **UX70** | P2 | cont. | Continu | Mesurer réussite de tâche, pas le temps passé. | Sans contenu de messages / photos. |

---

## Décisions de cadrage (conservées)

| Suggestion | Décision |
|---|---|
| Questionnaire en phases | Oui au regroupement utile. Pas exactement 3 phases. UX03–05, UX80. |
| Silhouette | P3. UX06. |
| Accusé de check-in | Oui. Date seulement si réelle. Pas « transmis ». UX26. |
| Empty sans programme | Oui, avec contact. UX10. |
| Cartes avant/après IA | Oui, avec portée. UX20, UX23, UX43. |
| Équivalence alimentaire « compensation » | Non. UX51–53. |
| Mode simple / avancé parallèle | Non : disclosure progressive. |
| Repos auto | Volontaire, après coche. UX15. |
| Actions groupées coach | P3. UX38. |
| 6ᵉ onglet / Copilote tab / switcher chrome | Non. |

---

## Preuves de parcours (quand un lot se clôt)

Comptes de test, pas la CI seule.

| Rôle | Scénario | Observer |
|---|---|---|
| Solo / coaché | Séance : 1 série cochée, 1 préremplie non cochée, Terminer | Bilan, historique, graphes, 360 coach : **une** série réalisée |
| Coach dual-rôle | Personnel → Profil → Mode coach OFF avec clients actifs | Refus ou confirmation chiffrée ; roster encore joignable |
| Coaché | Invite → questionnaire incomplet | Aujourd’hui + messages accessibles ; bannière ; reprise |
| Solo | Photos | Aucun texte « ton coach voit » |
| Coaché / solo | Deux séances le même jour dans le calendrier | Les deux listées |
| Coach / coaché | Texte dans un fil, changer de conversation, revenir | Brouillon intact ; dismiss Accueil ≠ lu |
| Coaché | Entraînement sans éditer le plan | « Mon programme » lecture ; courbes d’exo **après** vérité des séries |
| Coach | File : deux signaux, Passer | Un seul écarté ; ancienneté visible |
| Tous | Petit écran, clavier, FR/EN, zoom | Lot concerné toujours faisable |

Références a11y : [formulaires multi-pages W3C](https://www.w3.org/WAI/tutorials/forms/multi-page/), [cibles WCAG 2.2](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html), [messages de statut](https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html).
