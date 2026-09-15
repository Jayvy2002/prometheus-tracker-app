# Chantier — Prometheus

> **RÔLE — SEULE SOURCE DU TRAVAIL RESTANT**
>
> Ordre des travaux, décisions, défauts à corriger, fonctionnalités à construire, critères de fin.
>
> **Instruction agents :** un élément sort uniquement après **preuve de code + parcours réel**, ou après abandon produit noté ici. Ne pas en faire un journal de PR. Git garde l’historique ; `README.md` décrit l’app actuelle ; `VISION.md` la destination ; `RAPPORT_UX_FONCTIONNALITES.md` et `AUDIT_NAVIGATION_UX.md` diagnostiquent — **ils n’ordonnent pas**. Si un diagnostic contredit ce fichier, **ce fichier gagne**.

**Mis à jour : 15 septembre 2026.** Lots 1–4 dans Git. File : lots **11–13** inscrits après 10 (biblio exo, Ask solo pages, Ask autres surfaces). Lots 2–3 : apply prod SQL encore dû. Lots 3–4 : parcours live encore dus. Une CI verte ne clôt pas une ligne UX.

**Lot ouvert : 5 — photos et audience.** Lot 1 : Terminé. Lots 2–4 : À vérifier.

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
| Ask solo = chat `/prometheus` (coach) | Barre **sur** les pages (lots 12–13). Solo : Entraînement / Nutrition puis autres surfaces. Coaché : brouillon Messages (UX93), pas `/prometheus`. |
| Enregistrer recette ou réécrire le plan sans tap | Carte avant/après, puis confirmation. Jamais d’auto-apply |
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
| `Terminer` **n’écrit plus** `completed` sur les séries restantes | — |
| Affichage = séries **cochées** (`isPerformedSet` / `readableSets`) | Parcours 15 sept. : bilan + recap + 360 (1 cochée, 1 non cochée) |
| Repos 90 s lancé après coche | Préférence auto **volontaire** (UX15) |
| Assign programme : plus de premier client auto | Recap destinataire dans le modal (parcours dû, UX21) |
| Inputs séance agrandis, cibles 44 px (#91) | OverflowMenu clavier (lot 10) |
| RPC `client_end_coach_link` + UI Profil + tests | Preuve prod, notif, sérialisation, copy 3 listes (M2a) |
| Annuaire / offre / demandes en code | Copy « accepté = suivi actif » (M5) |
| Table `exercises` + `primary_muscles` / `muscleLabels` + picker | **Pas** de vidéo ni mannequin. Lot 11 étend, ne recrée pas |
| `accountContext`, espaces Personnel / Coaching | SQL `none` si roster `coach_id` actif : **apply prod dû** (lot 2) |
| Questionnaire prise en charge : plus de `path="*"` ; bannière + lien `/questionnaire` | Parcours invite live dû (lot 4) |

---

## File d’exécution — ce qu’il reste à faire maintenant

Travailler **un lot à la fois**, dans cet ordre. Les IDs entre parenthèses sont le contrat du catalogue. Un ID **absent de cette file** ne se commence pas tant que les lots 1–10 ne sont pas verts (sauf P1 nouveau du même type : ment / verrouille / détruit un accès).

| # | Lot | Statut | Preuve de fin |
|---|---|---|---|
| **1** | **Vérité des séries réalisées** (UX12, UX17, UX49) | **Terminé** | Parcours 15 sept. : 1 série cochée + 1 non cochée → bilan (volume / 1RM / fait « non cochée(s) »), recap, 360 coach (`readableSets` : seule la cochée). Auto-close 30 s retiré ; `prCount` mort retiré ; plus de « Conseil du coach ». UX49 « jours ≠ séances » → lot 6. |
| **2** | **Désactivation mode coach** (UX78) | **À vérifier** | SQL `20260914221500` : `none` refuse si lien **actif** `coach_id = moi`. UI Profil : N=0 confirme et désactive ; N>0 bloque (chiffre, « Voir mes clients », **pas** d’RPC). Parcours Personnel 15 sept. (0 et 1 client réel). **Reste :** apply prod — la fonction live n’a pas encore le garde. |
| **3** | **Programmes : écriture honnête** (UX20, UX21, UX63) | **À vérifier** | SQL `20260915133000` : `save_program` = métadonnées + `sync_program_days` + révision ; `stale` si version. UI : éditeur / solo = une RPC ; `deleteProgram` n’ôte la liste qu’après succès ; `fetchPrograms` conserve la liste + réessai ; assign = recap destinataire / date. **Reste :** apply prod + parcours live. |
| **4** | **Questionnaire sans prison** (UX80, UX02, UX03, UX04) | **À vérifier** | Plus de `path="*"` sur questionnaire **prise en charge** incomplet, ni mur sur échec de fetch. Bannière + lien Profil « Mon questionnaire » (`/questionnaire`). Brouillon conservé. Audience puis notice santé avant les questions `medical`. Durée « 60 secondes » retirée. Intake kiné (7 écrans, `path="*"`) inchangé. **Reste :** parcours live (invite → Aujourd’hui / messages / compte). |
| **5** | **Photos et audience** (UX54) | À construire | Solo ne lit plus « Ton coach les voit ». Texte = audience réelle. Consentement marketplace (`progress_photos` dans le paquet) = phrase d’acceptation. Coach actuel : dire si l’historique antérieur au lien est visible. Pas un 5ᵉ module unique. |
| **6** | **Calendrier, recherche, erreur ≠ vide** (UX48, UX49, UX63) | À construire | Plusieurs séances (et pesées) le même jour listées. Recherche progression : **tous** les matchs — `filteredExercises.slice(5)` saute les 5 premiers **après filtre**. Stats / progression : erreur avec réessai, pas un historique fantôme. |
| **7** | **Messages : brouillon et lu** (UX29–31, UX85) | À construire | Brouillon par compte × conversation, restauré au retour. Relance préremplie n’écrase pas un brouillon perso. Écarter une carte Accueil ≠ marquer lu. `read_at` seulement si le serveur a réussi. Pas d’accusé « lu » sans preuve. |
| **8** | **Trouver programme et progression** (UX08, UX10, UX81, UX84, UX07 athlète) | À construire **après 1** | Coaché : lien **lecture** « Mon programme » depuis Entraînement (aujourd’hui `!coached`). Puis `/exercise-progress` en lecture — **pas** `/stats` ni calendrier dans le même PR. `waiting_program` → Messages (aujourd’hui `ListRow` sans `to`). FAB / **Nouveau** : pas « nouvelle séance » en doublon du jour dû ; libeller hors programme. Accueil : vide honnête si rien à faire. |
| **9** | **File coach et continuité** (UX09, UX33, UX34, UX07 coach, UX35) | À construire | Chaque carte : pourquoi, **depuis quand**, une action. « Passer » = **un** signal, annulable. Contexte roster conservé au retour. 360 : « depuis ta dernière visite » ; dernière séance = définition lot 1. |
| **10** | **Cohérence restante** | À construire | Une PR par ligne ci-dessous. |
| **11** | **Bibliothèque d’exercices** (UX86) | À construire **après 10** | Catalogue **complet** : chaque exo a une **vidéo d’exécution** et un **mannequin blanc** dont les muscles travaillés sont en **rouge** (`primary_muscles` / `secondary_muscles`, ids `muscleLabels`). Picker et fiche séance s’en servent. Une PR. |
| **12** | **Ask solo contextualisé** | À construire **après 10** | Solo seulement. Bouton IA sur Entraînement et Nutrition → barre de question. Pas d’onglet, pas `/prometheus`. Proposition **revue** : ignorer / appliquer une fois / enregistrer. Jamais auto-apply. Une PR par ligne. |
| **13** | **Ask : autres surfaces** | À construire **après 12** | Même contrat (contexte de page, validation humaine). Séance en cours, journal / macros restants, check-in, jour loupé, coaché = brouillon Messages, alternatives d’exo (après 11), plan semaine + courses, swap d’ingrédient, deload. Une PR par ligne. |

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

### Lot 12 — une PR par ligne

| # | Contenu | IDs |
|---|---|---|
| 12a | Barre Ask **Entraînement** : question + perfs, programme actuel, blessures / limites, expérience, fréquence, focus. Proposition d’ajustement **revue** : ignorer / appliquer **cette séance** / enregistrer comme jour de plan **nommé**. Réutilisable. | UX87 |
| 12b | Barre Ask **Nutrition** : question + cibles kcal/macros, allergies, type d’alimentation, déjà consommé **aujourd’hui**. Recette proposée **revue** : ignorer / ajouter **une fois** au journal / **enregistrer** dans Mes recettes (réutiliser plus tard). | UX88 |

### Lot 13 — une PR par ligne

| # | Contenu | IDs |
|---|---|---|
| 13a | Ask **pendant** la séance (`WorkoutForm`) : séries déjà cochées + exo courant. Proposition = **cette séance** sauf enregistrement explicite. | UX89 |
| 13b | Journal du jour / kcal-macros **restants** → 2–3 idées de repas. Même choix qu’en 12b (ignorer / une fois / Mes recettes). | UX90 |
| 13c | Check-in : proposer une **note de séance** (pas un diagnostic médical). Enregistrable au choix. | UX91 |
| 13d | Jour / semaine loupé : proposer un **recalage** du plan. Pas d’auto-skip, pas de « rattrapage » silencieux. | UX92 |
| 13e | Ask **coaché** : ouvre un **brouillon Messages** (jamais d’envoi auto). Recette perso = choix du client, pas le plan coach. | UX93 |
| 13f | **Après lot 11.** Alternatives d’exo depuis la fiche (mêmes muscles, matériel). Revue puis swap **cette séance**. | UX94 |
| 13g | Plan repas **semaine** + liste de courses, enregistrable. | UX95 |
| 13h | Swap d’ingrédient (allergie / stock) en gardant les cibles. | UX96 |
| 13i | Deload / charges et repos de la **dernière fois** sur le même exo. Proposition revue, pas d’auto-apply. | UX97 |

**Après le lot 13 :** preuve prod des lots M encore « À vérifier », M7, confort P2/P3 restant, billing.

---

## Ancres code (lot 1–13) — ne pas chercher à l’aveugle

| Lot | Où ça ment / casse aujourd’hui |
|---|---|
| 1 | **Corrigé + parcours 15 sept.** `isPerformedSet` ; `readableSets` = `completed`. Bilan / recap / 360 : 1 cochée + 1 non cochée. |
| 2 | **Corrigé (Git).** `set_coaching_role('none')` → `coach_has_active_clients` si lien actif `coach_id = moi`. UI : modal chiffrée ; N>0 sans RPC. **Prod : fonction encore ancienne** — apply dû. |
| 3 | **Corrigé (Git).** `save_program` enveloppe métadonnées + `sync_program_days`. `deleteProgram` attend le succès. `fetchPrograms` conserve la liste + `programsError`. Recap assign. **Prod : RPC absente** — apply dû. |
| 4 | **Corrigé (Git).** Plus de `path="*"` sur questionnaire prise en charge. Fetch fail = bannière + réessai. Lien `/questionnaire`. Audience avant les questions `medical`. Kiné inchangé. **Reste :** parcours live. |
| 5 | `coaching.photos.subtitle` inconditionnel. `DIRECT_INVITE_CONSENT_SCOPES` inclut `progress_photos`. `is_coach_of` exige `status = 'active'` (pas « sans statut ») ; le trou est l’**audience affichée** et l’historique vu par le coach **actuel**. |
| 6 | `CalendarPage` : `workouts` et `weight_measurements` du jour en `.maybeSingle()`. Recherche : `filteredExercises.slice(5)` **après** le filtre. |
| 7 | Brouillon local au composant. `Dashboard` `onDismiss` → `markCoachMessageRead`. Store : `update({ read_at })` **sans** check `error`, puis état local optimiste. |
| 8 | `WorkoutPage` : `CardLink` programmes si `!coached && !assignment?.program`. `CoachedAthleteRedirect` bloque `/exercise-progress`. `waiting_program` : `ListRow` sans `to`. FAB `nav.addWorkout` → `/workout/new`. |
| 9 | `CoachTodayQueue` `onSkip` → `dismissQueueItems(group.items.map(...))` (tout le groupe). Pas d’ancienneté sur la carte. |
| 11 | Table `exercises` : nom, muscles, consignes. **Pas** de `video_url` / mannequin. Picker : `ExercisePicker`. |
| 12 | `/prometheus` = `CoachOnly`. Solo : revue hebdo Accueil (`soloCopilot`), pas de barre Ask sur `/workout` ni `/nutrition`. Recettes = `recipeStore`. |
| 13 | `WorkoutForm` : pas d’Ask in-session. Check-in : champs, pas de note proposée. Coaché : Ask n’existe pas ; Messages = texte. Picker : pas d’alternatives muscle/matériel. |

---

## Chantier 2 — Continuité, identité, marketplace

**Décision :** un moteur, identité durable, capacité coach ≠ accompagnement personnel, marketplace et suivi dans la même app.

**État code (14 sept. 2026, `3233932`) — ce n’est pas la preuve prod.** Intention après compte, espaces Personnel/Coaching, `client_end_coach_link`, invitation consentie, annuaire / demandes / offre, `respond_coaching_request` **active déjà** le lien **sans paiement**. Les lignes M restent ici tant que migration Git + apply prod + parcours n’ont pas été **prouvés**.

| Lot | Statut | Conditions de fin | Reste réel |
|---|---|---|---|
| **M0** Inventaire rôles / policies vs carte | À vérifier | Scénarios solo, coaché, coach, coach-athlète. Aucun changement de droits. | Revues UX 14 sept. = UI ; confirmer vs policies live, puis retirer. |
| **M1** Capacités + espaces Personnel/Coaching | À vérifier | Backfill coachs ; aucun auto-lien ; rollback UI sans drop de colonnes. | `accountContext` existe. Prouver droits serveur ≠ espace affiché, dual-rôle. **Lot 2 (UX78) : UI + SQL Git ; apply prod encore dû.** `user_roles` reste l’écriture. |
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

## Après la file 1–10 (lots 11–13 et catalogue — ne pas commencer avant)

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
| Bibliothèque exo : vidéo + mannequin muscles | UX86 | Lot 11, après 10 |
| Ask solo Entraînement + choix ignorer / cette séance / plan nommé | UX87 | Lot 12a, après 10 |
| Ask solo Nutrition + choix ignorer / une fois / Mes recettes | UX88 | Lot 12b, après 10 |
| Ask pendant la séance | UX89 | Lot 13a, après 12 |
| Reste macros / journal → idées repas | UX90 | Lot 13b, après 12 |
| Check-in → note de séance (pas diagnostic) | UX91 | Lot 13c, après 12 |
| Jour loupé → recaler le plan | UX92 | Lot 13d, après 12 |
| Ask coaché = brouillon Messages | UX93 | Lot 13e, après 12 |
| Alternatives d’exo depuis la fiche | UX94 | Lot 13f, après 11 et 12 |
| Plan repas semaine + liste courses | UX95 | Lot 13g, après 12 |
| Swap d’ingrédient | UX96 | Lot 13h, après 12 |
| Deload / charges-repos dernière fois | UX97 | Lot 13i, après 12 |

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
| **0B** auth / intention / invite | À vérifier | Lock questionnaire prise en charge retiré (lot 4 Git). Intake kiné : 7 écrans **conservés**. Parcours invite dû. |
| **0C** vérité produit | **Partiel** | Cibles macros : corrigé. Terminer n’écrit plus `completed` sur le reste. Affichage = séries cochées ; parcours 15 sept. (bilan, recap, 360). UX49 jours ≠ séances → lot 6. |
| **1** design system | À vérifier | `ListRow` / 44 px (#91). OverflowMenu clavier (10g). |
| **2** accessibilité | À vérifier | Cibles 44 px présentes ; clavier / zoom / lecteur restants. |
| **3** navigation | **Partiel** | `navConfig`, 5 onglets, Copilote hors tab, switcher Profil. Trouvabilité ; recettes ; `PageTransition` (lots 8, 10). |
| **4** dashboard | **Partiel** | Un hero ; proposition IA = notice (#91). Message + check-in + reminder peuvent coexister. `waiting_program` inerte. |
| **5** Coach Today | **Partiel** | Empty + sévérité texte + featured. Pas de « depuis quand ». Passer écarte **tous** les signaux du client. |
| **6** Client 360 | À vérifier | Dernière séance = séries cochées (parcours 15 sept.). Onglet « health » à renommer (10c). « Depuis ta dernière visite » (lot 9). |
| **7** Setup 4 étapes | À vérifier | Preview écrans client encore faible (10j). |
| **8** Messages / Prometheus | **Partiel** | Retry / safe-area. Brouillon non durable ; lu local trop optimiste (lot 7). |
| **9** Marketplace vitrine | À vérifier | Pas de faux prix. Acceptation = **lien actif**. Copy à aligner. |
| **10** Programmes builder | **Partiel** | Pas de premier client auto. Recap destinataire (code). `save_program` Git ; delete / fetch honnêtes. Apply prod + parcours (lot 3). |
| **11** Nutrition / séance / scanner | À vérifier | Recettes hors chrome (10a). UX15 = auto **optionnel** après coche. |
| **12** Progression / photos | **Partiel** | Hub solo. Coaché bloqué (lot 8). Séries cochées : lot 1. Calendrier / `slice(5)` : lot 6. Sous-titre photos menteur (lot 5). |
| **13** Profil | **Partiel** | Groupes OK. Toggle mode coach : N=0 / N>0 joués 15 sept. Apply prod SQL (lot 2). SoloHub encore un tiroir mobile. |
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
| **UX02** | P1 | 4 | **À vérifier** | Invitation : contexte OK en code. Lock `path="*"` retiré (Git). **Reste :** parcours invite. | Aucune invite invalide sans issue ; rattachement clair. |
| **UX03** | P2 | 4 | **À vérifier** | Complément au moment utile. Durée « 60 secondes » retirée. **Reste :** parcours reprise brouillon. | On sait pourquoi maintenant ; reprise sans ressaisie. |
| **UX04** | P1 | 4 | **À vérifier** | Audience en tête de formulaire ; notice santé (facultatif, destinataire, refus ≠ mur) avant la première question `medical`. **Reste :** parcours live. | Destinataire et conséquence d’un refus connus. |
| **UX05** | P2 | ens. | À construire | Résumé + correction par rubrique ; nouvelle version = complément. | Pas de parcours entier à refaire. |
| **UX06** | P3 | rep. | Reporté | Silhouette facultative vs liste. | Seulement si un test le justifie. |
| **UX80** | P1 | 4 | **À vérifier** | Bannière + hub « Mon questionnaire ». Plus de `path="*"`. Brouillon. Échec fetch ≠ mur. **Reste :** parcours live. | Messages / Aujourd’hui / compte accessibles ; réponses conservées. |

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
| **UX12** | P1 | 1 | **Terminé** | Seule une série **cochée** compte (`isPerformedSet` / `readableSets`). Parcours 15 sept. : bilan, recap, 360. | — |
| **UX13** | P2 | ens. | À construire | Reprendre les valeurs ≠ ajouter une série. | Pas de série en trop par raccourci. |
| **UX14** | P2 | 10f | À vérifier | Inputs séance agrandis. Unités partout. | Édition conservée ; unité du profil. |
| **UX15** | P2 | ens. | À vérifier | Repos 90 s déjà lancé après coche. Préférence auto **volontaire** ; pas au préremplissage. | Désactivable ; jamais sur un simple fill. |
| **UX16** | P1 | ens. | À construire | Langage : appareil / sync / action requise. | Après coupure, on sait ce qui est conservé. |
| **UX17** | P1 | 1 | **Terminé** | Plus de `setTimeout` 30 s. Fermer → recap. Faits, pas « Conseil du coach ». Parcours 15 sept. | — |

### Exercices et programmes

| ID | P | File | Statut | Travail restant | Critère de fin |
|---|---|---|---|---|---|
| **UX18** | P2 | ens. | À construire | Variantes / matériel / récents. | Bonne variante avant sélection. |
| **UX86** | P2 | 11 | À construire | **Après 10.** Vidéo d’exécution + mannequin blanc, muscles travaillés en rouge. Étendre `exercises`, pas un second catalogue. | On voit le mouvement et les muscles avant de choisir. |
| **UX19** | P2 | ens. | À concevoir | Remplacement « cette séance » vs « proposer au plan ». | Pas de réécriture silencieuse du futur. |
| **UX20** | P1 | 3 | **À vérifier** | RPC `save_program` (Git) : atomique + version. **Reste :** apply prod + parcours. | Le client voit ou ne voit pas ; pas de plan à moitié. |
| **UX21** | P1 | 3 | **À vérifier** | Plus de premier client auto. Recap destinataire / date dans le modal. Parcours dû. | Parcours bibliothèque sans destinataire accidentel. |
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
| **UX78** | P1 | 2 | **À vérifier** | SQL Git + modal chiffrée. Parcours Personnel 15 sept. : N=0 désactive ; N>0 bloque sans RPC, roster joignable. **Reste :** apply prod. | Dual-rôle Personnel ne peut pas couper le roster en prod. |

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
| **UX87** | P2 | 12a | À construire | **Après 10. Solo.** Barre Ask Entraînement. Contexte : perfs, programme, blessures / limites, expérience. Ajustement proposé → revue : ignorer / cette séance / plan nommé. | La réponse est actionnable et durable, jamais auto-appliquée. |
| **UX88** | P2 | 12b | À construire | **Après 10. Solo.** Barre Ask Nutrition. Contexte : cibles kcal/macros, allergies, type d’alimentation, consommé aujourd’hui. Recette → revue : ignorer / une fois au journal / Mes recettes. | Recette proposée = enregistrable **au choix**, jamais forcée. |
| **UX89** | P2 | 13a | À construire | **Après 12. Solo.** Ask dans `WorkoutForm`. Contexte : séries cochées, exo courant. | N’écrit le plan que si on enregistre. |
| **UX90** | P2 | 13b | À construire | **Après 12. Solo.** Restes du jour → idées de repas. | Même choix qu’UX88. |
| **UX91** | P2 | 13c | À construire | **Après 12.** Check-in → note de séance. Pas d’interprétation santé. | Proposition ≠ diagnostic. |
| **UX92** | P2 | 13d | À construire | **Après 12.** Semaine / jour loupé → recaler. | Pas d’auto-skip. |
| **UX93** | P2 | 13e | À construire | **Après 12. Coaché.** Ask = brouillon Messages. Jamais d’envoi. Recette perso ≠ plan coach. | Le coach lit ce que le client envoie. |
| **UX94** | P2 | 13f | À construire | **Après 11 et 12.** Alternatives depuis la fiche exo (muscles, matériel). | Swap cette séance après revue. |
| **UX95** | P2 | 13g | À construire | **Après 12. Solo.** Semaine + courses. | Enregistrable, pas auto-appliqué. |
| **UX96** | P2 | 13h | À construire | **Après 12. Solo.** Swap ingrédient (allergie / stock). | Cibles conservées. |
| **UX97** | P2 | 13i | À construire | **Après 12. Solo.** Deload / charges et repos dernière fois. | Revue avant écriture. |

### Calendrier et indicateurs

| ID | P | File | Statut | Travail restant | Critère de fin |
|---|---|---|---|---|---|
| **UX47** | P2 | ens. | À concevoir | Prévu / commencé / terminé ; report expliqué. | Le passé ne disparaît pas. |
| **UX48** | P1 | 6 | À construire | Plus de `maybeSingle()` séance (ni pesée) du jour. Fenêtre = période vue. Requête périmée ignorée. | Deux séances le même jour visibles. |
| **UX49** | P2 | 1+6 | **Partiel** | Lot 1 : manque ≠ 0 sur une journée sans série cochée ; record égalé ≠ battu. **Reste lot 6 :** jours ≠ séances. | Pas de conclusion sur données insuffisantes. |
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
| **UX63** | P1 | 3+6 | **Partiel** | `fetchPrograms` : erreur conserve la liste + réessai. **Reste lot 6 :** stats / progression. | Données déjà là conservées + réessai. |
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
| Cartes avant/après IA | Oui, avec portée. UX20, UX23, UX43, UX87–97. |
| Ask solo | Barre sur Entraînement / Nutrition (lot 12), puis autres surfaces (lot 13). Pas d’onglet, pas `/prometheus`. Coaché : brouillon Messages (UX93), pas `/prometheus`. |
| Proposition IA | Toujours un choix : ignorer / une fois / enregistrer. Jamais d’auto-apply. |
| Équivalence alimentaire « compensation » | Non. UX51–53. |
| Mode simple / avancé parallèle | Non : disclosure progressive. |
| Repos auto | Volontaire, après coche. UX15. |
| Actions groupées coach | P3. UX38. |
| 6ᵉ onglet / Copilote tab / switcher chrome | Non. |

---

## Preuves de parcours (quand un lot se clôt)

Comptes de test, pas la CI seule. **Joué 15 sept.** (comptes jetables, puis supprimés) : séance 1 cochée + 1 non cochée (bilan, recap, 360) ; dual-rôle Personnel N=0 et N>0. Lots 3–4 : code Git ; apply prod (lots 2–3) et parcours live (lots 3–4) encore dus.

| Rôle | Scénario | Observer |
|---|---|---|
| Solo / coaché | Séance : 1 série cochée, 1 préremplie non cochée, Terminer | **Joué.** Bilan / recap / 360 : **une** série réalisée. Graphe `/exercise-progress` : même agrégateur, pas un écran dédié rejoué. |
| Coach dual-rôle | Personnel → Profil → Mode coach OFF avec clients actifs | **Joué (UI).** N>0 : refus chiffré, « Voir mes clients », pas d’RPC, roster intact. N=0 : désactive. Apply prod SQL encore dû. |
| Coaché | Invite → questionnaire incomplet | Code Git : Aujourd’hui / messages / compte plus prison. Bannière + `/questionnaire`. **Reste :** parcours live. |
| Solo | Photos | Aucun texte « ton coach voit » |
| Coaché / solo | Deux séances le même jour dans le calendrier | Les deux listées |
| Coach / coaché | Texte dans un fil, changer de conversation, revenir | Brouillon intact ; dismiss Accueil ≠ lu |
| Coaché | Entraînement sans éditer le plan | « Mon programme » lecture ; courbes d’exo **après** vérité des séries |
| Coach | File : deux signaux, Passer | Un seul écarté ; ancienneté visible |
| Coach | Assigner un programme depuis la bibliothèque | Recap nom + destinataire + date avant confirm. Pas de premier client auto. |
| Coach / solo | Enregistrer un programme (nom + un jour) | Une écriture ; échec = rien changé. Liste encore là si le chargement rate. |
| Tous | Petit écran, clavier, FR/EN, zoom | Lot concerné toujours faisable |

Références a11y : [formulaires multi-pages W3C](https://www.w3.org/WAI/tutorials/forms/multi-page/), [cibles WCAG 2.2](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html), [messages de statut](https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html).
