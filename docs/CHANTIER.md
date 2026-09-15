# Chantier — Prometheus

> **RÔLE — SEULE SOURCE DU TRAVAIL RESTANT**
>
> Ordre des travaux, décisions, défauts à corriger, fonctionnalités à construire, critères de fin.
>
> **Instruction agents :** un élément sort uniquement après **preuve de code + parcours réel**, ou après abandon produit noté ici. Ne pas en faire un journal de PR. Git garde l’historique ; `README.md` décrit l’app actuelle ; `VISION.md` la destination ; `RAPPORT_UX_FONCTIONNALITES.md`, `AUDIT_NAVIGATION_UX.md` et `AUDIT_ARCHITECTURE.md` diagnostiquent — **ils n’ordonnent pas**. Si un diagnostic contredit ce fichier, **ce fichier gagne**.

**Mis à jour : 15 septembre 2026 (soir).** Lots **1–16 Terminé**. **M0–M5 Terminé**. **UX05 / UX07** (Dashboard + rings) **/ UX08 / UX09 / UX10 / UX13 / UX15 / UX16 / UX18 / UX25 / UX28 / UX36 / UX44 / UX51 / UX84 Terminé**. **M7–M8 Conçu**. Contrats catalogue **UX19 / 22 / 23 / 27 / 32 / 47 / 50 / 67 / 112 Conçu**. Lots **17–23 Terminé**. **M6 Reporté**.

| **Lot ouvert :** ens. (catalogue Après 1–10). Lots **1–16**, **M0–M5**, **M7–M8 (conçu)**, **UX05 / UX07 / UX08 / UX15 / UX18 / UX25 / UX28 / UX36 / UX44 / UX84** et **17–23 Terminé**.

**Preuve live 15 sept. soir** — comptes SQL `chantier-*-1515@invalid.local` (signup 429 contourné). Vite `127.0.0.1:5174`. Chrome headed + session JWT. Prod `phyuijjekxtjvipjtdfv`.

| Lot | Joué live | Reste (ne pas reconstruire) |
|---|---|---|
| **2** Désactivation mode coach | **PASS** (après-midi). RPC + UI Personnel N>0. | — |
| **3** Programmes | **PASS.** Modal Assigner : « Plan Chantier Force sera assigné à Chantier Client à partir du {date} ». Pas de 1er client auto. | — |
| **4** Questionnaire / invite | **PASS.** `/invite/chantier-invite-1515` : consentement, scopes, Accepter. Puis Aujourd’hui / Messages / Profil / `/questionnaire` (vide honnête, pas de mur). | — |
| **5** Photos | **PASS.** Solo : « Visible seulement par toi ». Coaché : « Chantier Coach les voit dans ta fiche… ». 360 Progression : « Tu vois toutes les photos de ce client… ». | — |
| **6** Calendrier / recherche | **PASS.** Recherche `/exercise-progress` « Squat » (liste filtrée). Deux séances le même jour déjà jouées. Unique pesée/jour = contrainte prod. | — |
| **7** Messages | **PASS.** Dismiss Accueil (« Ignorer ») : carte masquée ; `coach_messages.read_at` **reste NULL**. Brouillon déjà prouvé. | — |
| **8** Programme coaché | **PASS.** `/programs` coaché : « Plan Chantier Force », Squat 3×5, Bench 3×8, semaine 1/8. Lecture seule. | — |
| **9** File / roster | **PASS.** `/clients?filter=checkin` : « Filtre : checkin · N client(s) · Effacer le filtre ». | — |
| **10** Cohérence | **PASS.** 10d : « Avant d’envoyer » + destinataire + « Effet : brouillon… ». 10e : toast « Enregistré — visible par Chantier Coach ». 10a–c, 10j déjà joués. | — |
| **13** Ask autres surfaces | **PASS.** 13a séance : Ignorer / Cette séance, pas « jour de plan ». 13b : 3 repas + journal / Mes recettes. 13c : note + « pas un diagnostic » ; textarea préremplie. 13d : Recaler, pas d’auto-skip. 13e : brouillon Messages. 13f : Deadlift → Hip Thrust, cette séance. 13g semaine + courses. 13h swap ingrédient. 13i Deload 2 séries. | — |
| **14** Types de séries | **PASS.** Builder : Type (warmup…cluster) + Groupe A + Bench Drop / Chutes 3. SQL persisté. Logger : SUPERSET + Bench D 100/80/60 (1 coche, 3 poids). Pas « Ajouter un exercice ». Accueil `toWorkoutTemplateExercise`. | — |
| **15** Confort séance | **PASS.** 15a barre « Minuteur de repos · 1:29 » après Échap. 15b « Programme créé ». 15c sleeve + 7 disques, total barre. 15d date picker « Copier depuis ce jour ». 15e `/scanner?date=2026-09-15&category=snack`. 15f accept HEIC. | — |
| **16** Outillage coach | **PASS.** FAB Check-in ; Dupliquer ; 360 notes exo ; setup copié ; tabs coaché 5 (Aujourd’hui / Entraînement / Check-in / Messages / Profil). Nutrition = Profil + FAB. | — |
| **M0** Rôles / policies | **PASS.** Solo / coaché / coach / coach-athlète. RLS `workouts` + `is_coach_of` prod. Espace Personnel ≠ roster. | — |
| **M1** Espaces ≠ droits | **PASS.** Switcher Personnel : nav sans Clients ; `/clients` direct toujours le roster. `user_roles` reste `coach`. 0 auto-lien. | — |
| **M2a** Départ client | **PASS.** Modal : Tu gardes / Ça s’arrête / pause / Ça ne se transmet pas. RPC live : lien `ended`, rôle `none`, programme `paused`, tracking 0, séance gardée, note coach gardée, notice coach, 2ᵉ appel `not_linked`. | — |
| **M2b** Invite + consentement | **PASS.** Ancienne `accept_coach_invite(text)` : `authenticated` sans EXECUTE. Expiré / épuisé → « Invitation indisponible » + Retour. Déjà lié → « Tu as déjà un coach ». Self → « Tu ne peux pas accepter ta propre invitation ». | — |
| **M3** Intention | **PASS.** `/auth` email+mdp, pas de rôle. Intention après login. `find_coach` → `/coaches` ; Accueil + Entraînement utilisables. Rôle reste `none`. | — |
| **M4** Offre opt-in | **PASS.** Roster sans profil public. Copy « gérer tes clients sans publier ». Publier Coach2 → visible annuaire ; dépublier → retiré. | — |
| **M5** Annuaire / demandes | **PASS.** Déjà lié : « suivi actif… formulaire n’est pas ouvert ». Accepté = « le suivi est actif (pas un paiement) ». SQL : `accepted` + lien `active`. | — |
| **UX10** Empty sans programme | **PASS.** Invitee Accueil : « Ton coach va t’envoyer un programme » → `/messages`. | — |
| **UX07** Dashboard vue d’ensemble | **PASS.** Priorité + « Ta journée » : rings nutrition (mêmes que `/nutrition`) / poids (courbe) / semaine / check-in / suivi. Message et check-in restent visibles à côté d’une séance due. Onglet **Dashboard**. | — |
| **UX09** Enchaîner les fiches | **PASS.** Roster → Invitee `1 / 2` → Client `2 / 2` sans reliste. Check-ins conservé au précédent. Retour liste filtrée. | — |
| **UX13** Reprendre les valeurs | **PASS.** 3 séries ; raccourci remplit la 2ᵉ (80/5/2) ; pas de 4ᵉ rangée. | — |
| **UX16** Offline langage | **PASS.** Bandeau « Hors ligne — tes modifications sont conservées sur cet appareil. » File séances seulement. | — |
| **UX28** Manque ≠ faute | **PASS.** Settings : « séance non loggée » + « Séances non loggées » / « Check-ins en attente ». File : Pas de programme / Séance faite, pas « a manqué ». Ask : « log(s) manquant(s) ». Relance : « comment se passent tes séances ? ». | — |
| **UX36** Filtres roster | **PASS.** Puces Tous / Check-in / … ; « Filtre : Check-in · 1 client(s) » (Invitee) ; Effacer → les deux clients. | — |
| **UX51** Provenance alimentaire | **PASS.** Hit Banana : « Catalogue interne — non certifié ». Saisie « Yaourt nature » : « Saisie manuelle — non certifié ». | — |
| **UX44** Attente IA quittable | **PASS.** Solo `/scanner` : lookup « Recherche du produit » + « Tu peux quitter. Le journal reste possible. » + Annuler → `/nutrition` (journal utilisable, pas de produit appliqué). | — |
| **UX84** Séance hors programme | **PASS.** Jour dû (Solo, mardi) : FAB / header / Ajout rapide = « Séance hors programme » ; logger nommé + « Cette séance n’est pas le jour de programme dû. Tu peux quand même logger. » Jour de repos (Client) : FAB « Nouvelle séance », header « Nouveau ». Pas d’interdiction. | — |
| **UX18** Sélecteur variantes | **PASS.** Solo séance libre : récents (Hack squat) ; recherche `squat` → Variantes Barre / Haltères / Machine ; filtre Machine = Hack squat seul ; tap Squat barre → séance « Squat » pas Hack ; réouverture : Squat en tête des récents. | — |
| **UX05** Résumé questionnaire | **PASS.** Client `/questionnaire` v2 brouillon : résumé par rubrique (Préférences / Complément) ; Compléter une rubrique seulement ; Retour au résumé ; v1 complétée réutilisée (notice « Answers reused… ») ; pas de parcours entier à refaire. SQL `completed` reste non éditable. | — |
| **UX25** Check-in cœur vs détails | **PASS.** Solo : cœur sommeil/énergie/stress ; « Plus de détails (9) » ; Humeur hors écran tant que fermé. Historique 14 sept. : Qualité 8/10 + Énergie 7/10, pas de « — ». Setup coach : Essentiels / Détails. 360 Client : mêmes deux scores remplis. | — |

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

**Une PR = une capacité observable** (un lot de la file, un item numéroté 10 / 12–16 / 17–23, ou **un domaine** du lot 20). Accessibilité du parcours **dans** le lot produit, pas un cosmétique final. Lots 17–23 : **zéro changement de comportement** visé (sauf le lot 19, visuel tokens = même UI, autres couleurs).

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

IDs **jamais attribués** (ne pas les inventer) : UX71–73, UX79, UX82, UX83. Série structure : **ARCH** (lots 17–23). Ne pas réutiliser les `S01` de `CARTE_PRODUIT.md`.

---

## Décisions stables — ne pas défaire

- Un moteur de séances / programmes / progression. Pas de second logger par rôle. Séance programmée = le plan ; les **types de séries** viennent du builder, le logger s’y adapte (lot 14). Pas de mode plat `hevySimple` une fois 14 livré.
- Cinq onglets mobile. **Pas** de 6ᵉ onglet, **pas** de Copilote dans la tab bar.
- Switcher Personnel / Coaching **uniquement dans Profil**.
- FAB hors espace Coaching, hors `/messages`, `/checkin`, marketplace.
- `TrackingGate` : module off = disparu. Photos hors tab bar coaché.
- L’IA prépare, un humain décide. Jamais d’auto-apply.
- Billing **fermé** : pas de Stripe, paywall, commission.
- L’espace affiché n’accorde aucun droit.
- Simplifier en **nommant** et en mettant l’action principale devant — pas en interdisant séance libre, recettes ou FAB entier.
- Accueil (**Dashboard**) = une **priorité claire** + une **vue d’ensemble** de la journée (entraînement, rings nutrition, poids, check-in, coaching selon les modules). Pas une page réduite à un seul verbe.
- Accessibilité bloquante : dans le lot du parcours.
- Frontend cible : `src/app` / `src/features/<domaine>` / `src/shared` + alias `@/`. Lots **17–23 livrés**. Les écrans métier restent surtout dans `components/` ; `supabase.from` dans l’UI n’est pas encore interdit.
- Données : composant → hook / model → API → Supabase. Pas de `supabase.from()` dans l’UI une fois 23 livré.
- Primitives UI = tokens sémantiques (`surface`, `ink`, `line`, `primary`, …), pas un second système `blue-600` / `neutral-*` (lot 19).

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
| Recettes coupées au coaché « parce qu’il a un coach » | Trancher utilité + contrat de suivi, pas l’autonomie. **Lot 10a** (UX53, UX77). |
| Déclarer nav / accueil / 0C « terminés » | `navConfig` existe ; trouvabilité et chiffres mentent encore |
| Confondre lock questionnaire coach et intake kiné | Kiné (7 écrans, 0B) = sécurité médicale. UX80 = questionnaire **prise en charge** incomplet |
| Une PR « refactor architecture » 300 fichiers + comportement | PR de **structure pures**, un domaine, tests verts entre chaque |
| Injecter `app` / `features` / `shared` dans les lots 11–16 | File **17–23 après 16**. 11–16 = produit |
| Découper `coachingStore` dans un nettoyage | Façade d’abord (**21c**). `CLAUDE.md` tient jusqu’à cette PR |
| Supprimer les 2 migrations `notify_onboarding_signed_ping` | Lock immuable (ARCH11) |
| « Passer tout TypeScript en strict » d’un coup | `tsconfig.app.json` a **déjà** `"strict": true`. Pas de flags extra bang (ARCH10) |

---

## Déjà dans le code — ne pas reconstruire

Preuve = revue `3233932`. **Parcours live souvent manquant** → ne pas marquer Terminé pour autant.

| Livré | Reste éventuel |
|---|---|
| Notice proposition programme solo (plus de mur Accueil) | — |
| `navConfig` unique, 5 onglets, Copilote hors tab, switcher Profil, 5ᵉ onglet Compte coach | Trouvabilité mobile ≠ desktop (lots 8, 10) |
| Cibles macros inventées (150/250/65) retirées | — |
| 1 reminder / jour (deload/repas/eau masqués si coaché) | UX07 : message + check-in visibles avec la priorité ; un rappel à la fois |
| Heroes d’accueil exclusifs | Vide honnête un jour sans tâche. Séance due / waiting / first-run = le hero. |
| File coach : empty, sévérité **texte**, une carte featured | Live 15 sept. : depuis quand + Passer un signal. Filtre roster `?filter=` encore dû. |
| Ancres check-in haut/bas (#91) | Accusé « visible par {coach} » (Git lot 10e). Live : check-in solo seulement. |
| `Terminer` **n’écrit plus** `completed` sur les séries restantes | — |
| Affichage = séries **cochées** (`isPerformedSet` / `readableSets`) | Parcours 15 sept. : bilan + recap + 360 (1 cochée, 1 non cochée) |
| Repos 90 s lancé après coche | Préférence auto **volontaire** (UX15 **Terminé**) |
| Assign programme : plus de premier client auto | Recap destinataire dans le modal (parcours dû, UX21) |
| Inputs séance agrandis, cibles 44 px (#91) | OverflowMenu Échap + focus (Git lot 10g). `aria-current` onglets. |
| RPC `client_end_coach_link` + UI Profil + tests | Preuve prod, notif, sérialisation, copy 3 listes (M2a) |
| Annuaire / offre / demandes en code | Copy « accepté = suivi actif » live (M5 **Terminé**) |
| Table `exercises` + `primary_muscles` / `muscleLabels` + picker | UX18 : variantes / matériel / récents. Pas de vidéo ni mannequin ici — lot 11. |
| `accountContext`, espaces Personnel / Coaching | SQL + RPC live lot 2 : `none` refusé si roster actif (`coach_has_active_clients`) |
| Questionnaire prise en charge : plus de `path="*"` ; bannière + lien `/questionnaire` | Parcours invite encore dû (lot 4, pas de 3ᵉ compte) |

---

## File d’exécution — ce qu’il reste à faire maintenant

Travailler **un lot à la fois**, dans cet ordre. Les IDs entre parenthèses sont le contrat du catalogue. Un ID **absent de cette file** ne se commence pas tant que les lots 1–10 ne sont pas verts (sauf P1 nouveau du même type : ment / verrouille / détruit un accès). Lots **11–16** = produit. Lots **17–23** = structure (`AUDIT_ARCHITECTURE.md`) **après 16**, gravité croissante — **pas** mélangés aux PR biblio / Ask / types de séries.

| # | Lot | Statut | Preuve de fin |
|---|---|---|---|
| **1** | **Vérité des séries réalisées** (UX12, UX17, UX49) | **Terminé** | Parcours 15 sept. : 1 série cochée + 1 non cochée → bilan (volume / 1RM / fait « non cochée(s) »), recap, 360 coach (`readableSets` : seule la cochée). Auto-close 30 s retiré ; `prCount` mort retiré ; plus de « Conseil du coach ». UX49 « jours ≠ séances » → lot 6. |
| **2** | **Désactivation mode coach** (UX78) | **Terminé** | SQL prod + RPC live : `none` OK si roster vide ; `coach_has_active_clients` si lien actif. UI Personnel : N>0 bloque (chiffre, « Voir mes clients », **pas** d’RPC). Parcours 15 sept. soir. |
| **3** | **Programmes : écriture honnête** (UX20, UX21, UX63) | **Terminé** | Recap destinataire live (Assigner → client + date). RPC `save_program` / `stale` déjà prouvés. |
| **4** | **Questionnaire sans prison** (UX80, UX02) | **Terminé** | Invite consentie live ; Aujourd’hui / Messages / Profil / questionnaire accessibles. |
| **5** | **Photos et audience** (UX54) | **Terminé** | Solo + coaché + 360 Progression. |
| **6** | **Calendrier, recherche, erreur ≠ vide** (UX48, UX49, UX63) | **Terminé** | Recherche progression live. Deux séances / unique pesée déjà tranchés. |
| **7** | **Messages : brouillon et lu** (UX29–31, UX85) | **Terminé** | Dismiss Accueil ≠ `read_at`. Brouillon déjà prouvé. |
| **8** | **Trouver programme et progression** (UX08, UX81) | **Terminé** | Lecture programme coaché live. Hub solo déjà prouvé. |
| **9** | **File coach et continuité** (UX09, UX33, UX34) | **Terminé** | Filtre roster live. UX09 : enchaîner les fiches `n / N`. |
| **10** | **Cohérence restante** | **Terminé** | 10d recap Ask + 10e check-in coaché live. 10a–c, 10j déjà prouvés. |
| **11** | **Bibliothèque d’exercices** (UX86) | **Terminé** | Apply prod `20260915180000`. Picker live : Squat listé + iframe YouTube (`youtube-nocookie`) + muscles (quadriceps / fessiers). |
| **12** | **Ask solo contextualisé** | **Terminé** | Barres + revue live. Entraînement : Ignorer / Cette séance / jour de plan. Nutrition : Ignorer / journal / Mes recettes. Jamais auto-apply. |
| **13** | **Ask : autres surfaces** | **Terminé** | Live 15 sept. : 13a–13i (séance / journal / check-in / recale / brouillon Messages / swap exo / semaine+courses / ingrédient / deload). Jamais auto-apply. |
| **14** | **Types de séries : builder + logger** | **Terminé** | Live 15 sept. : builder Type + Groupe + Chutes ; Squat/Bench groupe A ; Bench drop 3 chutes / 1 série. Logger client : tour Superset + 3 poids (100/80/60). Accueil seed `toWorkoutTemplateExercise`. Pas d’exo hors plan. |
| **15** | **Confort séance, journal, photos** | **Terminé** | Live : barre repos après fermeture modal ; séance → jour de plan ; disques visuels (barre 20 kg + palette) ; repas d’un jour choisi ; `/scanner?date=&category=` ; avatar accepte HEIC. |
| **16** | **Outillage coach et chrome coaché** | **Terminé** | Live : FAB Check-in + repas ; Dupliquer → « Programme dupliqué » ; 360 notes « Genoux… » ; setup « Suivi copié » ; 5 onglets coaché (Nutrition via Profil + FAB). |
| **16f** | **Calculateur de disques visuel** (UX103) | **Terminé** | Un **côté de barre**, disques ajoutables (kg 25/20/15/10/5/2.5/1.25 ou lbs 55/45/35/25/10/5/2.5), couleurs haltéro, unité du profil. Parcours live 15 sept. (kg 25+10 = 90 ; lbs 55+45 = 245). |
| **16g** | **Logger séance lisible sur téléphone** | **Terminé** | Header, fiche exo (actions en overflow), rangées de séries. Sans casser le lot 14. Parcours live 390×844 + desktop. **Pas d’ID UX inventé.** |
| **17** | **Hygiène agents** (ARCH01 docs, ARCH09 tests, ARCH12 env) | **Terminé** (17a–17e) | Docs + découverte `src/**/*.test.ts` + nom package + convention env + rename `auditLot*` / `uxPremium`. **Zéro écran.** |
| **18** | **Socle dossiers + alias** (ARCH02 évidents) | **Terminé** | `app` / `features` / `shared` + alias `@/`. Hooks évidents, client Supabase, `ui`, layout, nav. Réexports aux anciens chemins. |
| **19** | **Tokens sémantiques sur primitives** (ARCH06) | **Terminé** | `Button` / `Card` / `Input` / `Select` / `Modal` / `PageHeader` / `EmptyState` / `ErrorState` / `TabList` / `IconButton` = `primary`, `surface`, `ink`, `line`, `danger`. Plus de `blue-600` / `neutral-*` / `rose-*` **dans ces fichiers**. Écrans métier inchangés. |
| **20** | **Migrer `src/lib` par domaine** (ARCH01) | **Terminé** | Coaching, marketplace, workout, nutrition, programs → `features/<domaine>/domain` + réexports `lib/`. |
| **21** | **Découper les mini-apps** (ARCH03, ARCH04) | **Terminé** | 21a router / guards / bootstrap. 21b fetch hors écrans. 21c `coachingStore` modules + **façade**. |
| **22** | **Types et i18n par domaine** (ARCH07, ARCH08) | **Terminé** | Types + `fr/` `en/` par domaine. Réexports de transition. |
| **23** | **Garde-fous CI** (ARCH10, ARCH05) | **Terminé** (progressif) | ESLint : `shared` ↛ `features` ; pas de deep-import inter-features ; `shared/ui` sans Supabase/Zustand. UI métier : `supabase.from` encore présent — **pas** activé. **Pas** de flag TS extra. |

### Lot 10 — contrat 10a–10j (livré en une PR)

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

### Lot 14 — une PR par ligne

Le logger **libre** a déjà des types (`SET_TYPES` dans `ExerciseCard`). Le **builder** ne prescrit que `N×reps @ RIR / repos / charge`. Dès qu’il y a un `program_day_id`, `hevySimple` **masque** types et supersets, et on ne peut plus ajouter d’exo — séance « plate ». Ce lot aligne plan et saisie. **Un type = un contrat de champs**, pas un badge sur une ligne working.

| # | Contenu | IDs |
|---|---|---|
| 14a | **Builder.** Chaque exo du jour prescrit un type (warmup / working / drop / myo / tempo / isometric / cluster) + champs utiles. **Superset** = lier 2+ exos du **même jour** (A1/A2…), pas un `set_type` orphelin. Drop prescrit : nombre de chutes (charges ou %). Tempo / iso / cluster / myo : tempo, durée, bursts, activation. Persistance `program_day_exercises` (aujourd’hui : sets/reps/rir/rest/poids seulement). | UX98 |
| 14b | **Logger adapté au type choisi** (séance libre **et** programmée). **Drop :** une série = **une** coche, **plusieurs** poids (et reps) successifs — pas une 2ᵉ ligne « D » isolée. **Superset :** un *tour* affiche les 2+ exos ; on saisit A puis B ; repos **après le couple**. **Myo :** activation puis mini-sets. **Tempo :** tempo visible (ex. 3-1-2-0). **Isométrique :** charge × **durée**, pas des reps. **Cluster :** bursts + repos intra-série, une coche. **Warm-up :** mêmes champs, ne compte pas dans le réalisé (lot 1). | UX99 |
| 14c | **Séance programmée joue le plan.** Retirer le mode plat `hevySimple` (`program_day_id` ⇒ tout en working). Seed depuis `program_day_exercises` : types, groupes, drops. Coaché : **pas** d’exo hors plan (les partenaires de superset sont **dans** le jour). Solo / libre : types choisissables ; un modèle / jour de plan **emporte** les types (lot 15b). | UX100 |

### Lot 15 — une PR par ligne

| # | Contenu | IDs |
|---|---|---|
| 15a | Timer de repos : **persistant** pendant la séance (barre), pas seulement un modal qui meurt à la fermeture. UX15 (auto après coche) inchangé. **Code Git** — reste parcours. | UX101 |
| 15b | Séance **libre** → enregistrer comme jour de plan / modèle (solo). `/programs/new` aujourd’hui `CoachOnly`. Les types du lot 14 suivent. **Code Git** — reste parcours. | UX102 |
| 15c | Calculateur de disques **visuel** : un côté de barre, disques ajoutables, couleurs haltéro, unités du profil (kg 25…1.25 / lbs **55**…2.5). Liste texte = insuffisant. | UX103 |
| 15d | Réutiliser un repas : **n’importe quel jour**, pas seulement hier (`copyFromYesterday`). **Code Git** — reste parcours. | UX104 |
| 15e | Scanner : hériter **date + catégorie** du journal. `NutritionPage` passe `?date=&category=` ; `ScannerPage` les lit. **Code Git** — reste parcours. | UX105 |
| 15f | Photos / avatar / produit : **HEIC** iPhone (convertir via bitmap, sinon `heic_unsupported`). **Code Git** — reste parcours. | UX106 |

### Lot 16 — une PR par ligne

| # | Contenu | IDs |
|---|---|---|
| 16a | FAB : **check-in** si `track_checkins` (aujourd’hui séance / poids / repas seulement). **Code Git** — reste parcours. | UX107 |
| 16b | **Dupliquer** un programme dans la bibliothèque. `fork_program` existe pour l’assignation, pas de bouton liste. **Code Git** — reste parcours. | UX108 |
| 16c | Notes d’exo de séance visibles en 360 / dernière séance. `LastSessionView` emporte `notes`. **Code Git** — reste parcours. | UX109 |
| 16d | Copier le **setup de suivi** d’un client vers un autre (tracking). Pas de copie aujourd’hui. **Code Git** — reste parcours. | UX110 |
| 16e | Coaché mobile : **Nutrition** joignable **sans 6ᵉ onglet**. **Tranché :** Check-in reste en tab ; Nutrition = FAB repas + carte Profil + desktop. | UX111 |

### Lot 16f–16g — logger séance (demande live, avant 17)

Produit demandé après 16, **pas** de la file structure. **Pas d’ID UX inventé** (UX112 reste capteurs santé).

| # | Contenu | IDs |
|---|---|---|
| 16f | Un **côté de barre**. On ajoute / retire des disques : **kg** 25, 20, 15, 10, 5, 2.5, 1.25 ou **lbs** 55, 45, 35, 25, 10, 5, 2.5 selon `unit_weight`. Couleurs haltéro (rouge / bleu / jaune / vert / blanc / noir / chrome). Total = barre + 2 × le côté. | UX103 |
| 16g | Page séance **lisible sur téléphone** : header (nom + chrono) sans overflow, fiche exo (actions secondaires en overflow), rangées KG / REPS / RIR + coche 44 px. Types / drop / superset du lot 14 inchangés. | — |

### Lots 17–23 — structure (après 16, gravité croissante)

Diagnostic : [`AUDIT_ARCHITECTURE.md`](AUDIT_ARCHITECTURE.md) (`new-JV` @ `2222e11`, ~6,5/10). **N’ordonne pas.** Ne pas reconstruire le produit. Ne pas ouvrir 18–23 pendant les lots 11–16 (conflits sur `App.tsx`, `lib`, i18n, primitives).

| Gravité | Lots | Pourquoi cet ordre |
|---|---|---|
| Minimale | **17** | Docs, `npm test`, nom npm, `.env`. Zéro écran. Débloque les agents qui ajoutent un test. |
| Faible | **18** | Dossiers + alias + 4–5 déplacements évidents. Zéro métier. |
| Moyenne | **19** | Primitives → tokens. Risque visuel, pas de routes. Après 18 pour travailler dans `shared/ui`. |
| Haute | **20**, **22** | Beaucoup de fichiers / hotspots merge. Zéro comportement visé. 20 avant 21 (bouger avant de splitter). 22 après 20 (types suivent le domaine). |
| Très haute | **21** | `App.tsx`, gros composants, `coachingStore`. Façade obligatoire. |
| Après la cible | **23** | Règles ESLint/CI **une fois** que `shared` / `features` existent. Au fil de 20–22, pas un bang final isolé si les imports interdits sont encore partout. |

**Exception étroite — lot 17 pendant 11–16 :** uniquement hygiène (surtout autodiscovery des tests) si un agent crée un `.test.ts`. Pas d’excuse pour tirer 18–23 en parallèle d’une PR Ask / builder.

### Lot 17 — une PR (ou 17a–17d si trop large)

| # | Contenu | IDs |
|---|---|---|
| 17a | `docs/ARCHITECTURE.md` : matrice « tel fichier va ici » (arbre cible `app` / `features` / `shared`). `docs/DESIGN_SYSTEM.md` : tokens + primitives. Aligner `CLAUDE.md` (arbre **actuel** vs cible ; plus de contradiction `.env` ; `coachingStore` inchangé jusqu’au 21c). | ARCH01 |
| 17b | `npm test` : découverte `**/*.test.ts` (ou équivalent `tsx --test`). Un test hors `src/lib` n’est plus invisible. Jusqu’ici : tout nouveau test **dans** la liste `package.json`. | ARCH09 |
| 17c | `"name": "prometheus-tracker-app"` (plus `vite-react-typescript-starter`). | ARCH09 |
| 17d | **Une** convention env : `.env.example` (placeholders) + vars Netlify, **ou** `.env.production` versionné **uniquement** pour clés **publiques** frontend, dit dans `CLAUDE.md`. Jamais `service_role`. | ARCH12 |
| 17e | **Terminé.** `programAtomicWrites`, `reviewWindowAndPortions`, `clientDossierRealtime`, `programRevisionsAndIntake`, `honestTargetsAndFirstRun`. | ARCH09 |

### Lot 18 — socle, zéro comportement

Créer les dossiers et les alias Vite/TS (`@/app/*`, `@/features/*`, `@/shared/*`). Déplacer **seulement** :

| Actuel | Cible |
|---|---|
| `lib/useOnline.ts` | `shared/hooks/` |
| `lib/useAccountContext.ts` | `features/account/hooks/` |
| `lib/useClientTracking.ts` | `features/coaching/hooks/` |
| `lib/useFoodCatalogSearch.ts` | `features/nutrition/hooks/` |
| `lib/supabase.ts` | `shared/api/supabase/` |
| `components/ui/*` | `shared/ui/` |
| `components/layout/*` | `app/layout/` |
| `navigation/*` | `app/navigation/` |
| `hooks/usePageTitle.ts` | `shared/hooks/` |

**Interdit dans 18 :** `coach*.ts`, `App.tsx` split, `stores/`, `types.ts`, i18n, gros composants. Réexports temporaires OK pour ne pas casser les imports.

### Lot 19 — primitives = tokens

**Terminé.** `Button`, `Card`, `Input`, `Select`, `Modal`, `PageHeader`, `EmptyState`, `ErrorState`, `TabList`, `IconButton` : `bg-primary`, `bg-surface`, `bg-elevated`, `text-ink`, `text-ink-muted`, `border-line`, `text-danger`. Plus de `bg-blue-600` / `neutral-*` / `rose-*` **dans ces fichiers**.

Les écrans métier : pas un restyle total ici. Couleurs brutes : graphes / visualisations seulement. Relie premium **1**.

### Lot 20 — `src/lib` domaine par domaine

**Terminé** (une PR par domaine). Ordre livré : coaching → marketplace → workout → nutrition → programs. Le reste de `lib` (utils transverses, télémétrie, offline) → `shared/lib` au fil des lots suivants, pas un bang.

`coachFleet.ts` reste jumelé à l’edge `coach-fleet-round` (`CLAUDE.md`) : même logique, deux implémentations ; le déplacement ne casse pas ce verrou. Canonical : `features/coaching/domain/coachFleet.ts`.

### Lot 21 — une PR par ligne

| # | Contenu | IDs |
|---|---|---|
| 21a | **Terminé.** `App.tsx` assemble `app/router/AppRoutes.tsx`, `app/guards/RouteGuards.tsx` (`CoachOnly`, `CoachTrackerRedirect`, `CoachedAthleteRedirect` ; `TrackingGate` reste le composant existant), `app/bootstrap/useAuthenticatedSession.ts`. | ARCH03 |
| 21b | **Terminé.** Fetch / orchestration extraits : `useClientDossier`, `useDashboardBootstrap`, `useProgramEditorTracking` / `useProgramNlEdit`, `useExerciseHistory`, `SetRow`, `loadFullWorkout` / `replayOfflineOp`. Mêmes écrans. | ARCH04 |
| 21c | **Terminé.** `coachingStore` : modules (`clients`, `messages`, `questionnaires`, `interventions`, `tracking`, + rôle / invites / realtime / lifecycle) + **façade** `stores/coachingStore.ts`. Imports existants inchangés. | ARCH04 |

### Lot 22 — une PR types, une PR i18n (ou par domaine si conflit)

| # | Contenu | IDs |
|---|---|---|
| 22a | **Terminé.** Transversal → `shared/types.ts`. Workout / nutrition / programs / coaching → `features/<domaine>/types.ts`. `lib/types.ts` réexporte. | ARCH07 |
| 22b | **Terminé.** `i18n/locales/{fr,en}/` : `common`, `navigation`, `coaching`, `workout`, `nutrition`, `programs`, `marketplace`. Barils `fr.ts` / `en.ts`. i18next inchangé. | ARCH08 |

### Lot 23 — règles, pas un nouveau style de code — **Terminé** (progressif, 15 sept. 2026)

ESLint overlays (`eslint.config.js`) : `shared` (hors `shared/api/supabase`) ↛ `features` / `stores` / `zustand` ; `shared/ui` ↛ Supabase ; `features/A` ↛ `features/B`. `noUncheckedIndexedAccess` **non** activé. Couche « UI sans `supabase.from()` » **reportée** (écrans encore couplés). `PageTransition` (Zustand + persona) vit dans `src/app/layout/` ; `shared/ui` et `components/ui` réexportent.

**Après les lots 17–23 :** lots **M0–M5 Terminé**, **M7–M8 Conçu**, **UX05 / UX18 / UX25 / UX28 / UX36 / UX44 / UX84 Terminé**. Contrats **UX19 / 22 / 23 / 27 / 32 / 47 / 50 / 67 / 112 Conçu**. Reste À vérifier / À construire. Billing (**M6 Reporté**). Capteurs = chantier dédié.

**Après le lot 16 :** d’abord **16f–16g** (disques visuels + logger téléphone) si demandés, puis la file structure **17–23**, puis M / UX112 / billing. Ne pas « nettoyer » Supabase (ARCH11).

---

## Ancres code (lot 1–23) — ne pas chercher à l’aveugle

| Lot | Où ça ment / casse aujourd’hui |
|---|---|
| 1 | **Corrigé + parcours 15 sept.** `isPerformedSet` ; `readableSets` = `completed`. Bilan / recap / 360 : 1 cochée + 1 non cochée. |
| 2 | **Terminé.** RPC live `none` / `coach_has_active_clients`. UI Personnel N>0 sans RPC, « Voir mes clients ». |
| 3 | **Terminé.** Recap Assigner live + RPC `stale`. |
| 4 | **Terminé.** Invite + Aujourd’hui / messages / compte. |
| 5 | **Terminé.** Solo + coaché + 360. |
| 6 | **Terminé.** Recherche `/exercise-progress` live. |
| 7 | **Terminé.** Dismiss ≠ `read_at`. |
| 8 | **Terminé.** Lecture programme coaché. |
| 9 | **Terminé.** `?filter=checkin` live. |
| 11 | **Terminé.** `video_url` prod + picker live (iframe + mannequin). |
| 12 | **Terminé.** Ask Entraînement / Nutrition + revue (Ignorer / cette séance ou journal / enregistrer). |
| 13 | **Terminé.** `SoloAskBar` : `WorkoutForm` (`session`), Nutrition (journal / week / ingredient), check-in (note), workout list (`missed` / `deload` / `coached` → brouillon), fiche exo (`swap_exercise`). |
| 14 | **Terminé.** Builder `set_type` / `superset_group` / `drop_count`. Logger drop multi-charges + tour superset. Plus de `hevySimple`. Accueil seed les types. |
| 15 | **Terminé.** `data-rest-bar` survit à la fermeture. Solo `data-save-plan`. `PlateCalc` visuel. Reuse date. Scanner `?date=&category=`. HEIC accept + convert. |
| 16 | **Terminé.** FAB check-in ; Dupliquer ; notes 360 ; copie setup ; Nutrition hors tab bar. |
| 17 | **Terminé.** `npm test` → `scripts/run-unit-tests.mjs`. Nom `prometheus-tracker-app`. Docs + env. Tests : `programAtomicWrites`, `reviewWindowAndPortions`, `clientDossierRealtime`, `programRevisionsAndIntake`, `honestTargetsAndFirstRun`. |
| 18 | **Terminé.** Cibles livrées + réexports. Alias `@/app`, `@/features`, `@/shared`. |
| 19 | **Terminé.** Primitives listées = tokens. `primary` / `success` / `warning` / `danger` dans `tailwind.config.js`. |
| 20 | **Terminé.** Domaines métier dans `features/*/domain`. Réexports `lib/`. Transverse (utils, types, i18n) reste pour 22. |
| 21 | **Terminé.** 21a router / gardes. 21b fetch hors écrans. 21c façade `stores/coachingStore.ts` + `features/coaching/model`. |
| 22 | **Terminé.** Types + i18n par domaine. |
| 23 | **Terminé** (progressif). Overlays ESLint `shared`/`features`. `PageTransition` dans `app/layout`. `supabase.from` dans l’UI **encore autorisé**. `strict: true` sans flag extra. |

---

## Chantier 2 — Continuité, identité, marketplace

**Décision :** un moteur, identité durable, capacité coach ≠ accompagnement personnel, marketplace et suivi dans la même app.

**État code (14 sept. 2026, `3233932`) — ce n’est pas la preuve prod.** Intention après compte, espaces Personnel/Coaching, `client_end_coach_link`, invitation consentie, annuaire / demandes / offre, `respond_coaching_request` **active déjà** le lien **sans paiement**. Les lignes M restent ici tant que migration Git + apply prod + parcours n’ont pas été **prouvés**.

| Lot | Statut | Conditions de fin | Reste réel |
|---|---|---|---|
| **M0** Inventaire rôles / policies vs carte | **Terminé** | Scénarios solo, coaché, coach, coach-athlète. Aucun changement de droits. | Live 15 sept. soir + RLS prod. `is_coach_of` = lien **actif** seulement. Coach lit les séances du client, pas du solo. Client : 0 `coach_notes`, pas le `user_roles` du coach. Espace Personnel n’accorde aucun droit. |
| **M1** Capacités + espaces Personnel/Coaching | **Terminé** | Backfill coachs ; aucun auto-lien ; rollback UI sans drop de colonnes. | Live : `selectAccountWorkspace` = localStorage seulement. Personnel masque Clients ; `/clients` reste lisible (RLS). 0 self-link. `user_roles` = `coach`. Lot 2 (UX78) déjà Terminé. |
| **M2a** Départ client autonome | **Terminé** | RPC `client_end_coach_link` ; même `transition_client_to_solo` que le coach ; historique conservé ; notes privées non transférées ; notif minimale coach ; sérialisation vs adaptation en cours. | Live `chantier-leaver-1515` : copy 4 listes ; toast + bandeau solo ; séance « Séance avant départ » gardée ; notice « Chantier Leaver a mis fin au suivi » ; hors roster. SQL : `ended` / `paused` / tracking 0 / note intacte / `initiated_as=client` / 2ᵉ RPC `not_linked` / `FOR UPDATE` prod. **RPC inchangée.** |
| **M2b** Invitation + consentement versionné | **Terminé** | Acceptation explicite ; ancienne RPC révoquée après bascule. | Prod : `accept_coach_invite(text)` **sans** EXECUTE `authenticated` ; nouvelle signature (version + scopes) oui. Live : expiré / used = issue + Retour ; autre coach = « déjà un coach » ; self = refus. Happy-path lot 4. |
| **M3** Intention après identité | **Terminé** | Login direct ; pas de rôle avant le formulaire ; OAuth plus tard. | Live : `/auth` sans picker de rôle / OAuth. `chantier-intent-1515` voit « Pourquoi es-tu ici ? ». `find_coach` → `/coaches` puis Accueil / Entraînement personnels. `choose_account_intent` ne change pas le rôle (reste `none`). |
| **M4** Offres opt-in | **Terminé** | Coach sans publier ; publication / retrait. | Live : Chantier Coach a un roster **sans** `coach_profiles`. `/coach/profile` : compte ≠ offre. Coach2 publié puis retiré ; l’annuaire suit. |
| **M5** Annuaire, comparaison, demandes | **Terminé** | Filtres exacts ; pas de dossier prospect ; empty honnête. | Live : déjà lié → explication, pas de formulaire. Acceptation Coach2 × Intent : copy « pas un paiement » ; SQL `accepted` + lien `active`. Filtres exacts déjà en code. Matching riche / avis : hors lot. |
| **M6** Paiement / accord commercial | **Reporté** | Une RPC d’activation **déjà** utilisée à l’acceptation et à l’invitation. M6 = encaissement, pas ré-activer le lien. | Chantier 3 fermé. |
| **M7** Accueils et suite d’objectif | **Conçu** | Trois parcours jusqu’au bilan ; coach autorité du plan. | Contrat ci-dessous. Écart copy **UX28** livré (file **#153**). Lots 1, 4, 8, 9 déjà verts. UX07 / UX10 **Terminé**. Pas de rebuild produit. |
| **M8** Ouverture graduelle | **Conçu** | Pas de lancement large sur CI seule. | Contrat ci-dessous. Billing reste fermé. |

### M7 — contrat des trois accueils (conçu 15 sept. 2026)

Un moteur, trois suites. Le bilan = faits (séries cochées, check-in enregistré, message **lu** seulement si `.select` confirme). Jamais d’auto-apply IA. Coach = autorité du **plan** assigné ; le client logge, ne réécrit pas le futur.

| Parcours | Accueil aujourd’hui | Suite jusqu’au bilan | Interdit |
|---|---|---|---|
| **Solo** | Prochaine séance utile **ou** vide honnête. Proposition de programme = notice, pas un mur. | Entraînement libre / jour de plan perso → logger (lot 14) → recap (lot 1) → hub `/exercise-progress`. Nutrition / poids via chrome Personnel. | Forcer l’annuaire. Inventer un jour de plan. |
| **Coaché** | Jour prescrit en premier (« Reprendre / Continuer ») **ou** `waiting_program` → Messages (UX10). Check-in / message = cartes, pas un 6ᵉ onglet. | Séance du plan (types du builder) → check-in « visible par {coach} » → Messages. Programme en **lecture**. Photos : audience nommée. | Éditer le plan. 6ᵉ onglet. « Transmis ». |
| **Coach** | File : empty / sévérité texte / une featured. Filtre roster `?filter=`. | Featured → 360 (séries cochées, notes exo) → programme / setup / message. Dual-rôle : switcher **Profil** seulement. | Droits via l’espace affiché. Couper le mode coach si N>0. |

**Bilan.** Solo : recap de séance + hub. Coaché : même recap côté client ; 360 côté coach (pas de second logger). Coach : « depuis quand » + dernière séance cochée, pas un dump.

**Écarts encore À construire** (ne pas les fondre dans M7) : plus d’écart listé. UX07 / UX10 / UX28 **Terminé**.

### M8 — contrat d’ouverture (conçu 15 sept. 2026)

Pas de lancement large parce que la CI est verte.

| Porte | Règle |
|---|---|
| **Frontend prod** | Merge `new-JV` → Netlify. Pas d’autre branche. |
| **Supabase prod** | Projet `phyuijjekxtjvipjtdfv`. Migrations **appliquées immuables**. Pas de replay. |
| **Qui entre** | Comptes déjà liés + invites consenties. Annuaire **opt-in** (M4). Pas d’annonce marketplace grand public tant que M7 n’a pas un parcours live des 3 accueils. |
| **Billing** | **Fermé** (M6). `solo_trial_ends_at` n’est pas un mur. |
| **OAuth** | Plus tard (M3). |
| **CI** | Nécessaire, **insuffisante**. Preuve = comptes test + parcours (cette file). |
| **Ne pas ouvrir** | Capteurs santé (UX112), avis/modération annuaire, matching riche, Stripe. |

**Critère de fin M8 (plus tard) :** une check-list d’ouverture signée (qui, quoi, rollback) — pas un drapeau dans le code.

### Catalogue — contrats conçus (15 sept. 2026)

Ne pas reconstruire ce qui existe (lots 6, 7, 12–13, snapshots programmes). Une PR = un ID le jour de la construction. **UX112** n’entre pas dans cette file.

| ID | Déjà là | Parcours | Interdit |
|---|---|---|---|
| **UX19** Remplacement | Solo : « Cette séance » / « Enregistrer comme jour de plan » ; swap « cette séance seulement » (lot 13). | Coaché : le swap / la substitution **ne touche pas** le plan assigné. Coach : « proposer au plan » = brouillon Ask, le coach confirme (`save_program` + recap). | Auto-apply sur les semaines suivantes. 2ᵉ moteur Ask. |
| **UX22** Cycles / phases | Builder : nom / durée / notes de cycle. | Athlète = **la séance du jour** (nom + weekday). Coach = la structure. Après recale (UX92) : même séance encore nommée. | Moteur de phases / mésocycle dans cette file. Inventer un jour de plan. |
| **UX23** Révisions | Table / RPC `program_revisions` + badge « révision n · date » dans l’éditeur. | Liste : avant / après, auteur, date d’effet. Restaurer = nouvelle révision, **les logs passés inchangés**. | Réécrire l’historique des séances. Nouveau versioning parallèle. |
| **UX27** Réponse ↔ bilan | Toast « Enregistré — visible par {coach} » (UX26). | Le coaché voit *quel* check-in / *quelle* séance a servi : puce ou phrase dans Messages ou 360, après un message coach. | 2ᵉ inbox. « Lu » sans `read_at` confirmé. |
| **UX32** Objet dans le fil | Fil texte (lot 7). Notes 360 peuvent déjà porter un `workout_id`. | Une carte résumé (nom + date de séance, ou date de check-in) attachée au message. Ouverture = la fiche / le recap, pas un logger dans le chat. | WhatsApp, pièces, vocaux. Logger embarqué. |
| **UX47** Calendrier d’états | Points loggés (lot 6) : séance / nutrition / poids. | Jour de **plan** : prévu (dû, pas de log) / commencé (séance ouverte) / terminé (complétée). Un dû non loggé **reste** visible. Recale expliqué (UX92). | Effacer le passé. Confondre jour civil et séance. |
| **UX50** Point → séance | Courbe + liste sous `/exercise-progress`. | Toucher un point ouvre `/workout/:id` de cette séance. Séance absente = vide honnête. | Point orphelin inventé. Recalcul « 0 » (UX49). |
| **UX67** Aide | Copy inline (notices santé UX04, audience photos UX54). | Une phrase à côté du contrôle, au premier usage ou en disclosure. | Centre d’aide. 6ᵉ onglet. Dump de parcours. |
| **UX112** Capteurs | Saisie manuelle. Onglet 360 « Récupération » = check-ins, pas un wearable. | Chantier dédié **après** cette file : source nommée, consentement, conflit saisie vs capteur. | Route `/health`, Apple Health / Garmin / Fitbit **maintenant**. |

**Construction.** UX19 coach / UX23 UI / UX27 / UX32 / UX47 / UX50 = PRs séparées sur l’existant. UX22 = pas de moteur neuf. UX67 = copy, pas un produit aide. UX112 = hors file.

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

## Après la file 1–10 (lots 11–23 et catalogue — live 2–10 joué 15 sept. ; 11–16 ouverts ; 17–23 après 16)

| Thème | IDs | Statut |
|---|---|---|
| Reprendre valeurs ≠ ajouter une série | UX13 | **Terminé** |
| Offline en langage courant ; file hors séances | UX16 | **Terminé** (langage). File = séances seulement. |
| Sélecteur d’exercice (variantes, récents) | UX18 | **Terminé** |
| Remplacement « cette séance » vs plan | UX19 | **Conçu** |
| Cycles / phases / prescriptions hors reps | UX22 | **Conçu** |
| Historique visuel des révisions | UX23 | **Conçu** |
| Check-in : champs vraiment utilisés | UX25 | **Terminé** |
| Relier réponse coach au bilan | UX27 | **Conçu** |
| Manque ≠ faute ; relances | UX28 | **Terminé** |
| Lier séance / check-in dans le fil | UX32 | **Conçu** |
| Filtres roster visibles | UX36 | **Terminé** |
| Builder questionnaire (modèle, preview, publication) | UX39–41 | À construire |
| Attente IA quittable | UX44 | **Terminé** |
| Calendrier : prévu / commencé / terminé | UX47 | **Conçu** |
| Du point de courbe vers la séance | UX50 | **Conçu** |
| Provenance alimentaire en mots | UX51 | **Terminé** |
| Scanner : issue si pas de caméra / produit | UX52 | À vérifier |
| Permission notif au bon moment | UX64 | À construire |
| Audience, export, delete compte | UX66 | À construire |
| Aide contextuelle | UX67 | **Conçu** |
| Stabilité chargement / double submit | UX68 | À vérifier |
| Raccourcis Accueil | UX69 | Reporté P3 |
| Silhouette vs liste | UX06 | Reporté P3 |
| Actions groupées coach | UX38 | Reporté P3 |
| Télémétrie utilité | UX70 | Continu, pas un projet préalable |
| Bibliothèque exo : vidéo + mannequin muscles | UX86 | Lot 11, après 10 |
| Ask solo Entraînement + choix ignorer / cette séance / plan nommé | UX87 | Lot 12a, après 10 |
| Ask solo Nutrition + choix ignorer / une fois / Mes recettes | UX88 | Lot 12b, après 10 |
| Ask pendant la séance | UX89 | **13a Terminé** |
| Reste macros / journal → idées repas | UX90 | **13b Terminé** |
| Check-in → note de séance (pas diagnostic) | UX91 | **13c Terminé** |
| Jour loupé → recaler le plan | UX92 | **13d Terminé** |
| Ask coaché = brouillon Messages | UX93 | **13e Terminé** |
| Alternatives d’exo depuis la fiche | UX94 | **13f Terminé** |
| Plan repas semaine + liste courses | UX95 | **13g Terminé** |
| Swap d’ingrédient | UX96 | **13h Terminé** |
| Deload / charges-repos dernière fois | UX97 | **13i Terminé** |
| Builder : tous les types de séries + groupes superset | UX98 | **14a Terminé** |
| Logger adapté au type (drop multi-charges, tour superset, …) | UX99 | **14b Terminé** |
| Séance programmée joue la prescription (plus de `hevySimple`) | UX100 | **14c Terminé** |
| Timer de repos persistant | UX101 | **15a Terminé** |
| Séance libre → jour de plan / modèle | UX102 | **15b Terminé** |
| Calculateur de disques visuel (un côté, couleurs, 55 lb) | UX103 | **15c / 16f Terminé** |
| Logger séance lisible sur téléphone | — | **16g Terminé** |
| Réutiliser un repas d’un jour choisi | UX104 | **15d Terminé** |
| Scanner hérite date + catégorie | UX105 | **15e Terminé** |
| HEIC iPhone | UX106 | **15f Terminé** |
| Check-in dans le FAB | UX107 | **16a Terminé** |
| Dupliquer un programme | UX108 | **16b Terminé** |
| Notes d’exo en 360 / dernière séance | UX109 | **16c Terminé** |
| Copier le setup tracking | UX110 | **16d Terminé** |
| Nutrition coaché sans 6ᵉ onglet | UX111 | **16e Terminé** |
| Capteurs santé (Apple Health / Garmin, …) | UX112 | **Conçu** (chantier dédié, pas cette file) |
| Matrice fichiers + design tokens documentés | ARCH01 | Lot 17a |
| Autodiscovery tests + nom package + rename progressif | ARCH09 | Lot 17b–e |
| Une convention `.env` / Netlify | ARCH12 | Lot 17d |
| Dossiers `app`/`features`/`shared` + alias `@/` + déplacements évidents | ARCH02 | Lot 18 |
| Primitives = tokens sémantiques | ARCH06 | Lot 19 |
| `src/lib` → features par domaine | ARCH01 | Lot 20 |
| Composant → hook → API → Supabase | ARCH05 | Lots 17 (convention), 20–21 (déplacer), 23 (CI) |
| Découper `App.tsx` | ARCH03 | **21a Terminé** |
| Gros fichiers / `coachingStore` façade | ARCH04 | **21c Terminé** |
| `types.ts` par domaine (réexport) | ARCH07 | **22a Terminé** |
| i18n par domaine | ARCH08 | **22b Terminé** |
| Garde-fous ESLint/CI (pas de bang `strict`) | ARCH10 | Lot 23 |
| Migrations ping dupliquées | ARCH11 | **Ne pas** « nettoyer » |

Travaux techniques **seulement** s’ils débloquent un lot ci-dessus ou un défaut mesuré : écran interne télémétrie ; policies SELECT après preuve RLS ; protection Auth mots de passe compromis ; `pg_trgm` / `pg_net` hors `public` (staging + mesure) ; perf fondée sur des mesures (lot premium 15). **Exception :** lots **17–23** (structure) sont une file dédiée, pas un nettoyage opportuniste pendant 11–16.

---

## Règles de livraison

- Chargement, vide, **erreur** et reprise : une erreur n’est jamais un écran vide silencieux.
- Toute copie visible : FR **et** EN (y compris toasts ; pas de `deleted` hardcodé).
- Écriture critique : atomique ou idempotente.
- RLS / `SECURITY DEFINER` : matrice de sécurité dans le même changement.
- Télémétrie : `docs/TELEMETRY.md` dans le même commit.
- Migration appliquée : jamais réécrite.
- Proposition IA : validation humaine.
- Depuis le lot **17b** : `npm test` découvre `src/**/*.test.ts`. Ne plus tenir une liste dans `package.json`. **17e** : `auditLot*` / `uxPremium` renommés d’après le verrou.
- Lots 17–23 : PR de structure **sans** changement de parcours, sauf 19 (mêmes écrans, tokens). Une PR = un domaine (20) ou une ligne (21, 22).

---

## Couverture déjà dans le code (lots premium 0A–16)

Ne pas reconstruire. Recaler le statut quand un trou UX est **prouvé**.

| Lot | Statut | Reste |
|---|---|---|
| **0A** i18n options | À vérifier | Toasts / intake / unités encore hors clés (ex. `"… deleted"`). |
| **0B** auth / intention / invite | À vérifier | Lock questionnaire prise en charge retiré (lot 4 Git). Intake kiné : 7 écrans **conservés**. Parcours invite dû. |
| **0C** vérité produit | **Partiel** | Cibles macros : corrigé. Terminer n’écrit plus `completed` sur le reste. Affichage = séries cochées ; parcours 15 sept. (bilan, recap, 360). UX49 jours ≠ séances : Git lot 6. |
| **1** design system | À vérifier | `ListRow` / 44 px (#91). OverflowMenu Échap + focus (Git 10g). Primitives listées = tokens (lot **19**). Écrans métier encore bruts. |
| **2** accessibilité | À vérifier | Cibles 44 px présentes ; `aria-current` onglets (Git 10g). Clavier / zoom / lecteur restants. |
| **3** navigation | **Partiel** | `navConfig`, 5 onglets, Copilote hors tab, switcher Profil. Recettes Nutrition (Git 10a). `PageTransition` persona (Git 10h). Trouvabilité live due. |
| **4** dashboard | **Partiel** | UX07 : priorité + vue d’ensemble + rings nutrition + courbe de poids. Proposition IA = notice. `waiting_program` → Messages (UX10). Trouvabilité / a11y encore dues. |
| **5** Coach Today | **Partiel** | Empty + sévérité texte + featured. « Depuis quand » + Passer un signal (Git lot 9). Parcours live dû. |
| **6** Client 360 | À vérifier | Dernière séance = séries cochées (parcours 15 sept.). Onglet **Récupération** (Git 10c). « Depuis ta dernière visite » (lot 9). |
| **7** Setup 4 étapes | À vérifier | Titre preview « Ce que le client verra » (Git 10j). Parcours live dû. |
| **8** Messages / Prometheus | **Partiel** | Retry / safe-area. Brouillon + lu : Git (lot 7). |
| **9** Marketplace vitrine | **Terminé** | Pas de faux prix. Acceptation = **lien actif**. Copy live M5. |
| **10** Programmes builder | **Partiel** | Pas de premier client auto. Recap destinataire (code). `save_program` Git ; delete / fetch honnêtes. Apply prod + parcours (lot 3). Types de séries / supersets de plan : lot 14. |
| **11** Nutrition / séance / scanner | À vérifier | Recettes dans Nutrition (Git 10a). UX15 = auto **optionnel** après coche. Logger plat séance programmée + types : lot 14. Timer / HEIC / scanner date : lot 15. |
| **12** Progression / photos | **Partiel** | Hub solo. Coaché bloqué (lot 8). Séries cochées : lot 1. Calendrier / recherche / erreur : Git (lot 6). Audience photos : Git (lot 5). |
| **13** Profil | **Partiel** | Groupes OK. Toggle mode coach : N=0 / N>0 joués 15 sept. Apply prod SQL (lot 2). SoloHub encore un tiroir mobile. |
| **14** PWA / offline | À vérifier | File = séances seulement. |
| **15** Performance | À vérifier | Mesure live. |
| **16** Polish | À vérifier | Revue visuelle live. |

---

## Catalogue UX — contrat détaillé

Les constats « 11 septembre » sont **périmés** là où le statut dit autre chose. Avant d’implémenter : relire le HEAD. **P1** dans un lot ouvert = faire maintenant si ça bloque ce lot.

**Base :** `C` constat code ; `H` hypothèse ; `F` cible d’un chantier pas encore prouvé. **Portée :** `I` interface ; `I+D` état durable.

**Colonne File :** lot de la file, `M*`, `ens.` (après 1–10), `rep.`, `chaque`, `fait`, `17–23` (structure).

### Entrée et questionnaire

| ID | P | File | Statut | Travail restant | Critère de fin |
|---|---|---|---|---|---|
| **UX01** | P2 | M3 | **Terminé** | Login email+mdp ; intention après identité ; habitué (solo/coaché) ne revoit pas le picker. | Habitué → son espace sans redéfinir un rôle. |
| **UX02** | P1 | 4 | **Terminé** | Invite live : preview, consentement, scopes, acceptation → lien actif. | Aucune invite invalide sans issue ; rattachement clair. |
| **UX03** | P2 | 4 | **À vérifier** | Complément au moment utile. Durée « 60 secondes » retirée. **Reste :** parcours reprise brouillon. | On sait pourquoi maintenant ; reprise sans ressaisie. |
| **UX04** | P1 | 4 | **À vérifier** | Audience en tête de formulaire ; notice santé (facultatif, destinataire, refus ≠ mur) avant la première question `medical`. **Reste :** parcours live. | Destinataire et conséquence d’un refus connus. |
| **UX05** | P2 | ens. | **Terminé** | Live Client : résumé par rubrique ; Compléter / Corriger une seule ; v2 = complément (carry-forward). SQL `completed` non déverrouillé. | Pas de parcours entier à refaire. |
| **UX06** | P3 | rep. | Reporté | Silhouette facultative vs liste. | Seulement si un test le justifie. |
| **UX80** | P1 | 4 | **Terminé** | Après acceptation : Aujourd’hui / Messages / Profil / `/questionnaire` (vide honnête). Pas de mur. | Messages / Aujourd’hui / compte accessibles ; réponses conservées. |

### Accueil et navigation

| ID | P | File | Statut | Travail restant | Critère de fin |
|---|---|---|---|---|---|
| **UX07** | P1 | 8+9 | **Terminé** | Vision 15 sept. soir : priorité + vue d’ensemble (plus « une carte exclusive »). Onglet **Dashboard**. Rings nutrition = page Nutrition. Graphique poids. Message / check-in restent visibles à côté de la séance due. | On sait quoi faire **et** où on en est. |
| **UX08** | P2 | 8 | **Terminé** | Live Solo : Dashboard « Mon programme · Plan UX84 Mardi » → `/programs` ; même carte sur Entraînement. Client : « Plan Chantier Force ». | Programme / historique sans deviner Profil. |
| **UX09** | P1 | 9 | **Terminé** | Live : `1 / 2` Invitee → `2 / 2` Client ; précédent garde `tab=checkins` ; retour liste. | Enchaîner des fiches sans reconstruire la liste. |
| **UX10** | P1 | 8 | **Terminé** | Live invitee : « Ton coach va t’envoyer un programme » → `/messages`. | On sait quoi faire maintenant. |
| **UX11** | P2 | 10i | **À vérifier** | Séance / programme / modèle. Copy « routine » retirée. **Reste :** parcours live. | Un nom = une action. |
| **UX74** | P1 | 10h | **À vérifier** | `navConfig` + reset `PageTransition` au changement de persona. **Reste :** parcours dual-rôle live. | Un ajout de destination = un endroit. |
| **UX75** | P1 | 10h | À vérifier | Switcher Profil, 5ᵉ onglet Compte. Dual-rôle : Objectifs selon **espace**. | Changer d’espace change Profil et onglets. |
| **UX76** | P2 | 10g | **À vérifier** | `aria-current="page"` BottomNav / SideNav. Badge unread. **Reste :** zoom 200 % live. | Onglet actif identifiable clavier / lecteur. |
| **UX77** | P2 | 10a | **À vérifier** | Recettes dans AppLayout / Nutrition. Plus de `FullPageLayout`. **Reste :** parcours live (solo + coaché). | Recettes ≠ session ; séance a une sortie. |
| **UX84** | P1 | 8 | **Terminé** | Live : jour dû = « Séance hors programme » (FAB, header, Ajout rapide) + nom + notice. Jour de repos = « Nouvelle séance » / « Nouveau ». `/workout/new` reste ouvert. | Hors programme **nommé** ; pas d’interdiction. |
| **UX107** | P2 | 16a | **Terminé** | Live FAB : Check-in (module on). | Check-in sans chercher l’onglet. |
| **UX111** | P2 | 16e | **Terminé** | Live : 5 onglets (Dashboard / Entraînement / Check-in / Messages / Profil). Nutrition = Profil + FAB repas. | Nutrition = même carte mobile/desktop. |

### Séance

| ID | P | File | Statut | Travail restant | Critère de fin |
|---|---|---|---|---|---|
| **UX12** | P1 | 1 | **Terminé** | Seule une série **cochée** compte (`isPerformedSet` / `readableSets`). Parcours 15 sept. : bilan, recap, 360. | — |
| **UX13** | P2 | ens. | **Terminé** | Live : 3 rangées ; « Reprendre les valeurs » remplit la suivante ; pas de 4ᵉ. | Pas de série en trop par raccourci. |
| **UX14** | P2 | 10f | **À vérifier** | Inputs séance agrandis. Progression : `formatWeight` / `unit_weight`. **Reste :** parcours live kg↔lbs. | Édition conservée ; unité du profil. |
| **UX15** | P2 | ens. | **Terminé** | Live Solo : Profil → Unités, toggle on par défaut ; off persisté ; « Reprendre les valeurs » et coche avec off = pas de minuteur ; coche avec on = modal repos. | Désactivable ; jamais sur un simple fill. |
| **UX16** | P1 | ens. | **Terminé** | Live : « conservées sur cet appareil ». Dead-letter = « Ajouter une série », pas `set.add`. File hors séances reportée. | Après coupure, on sait ce qui est conservé. |
| **UX17** | P1 | 1 | **Terminé** | Plus de `setTimeout` 30 s. Fermer → recap. Faits, pas « Conseil du coach ». Parcours 15 sept. | — |
| **UX101** | P2 | 15a | **Terminé** | Live : Échap sur le modal → barre « Minuteur de repos · 1:29 ». | On voit le temps restant sans le modal. |
| **UX103** | P3 | 15c / 16f | **Terminé** | Live : sleeve + palette 7 disques, total barre 20 kg. Inventaire lbs déjà unit-testé. | On voit et on compose la charge, pas une liste. |

### Exercices et programmes

| ID | P | File | Statut | Travail restant | Critère de fin |
|---|---|---|---|---|---|
| **UX18** | P2 | ens. | **Terminé** | Live Solo : récents + puces matériel ; `squat` groupe Barre / Haltères / Machine ; filtre Machine = Hack squat ; sélection Squat barre. | Bonne variante avant sélection. |
| **UX86** | P2 | 11 | **Terminé** | Apply prod + picker live (iframe + mannequin blanc/rouge). | On voit le mouvement et les muscles avant de choisir. |
| **UX98** | P2 | 14a | **Terminé** | Live : Type + Groupe + Chutes ; SQL `set_type=drop`, `superset_group=A`, `drop_count=3`. | Le jour de plan dit *comment* logger, pas seulement 3×10. |
| **UX99** | P2 | 14b | **Terminé** | Live : Bench D, 3 poids (100/80/60), 1 série. Tour SUPERSET Squat+Bench. | On ne « simule » pas un drop ou un superset avec des working. |
| **UX100** | P2 | 14c | **Terminé** | Live : Démarrer depuis Entraînement → types du plan. Accueil seed `toWorkoutTemplateExercise`. Pas d’ajouter d’exo. | Le client logge ce que le plan a prescrit. |
| **UX102** | P2 | 15b | **Terminé** | Live : bouton `data-save-plan` → « Programme créé » / `/programs`. | Une bonne séance libre n’est pas perdue. |
| **UX108** | P2 | 16b | **Terminé** | Live : toast « Programme dupliqué ». | Copier un plan ≠ l’assigner. |
| **UX19** | P2 | ens. | **Conçu** | Contrat ci-dessous. Solo : choix lot 13 déjà là. Construction = surface coach « proposer au plan » (brouillon), pas un 2ᵉ Ask. | Pas de réécriture silencieuse du futur. |
| **UX20** | P1 | 3 | **Terminé** | RPC `save_program` + `stale` + recap destinataire live. | Le client voit ou ne voit pas ; pas de plan à moitié. |
| **UX21** | P1 | 3 | **Terminé** | Recap live : programme + client + date avant confirm. | Parcours bibliothèque sans destinataire accidentel. |
| **UX22** | P2 | ens. | **Conçu** | Contrat ci-dessous. Builder a déjà nom/durée/notes de cycle. Pas de moteur de phases dans cette file. | Séance identifiable après report. |
| **UX23** | P1 | ens. | **Conçu** | Contrat ci-dessous. Snapshots `program_revisions` déjà en base. Construction = UI d’historique, pas un nouveau versioning. | Restaurer ≠ réécrire le passé. |
| **UX81** | P1 | 8 | **Terminé** | Programme coaché en lecture (`/programs`). Progression `/exercise-progress` ouverte (recherche). | Tendances d’exo accessibles ; plan non éditable. |

### Check-in et relation

| ID | P | File | Statut | Travail restant | Critère de fin |
|---|---|---|---|---|---|
| **UX24** | P2 | fait | À vérifier | Ancres bas/haut livrées (#91). | Historique comparable. |
| **UX25** | P2 | ens. | **Terminé** | Live Solo : cœur + « Plus de détails (9) » ; historique = scores remplis seulement. Setup Essentiels/Détails. 360 : Qualité 8/10 + Énergie 7/10. | Chaque champ explicable. |
| **UX26** | P1 | 10e | **Terminé** | Toast live « Enregistré — visible par Chantier Coach ». | Succès ≠ lu. |
| **UX27** | P2 | ens. | **Conçu** | Contrat ci-dessous. Toast UX26 déjà là. Construction = lien visible, pas un 2ᵉ inbox. | Le coaché voit à quoi ça a servi. |
| **UX28** | P1 | ens. | **Terminé** | Live : cutoff « séance non loggée » ; templates « Séances non loggées » / « Check-ins en attente » ; Ask « log(s) manquant(s) » ; relance sans faute. `fleetCopy` jumelé. | Pas d’interprétation santé automatique. |

### Messagerie

| ID | P | File | Statut | Travail restant | Critère de fin |
|---|---|---|---|---|---|
| **UX29** | P1 | 7 | À vérifier | Ancrage au chargement de l’historique. | Page ancienne ≠ saut en bas. |
| **UX30** | P1 | 7 | **Partiel** | Brouillon restauré live (aller-retour dashboard). **Reste :** plusieurs fils / relance. | Changer de fil restaure le bon texte. |
| **UX31** | P1 | 7 | **À vérifier** | `read_at` seulement si `.select('id')` confirme. **Reste :** parcours live. | Pas de doublon ; pas de faux lu. |
| **UX32** | P2 | ens. | **Conçu** | Contrat ci-dessous. Fil texte déjà là (lot 7). Construction = carte résumé, pas WhatsApp. | Objet identifiable dans le fil. |
| **UX85** | P1 | 7 | **Terminé** | Dismiss live ; `read_at` reste NULL. | Masquer un rappel ne marque pas lu. |

Cadrage : conversation intégrée, **pas** WhatsApp. Pièces jointes, vocaux, recherche, présence : **après** le socle. Pas de E2E promis.

### Travail coach

| ID | P | File | Statut | Travail restant | Critère de fin |
|---|---|---|---|---|---|
| **UX33** | P1 | 9 | **Terminé** | Depuis quand déjà live. Filtre `/clients?filter=` live. | Priorité compréhensible sans ouvrir la fiche. |
| **UX34** | P2 | 9 | **Partiel** | Passer = un signal, toast Annuler live. | Pas d’écartement en bloc. |
| **UX35** | P2 | 9+10c | À vérifier | « Depuis ta dernière visite ». Dernière séance = UX12. | Répondre sans relire tout le dossier. |
| **UX36** | P2 | ens. | **Terminé** | Live : puces + « Filtre : Check-in · 1 client(s) » (Invitee) ; Effacer rend Client + Invitee. | On sait pourquoi un client est dans la liste. |
| **UX37** | P2 | 10j | **À vérifier** | Titre preview « Ce que le client verra ». **Reste :** parcours setup live. | Pas de surprise d’onglets / champs. |
| **UX38** | P3 | rep. | Reporté | Actions groupées limitées. | Seulement si gain prouvé. |
| **UX78** | P1 | 2 | **Terminé** | RPC live + UI Personnel N>0 (chiffre, « Voir mes clients », pas d’RPC). | Dual-rôle Personnel ne peut pas couper le roster en prod. |
| **UX109** | P2 | 16c | **Terminé** | Live 360 Entraînement : « Genoux un peu en avant — garder le dos. » | Le coach lit ce que l’athlète a noté sur le mouvement. |
| **UX110** | P2 | 16d | **Terminé** | Live : « Suivi copié dans le formulaire » (invitee → client). | Pas de setup à retaper à l’identique. |

### Questionnaire coach (builder)

| ID | P | File | Statut | Travail restant | Critère de fin |
|---|---|---|---|---|---|
| **UX39** | P2 | ens. | À construire | Partir d’un modèle court. | Questionnaire court sans jargon. |
| **UX40** | P2 | ens. | À construire | Preview effort (écrans, obligatoires, FR/EN). | Aperçu = parcours client. |
| **UX41** | P1 | ens. | À construire | Publication : qui doit compléter. | Pas de reset massif pour une typo. |

### IA

| ID | P | File | Statut | Travail restant | Critère de fin |
|---|---|---|---|---|---|
| **UX42** | P1 | 10d | **Terminé** | Carte « Avant d’envoyer » : destinataire + effet (brouillon, rien d’envoyé). Filtre roster = autre chemin. | Pas d’ambiguïté de destinataire. |
| **UX43** | P1 | 10d | **Terminé** | Live : « Effet : brouillon de réponse. Rien n’est envoyé tant que tu ne confirmes pas. » | « Envoyer » ne cache pas un changement de plan. |
| **UX44** | P2 | ens. | **Terminé** | Live Solo `/scanner` : overlay lookup + hint + Annuler → journal Nutrition. `cancelledRef` bloque `onResult` après départ. | L’app reste utilisable. |
| **UX45** | P2 | 10b | **À vérifier** | Revue = 3 chiffres (kcal / delta / séances). Notice Accueil gardée. **Reste :** parcours live. | Aucune application sans choix. |
| **UX46** | P2 | 10c | **À vérifier** | Learned : kinds FR/EN, pas de clés JSON. Onglet 360 **Récupération**. **Reste :** parcours live. | Désactivation sans clés techniques. |
| **UX87** | P2 | 12a | **Terminé** | Revue live : Ignorer / Cette séance / Enregistrer comme jour de plan. | La réponse est actionnable et durable, jamais auto-appliquée. |
| **UX88** | P2 | 12b | **Terminé** | Revue live : Ignorer / Ajouter au journal / Mes recettes. | Recette proposée = enregistrable **au choix**, jamais forcée. |
| **UX89** | P2 | 13a | **Terminé** | Live : Ignorer / Cette séance ; pas « Enregistrer comme jour de plan ». | N’écrit le plan que si on enregistre. |
| **UX90** | P2 | 13b | **Terminé** | Live : 3 idées + Ignorer / journal / Mes recettes. | Même choix qu’UX88. |
| **UX91** | P2 | 13c | **Terminé** | Live : note + « pas un diagnostic médical » ; textarea préremplie. | Proposition ≠ diagnostic. |
| **UX92** | P2 | 13d | **Terminé** | Live : Recaler le jour loupé ; pas d’auto-skip. | Pas d’auto-skip. |
| **UX93** | P2 | 13e | **Terminé** | Live : brouillon pour Chantier Coach ; texte sur `/messages`. | Le coach lit ce que le client envoie. |
| **UX94** | P2 | 13f | **Terminé** | Live : Deadlift → Hip Thrust (glutes + barre), cette séance seulement. | Swap cette séance après revue. |
| **UX95** | P2 | 13g | **Terminé** | Live : 3 repas + liste Courses ; jamais auto-appliqué. | Enregistrable, pas auto-appliqué. |
| **UX96** | P2 | 13h | **Terminé** | Live : swap qui garde les cibles. | Cibles conservées. |
| **UX97** | P2 | 13i | **Terminé** | Live : Deload 2 séries, revue avant écriture. | Revue avant écriture. |

### Calendrier et indicateurs

| ID | P | File | Statut | Travail restant | Critère de fin |
|---|---|---|---|---|---|
| **UX47** | P2 | ens. | **Conçu** | Contrat ci-dessous. Points loggés déjà là (lot 6). Construction = états de **plan**, pas un nouveau calendrier. | Le passé ne disparaît pas. |
| **UX48** | P1 | 6 | **Terminé** | Deux séances déjà listées. Recherche progression live. Unique pesée/jour = contrainte prod. | Deux séances le même jour visibles. |
| **UX49** | P2 | 1+6 | **À vérifier** | Lot 1 : manque ≠ 0. Lot 6 Git : jours ≠ séances (plusieurs cartes). **Reste :** parcours live calendrier. | Pas de conclusion sur données insuffisantes. |
| **UX50** | P2 | ens. | **Conçu** | Contrat ci-dessous. Courbe + liste déjà là. Construction = point cliquable → `/workout/:id`. | Origine retrouvable. |

### Nutrition, recettes, photos

| ID | P | File | Statut | Travail restant | Critère de fin |
|---|---|---|---|---|---|
| **UX51** | P2 | ens. | **Terminé** | Live : Banana = catalogue interne non certifié ; Yaourt = saisie manuelle non certifiée. | Source ≠ certifié. |
| **UX52** | P2 | ens. | À vérifier | Produit introuvable / pas de caméra : issue. | Le journal reste possible. |
| **UX53** | P2 | 10a | **À vérifier** | Recettes dans Nutrition pour solo et coaché. **Reste :** parcours live. | Utiles sans tableau de macros. |
| **UX54** | P1 | 5 | **Terminé** | Solo + coaché + 360 Progression. | Audience connue avant upload. |
| **UX104** | P2 | 15d | **Terminé** | Live : `input[type=date]` + « Copier depuis ce jour » / hier. | Le lundi peut reprendre le samedi. |
| **UX105** | P2 | 15e | **Terminé** | Live : `/scanner?date=2026-09-15&category=snack`. | Le scan tombe dans le bon repas / jour. |
| **UX106** | P2 | 15f | **Terminé** | Avatar `accept` HEIC/HEIF. Conversion + `heic_unsupported` unit-testés. | Pas un mur « choisis JPEG ». |

### Marketplace et fin de relation

| ID | P | File | Statut | Travail restant | Critère de fin |
|---|---|---|---|---|---|
| **UX55** | P2 | M5 | **Terminé** | Filtres exacts (discipline / langue / format). Pas de % inventé. | On sait ce qu’on demande. |
| **UX56** | P1 | M5 | **Terminé** | Copy live : accepté = suivi actif, pas un paiement. Déjà lié = explication. SQL lien `active`. | Effet compris ; pas de formulaire qui échoue. |
| **UX57** | P1 | M2a | **Terminé** | Modal live : Tu gardes / Ça s’arrête / pause / Ça ne se transmet pas. | Accès après départ anticipé. |
| **UX58** | P1 | M2a | **Terminé** | Reprise solo + bandeau ; séance conservée ; note coach intacte ; programme `paused`. | Pas d’histoire effacée ni dossier transféré. |
| **UX59–61** | P1 | M6 | Reporté | Billing fermé. | Quand chantier 3 s’ouvre. |

### Qualité transversale

| ID | P | File | Statut | Travail restant | Critère de fin |
|---|---|---|---|---|---|
| **UX62** | P1 | chaque | Partiel | Dans chaque lot. OverflowMenu : Échap + focus (Git 10g). | Parcours essentiels sans souris, zoom 200 %. |
| **UX63** | P1 | 3+6 | **À vérifier** | Programmes : erreur conserve la liste. Stats / progression : erreur + réessai, pas un vide fantôme. **Reste :** parcours live. | Données déjà là conservées + réessai. |
| **UX64** | P2 | ens. | À construire | Permission au bon moment ; rappel = objet encore vrai. | Pas de relance d’une tâche finie. |
| **UX65** | P2 | 10f | **À vérifier** | Progression : unité du profil. FR/EN clés ≠ UI encore ailleurs. Fuseau lisible. | Changer d’unité ne change pas la donnée. |
| **UX66** | P2 | ens. | À construire | Audience, export éventuel, delete, liens. | Contrôle sans écrire au support. |
| **UX67** | P2 | ens. | **Conçu** | Contrat ci-dessous. Copy inline déjà le défaut. Pas de centre d’aide, pas de 6ᵉ onglet. | Pas de dump de parcours. |
| **UX68** | P1 | ens. | À vérifier | Stabilité chargement ; pas de double submit. | Action prise en compte tout de suite. |
| **UX69** | P3 | rep. | Reporté | Raccourcis Accueil seulement si la nav par défaut échoue. | Test comparatif. |
| **UX70** | P2 | cont. | Continu | Mesurer réussite de tâche, pas le temps passé. | Sans contenu de messages / photos. |
| **UX112** | P3 | ens. | **Conçu** | Contrat ci-dessous. Saisie manuelle seulement. **Pas** dans cette file. | Un chantier capteurs dédié ; pas dans 14–16. |

### Structure et agents (ARCH)

IDs **ARCH**, distincts d’UX. Diagnostic : [`AUDIT_ARCHITECTURE.md`](AUDIT_ARCHITECTURE.md). File : lots **17–23**.

| ID | P | File | Statut | Travail restant | Critère de fin |
|---|---|---|---|---|---|
| **ARCH01** | P2 | 17+20 | **Terminé** (17a + 20) | Matrice + domaines dans `features/*/domain`. | Un agent sait où créer un fichier sans explorer le repo. |
| **ARCH02** | P2 | 18 | **Terminé** | Dossiers + alias + déplacements évidents + réexports. | Les cas **évidents** sont au bon endroit. Pas tout `lib` d’un coup. |
| **ARCH03** | P2 | 21a | **Terminé** | `App.tsx` assembleur ; routes / gardes / session extraits. | Une PR onboarding et une PR router ne se marchent plus dessus. |
| **ARCH04** | P2 | 21b–c | **Terminé** | Fetch hors écrans. `coachingStore` = modules + façade. | Façade store ; composants = écran, pas mini-app. |
| **ARCH05** | P2 | 17+23 | **Partiel** | CI refuse `shared` → `features` / stores et les deep-imports inter-features. **Reste :** `supabase.from` dans l’UI (`Dashboard`, `WorkoutForm`, …) — couche reportée. | Composant → hook/model → API → Supabase. CI refuse l’inverse **quand** la couche UI sera activée. |
| **ARCH06** | P2 | 19 | **Terminé** | Primitives listées = tokens. Écrans métier encore `blue-600` (hors lot). | `<Button variant="primary">` = tokens. Pas deux systèmes dans les primitives. |
| **ARCH07** | P2 | 22a | **Terminé** | Transversal / domaine + réexport `lib/types.ts`. | Un agent nutrition ne touche plus le hotspot unique. |
| **ARCH08** | P2 | 22b | **Terminé** | `fr/` `en/` par domaine + barils. | Un agent nutrition ne touche plus un fichier de 100 KB. |
| **ARCH09** | P1 | 17 | **Terminé** | Découverte `src/**/*.test.ts` ; nom `prometheus-tracker-app` ; rename `auditLot*` / `uxPremium`. | Un `.test.ts` est lancé sans éditer `package.json`. |
| **ARCH10** | P2 | 23 | **Terminé** | Overlays ESLint + `PageTransition` hors `shared/ui`. Pas de `noUncheckedIndexedAccess`. | Règles `shared`/`features`/`ui`. **Pas** de bang TS extra (`strict` déjà true). |
| **ARCH11** | P1 | — | **Terminé** (ne pas toucher) | 2 migrations ping identiques dans le lock. | Historique appliqué immuable. |
| **ARCH12** | P2 | 17d | **Terminé** | `.env` local ; `.env.example` placeholders ; `.env.production` = clés publiques frontend seulement. | Une convention. Pas de `service_role` dans Git. |

---

## Décisions de cadrage (conservées)

| Suggestion | Décision |
|---|---|
| Questionnaire en phases | Oui au regroupement utile. Pas exactement 3 phases. UX03–05, UX80. |
| Silhouette | P3. UX06. |
| Accusé de check-in | Oui. Date seulement si réelle. Pas « transmis ». UX26. |
| Empty sans programme | Oui, avec contact. UX10 **Terminé**. |
| Cartes avant/après IA | Oui, avec portée. UX20, UX23, UX43, UX87–97. |
| Ask solo | Barre sur Entraînement / Nutrition (lot 12), puis autres surfaces (lot 13). Pas d’onglet, pas `/prometheus`. Coaché : brouillon Messages (UX93), pas `/prometheus`. |
| Proposition IA | Toujours un choix : ignorer / une fois / enregistrer. Jamais d’auto-apply. |
| Équivalence alimentaire « compensation » | Non. UX51–53. |
| Mode simple / avancé parallèle | Non : disclosure progressive. |
| Repos auto | Volontaire, après coche. UX15. |
| Actions groupées coach | P3. UX38. |
| 6ᵉ onglet / Copilote tab / switcher chrome | Non. |
| Logger plat sur séance programmée (`hevySimple`) | Non une fois lot 14. Types + groupes viennent du plan. Coaché : pas d’exo hors plan. |
| Refactor `app`/`features`/`shared` pendant 11–16 | Non. File 17–23 après 16. Lot 17 hygiène seulement si un test nouveau. |
| Une PR architecture + comportement | Non. Structure pure, un domaine. |
| Split `coachingStore` sans façade | Non. Lot 21c. |

---

## Preuves de parcours (quand un lot se clôt)

Comptes de test, pas la CI seule. **Joué 15 sept.** (SQL `chantier-*-1515`) : lots **1–16**, **M0–M5**, **UX05**, **UX07** (vue d’ensemble + rings), **UX08**, **UX09**, **UX10**, **UX13**, **UX15**, **UX16**, **UX18**, **UX25**, **UX28**, **UX36**, **UX44**, **UX51**, **UX84**. **M7–M8** et contrats catalogue **UX19 / 22 / 23 / 27 / 32 / 47 / 50 / 67 / 112 conçus**. Reste À vérifier / À construire.

| Rôle | Scénario | Observer |
|---|---|---|
| Solo / coaché | Séance : 1 série cochée, 1 préremplie non cochée, Terminer | **Joué.** Bilan / recap / 360 : **une** série réalisée. |
| Coach dual-rôle | Personnel → Profil → Mode coach OFF avec clients actifs | **Joué.** N>0 : refus chiffré, « Voir mes clients », pas d’RPC. |
| Coaché | Invite → questionnaire incomplet | **Joué.** Consentement + Aujourd’hui / Messages / Profil / `/questionnaire` sans mur. |
| Coaché | Questionnaire : résumé + une rubrique | **Joué (UX05).** Résumé ; Compléter une rubrique ; Retour ; v2 = complément, pas de reset. |
| Solo / Coach | Check-in cœur vs détails | **Joué (UX25).** Cœur court ; Plus de détails ; historique et 360 = scores remplis seulement ; setup Essentiels / Détails. |
| Solo | Photos | **Joué.** « Visible seulement par toi — aucun coach n’y a accès. » |
| Coaché | Photos + 360 | **Joué.** Audience coach nommé ; 360 « Tu vois toutes les photos… ». |
| Coaché / solo | Deux séances le même jour dans le calendrier | **Joué.** Les deux listées. Unique pesée/jour = contrainte prod. |
| Coaché | Recherche progression | **Joué.** `/exercise-progress` filtre « Squat ». |
| Coach / coaché | Dismiss Accueil | **Joué.** Carte masquée ; `read_at` inchangé. |
| Coaché | Entraînement sans éditer le plan | **Joué.** « Mon programme » lecture (Squat 3×5, Bench 3×8). |
| Coach | Filtre roster | **Joué.** `/clients?filter=checkin` + Effacer. |
| Coach | Assigner un programme depuis la bibliothèque | **Joué.** Recap nom + destinataire + date. |
| Coach | Ask avant envoi | **Joué.** « Avant d’envoyer » + effet brouillon. |
| Coaché | Check-in | **Joué.** « Enregistré — visible par {coach} ». |
| Solo / coaché | Ask 13a–13i | **Joué.** Séance / journal / note / recale / brouillon / swap / semaine / ingrédient / deload. |
| Coach / solo | Enregistrer un programme (nom + un jour) | Une écriture ; échec = rien changé. Liste encore là si le chargement rate. |
| Coach → client | Jour avec squat + développé en **superset**, et un développé avec **drop** 100→80→60 | **Joué.** Groupe A ; Bench drop 3 chutes. Logger : SUPERSET + 100/80/60. |
| Solo | Accueil + Profil sans switcher / départ / roster | **Joué.** Dashboard personnel. Pas de `[aria-label=Espace]`. |
| Coaché | Accueil nommé + Profil départ | **Joué.** « Coaché par Chantier Coach » ; modal 3 listes. |
| Coach | Roster Coaching | **Joué.** `/clients` : Client + Invitee. Switcher Personnel / Coaching. |
| Coach-athlète | Switcher → Personnel | **Joué.** Accueil solo-like ; `user_roles` reste `coach`. |
| Coach dual-rôle | Personnel puis `/clients` direct | **Joué (M1).** Nav sans Clients ; roster encore là. 0 self-link prod. |
| Coaché (leaver) | Profil → Mettre fin au suivi | **Joué (M2a).** 4 listes ; solo ; séance gardée ; notice coach ; hors roster. |
| Solo / coaché / coach | Invite expiré, used, déjà lié, self | **Joué (M2b).** Issue + Retour ; « déjà un coach » ; pas sa propre invite. |
| Nouveau compte | `/auth` puis intention `find_coach` | **Joué (M3).** Annuaire puis Accueil / Entraînement personnels. |
| Coach | Offre opt-in | **Joué (M4).** Sans publier = roster OK. Publier / retirer = annuaire. |
| Coaché / chercheur | Annuaire + acceptation | **Joué (M5).** Déjà lié = explication. Accepté = suivi actif, pas un paiement. |
| Coaché / Solo / Invitee | Dashboard : rings nutrition + courbe de poids | **Joué (UX07).** Mêmes rings que `/nutrition` (kcal + macros). Cible absente = `—` / « Aucune cible définie », jamais 2000/150/250/65. |
| Coaché | Accueil : séance due + message / check-in + poids | **Joué (UX07).** Priorité + vue d’ensemble. Waiting reste une priorité claire vers Messages. |
| Solo / Coaché | Dashboard / Entraînement → Mon programme | **Joué (UX08).** Solo « Plan UX84 Mardi » → `/programs`. Client « Plan Chantier Force ». |
| Coach | Roster → fiche → suivante / précédente | **Joué (UX09).** `1 / 2` → `2 / 2` ; onglet Check-ins conservé ; retour liste. |
| Solo | Reprendre les valeurs d’une série | **Joué (UX13).** 3 rangées restent 3 ; 2ᵉ = 80/5/2. |
| Solo | Repos auto volontaire | **Joué (UX15).** Toggle Unités on/off ; fill et coche off = pas de minuteur ; coche on = modal. |
| Coach | File / settings / Ask / relance | **Joué (UX28).** « non loggée » / « en attente » / « manquant(s) » ; relance « comment se passent tes séances ? ». |
| Coach | Filtres roster | **Joué (UX36).** Puces ; Check-in = Invitee seul ; Effacer = les deux. |
| Solo | Ajouter un aliment | **Joué (UX51).** Catalogue / saisie manuelle en mots, non certifié. |
| Tous | Petit écran, clavier, FR/EN, zoom | Lot concerné toujours faisable |

Références a11y : [formulaires multi-pages W3C](https://www.w3.org/WAI/tutorials/forms/multi-page/), [cibles WCAG 2.2](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html), [messages de statut](https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html).
