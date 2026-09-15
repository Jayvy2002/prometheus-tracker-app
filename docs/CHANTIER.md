# Chantier — Prometheus

> **RÔLE — SEULE SOURCE DU TRAVAIL RESTANT**
>
> Ordre des travaux, décisions, défauts à corriger, fonctionnalités à construire, critères de fin.
>
> **Instruction agents :** un élément sort uniquement après **preuve de code + parcours réel**, ou après abandon produit noté ici. Ne pas en faire un journal de PR. Git garde l’historique ; `README.md` décrit l’app actuelle ; `VISION.md` la destination ; `RAPPORT_UX_FONCTIONNALITES.md`, `AUDIT_NAVIGATION_UX.md` et `AUDIT_ARCHITECTURE.md` diagnostiquent — **ils n’ordonnent pas**. Si un diagnostic contredit ce fichier, **ce fichier gagne**.

**Mis à jour : 15 septembre 2026.** Lots 1–16 + 16f–16g + **17–21b** dans `new-JV`. File ouverte : **lot 21c** (`coachingStore` + façade). Lots 22–23 après. Une CI verte ne clôt pas une ligne UX.

| **Lot ouvert : 21c**. Lots **17–21b** dans `new-JV`. Lots 11–16 : apply prod + parcours encore dus. Lots 2–10 : **2 Terminé** ; **3–10 Partiel**.

**Preuve live 15 sept. (lots 2–10)** — comptes jetables coach + solo ; client ghost SQL (signup 429, pas de 3ᵉ compte loggable). Vite `127.0.0.1:5174`. Chrome headless (computerUse indisponible). RPC via JWT prod.

| Lot | Joué live | Reste (ne pas reconstruire) |
|---|---|---|
| **2** Désactivation mode coach | **PASS.** RPC : N=0 `none` → `"none"` ; N>0 (lien ghost actif) `coach_has_active_clients`. UI Personnel : modal « Des clients sont encore liés », « 1 client(s) actif(s) », « Voir mes clients » → `/clients` (Live210 Ghost). Pas de désactivation. | — |
| **3** Programmes | RPC `create_program_complete` + `save_program` OK ; 2ᵉ save `updated_at` périmé → `"stale"`. UI liste + éditeur (révision 2, Enregistrer). | Clic « Proposer » n’a **pas** ouvert le recap destinataire dans le DOM capturé. |
| **4** Questionnaire | Coach n’est pas prisonnier du questionnaire. | Invite → Aujourd’hui / messages / compte **non joué** (pas de 3ᵉ compte). |
| **5** Photos | Solo : « Visible seulement par toi — aucun coach n’y a accès. » | Photos **coaché** + 360 coach : pas d’athlète loggable. |
| **6** Calendrier | 15 sept. : deux séances (« Live210 matin » + « Live210 soir ») listées. | 2ᵉ pesée le même jour **refusée** (`weight_measurements_user_id_measured_at_key`) — 1 pesée/jour max en prod, pas un trou UI. Recherche progression non rejouée. |
| **7** Messages | `/messages/{ghost}` : textarea, aller-retour dashboard, brouillon restauré. | Dismiss Accueil ≠ lu non joué. Un seul fil. |
| **8** Trouver programme | Solo : 5 onglets ; Entraînement « Mon programme » + Progression ; `/exercise-progress` ouvert. Stats/calendrier accessibles en **solo** (contrat). | Lecture programme **coaché** non jouée. |
| **9** File coach | « depuis quand » = aujourd’hui ; Passer → toast « Signal écarté / Annuler » ; empty « Rien d’urgent ». | Filtre roster `?filter=` non rejoué. |
| **10** Cohérence | 10a Recettes dans Nutrition + `/recipes` AppLayout. 10b revue 3 chiffres. 10c onglet **Récupération** (1er clic roster → setup, pas 360). 10j preview setup « Ce que le client verra ». | 10d carte après « Demander » = filtre liste (pas recap destinataire Ask). 10e check-in solo (pas « visible par {coach} »). |

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
- Accueil = prochaine action **utile** ou **vide honnête**.
- Accessibilité bloquante : dans le lot du parcours.
- Frontend cible : `src/app` / `src/features/<domaine>` / `src/shared` + alias `@/`. Aujourd’hui le code n’y est pas — lots 17–23, **pas** 11–16.
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
| 1 reminder / jour (deload/repas/eau masqués si coaché) | Message + check-in + reminder peuvent encore coexister (UX07) |
| Heroes d’accueil exclusifs | Vide honnête un jour sans tâche |
| File coach : empty, sévérité **texte**, une carte featured | Live 15 sept. : depuis quand + Passer un signal. Filtre roster `?filter=` encore dû. |
| Ancres check-in haut/bas (#91) | Accusé « visible par {coach} » (Git lot 10e). Live : check-in solo seulement. |
| `Terminer` **n’écrit plus** `completed` sur les séries restantes | — |
| Affichage = séries **cochées** (`isPerformedSet` / `readableSets`) | Parcours 15 sept. : bilan + recap + 360 (1 cochée, 1 non cochée) |
| Repos 90 s lancé après coche | Préférence auto **volontaire** (UX15) |
| Assign programme : plus de premier client auto | Recap destinataire dans le modal (parcours dû, UX21) |
| Inputs séance agrandis, cibles 44 px (#91) | OverflowMenu Échap + focus (Git lot 10g). `aria-current` onglets. |
| RPC `client_end_coach_link` + UI Profil + tests | Preuve prod, notif, sérialisation, copy 3 listes (M2a) |
| Annuaire / offre / demandes en code | Copy « accepté = suivi actif » (M5) |
| Table `exercises` + `primary_muscles` / `muscleLabels` + picker | **Pas** de vidéo ni mannequin. Lot 11 étend, ne recrée pas |
| `accountContext`, espaces Personnel / Coaching | SQL + RPC live lot 2 : `none` refusé si roster actif (`coach_has_active_clients`) |
| Questionnaire prise en charge : plus de `path="*"` ; bannière + lien `/questionnaire` | Parcours invite encore dû (lot 4, pas de 3ᵉ compte) |

---

## File d’exécution — ce qu’il reste à faire maintenant

Travailler **un lot à la fois**, dans cet ordre. Les IDs entre parenthèses sont le contrat du catalogue. Un ID **absent de cette file** ne se commence pas tant que les lots 1–10 ne sont pas verts (sauf P1 nouveau du même type : ment / verrouille / détruit un accès). Lots **11–16** = produit. Lots **17–23** = structure (`AUDIT_ARCHITECTURE.md`) **après 16**, gravité croissante — **pas** mélangés aux PR biblio / Ask / types de séries.

| # | Lot | Statut | Preuve de fin |
|---|---|---|---|
| **1** | **Vérité des séries réalisées** (UX12, UX17, UX49) | **Terminé** | Parcours 15 sept. : 1 série cochée + 1 non cochée → bilan (volume / 1RM / fait « non cochée(s) »), recap, 360 coach (`readableSets` : seule la cochée). Auto-close 30 s retiré ; `prCount` mort retiré ; plus de « Conseil du coach ». UX49 « jours ≠ séances » → lot 6. |
| **2** | **Désactivation mode coach** (UX78) | **Terminé** | SQL prod + RPC live : `none` OK si roster vide ; `coach_has_active_clients` si lien actif. UI Personnel : N>0 bloque (chiffre, « Voir mes clients », **pas** d’RPC). Parcours 15 sept. soir. |
| **3** | **Programmes : écriture honnête** (UX20, UX21, UX63) | **Partiel** | RPC live : `save_program` + `stale`. UI éditeur / révision. **Reste :** recap destinataire du modal « Proposer » (non ouvert dans le DOM capturé). |
| **4** | **Questionnaire sans prison** (UX80, UX02, UX03, UX04) | **Partiel** | Coach non prisonnier. **Reste :** parcours invite (pas de 3ᵉ compte — signup 429). |
| **5** | **Photos et audience** (UX54) | **Partiel** | Solo live : « visible seulement par toi ». **Reste :** photos coaché + 360 (pas d’athlète loggable). |
| **6** | **Calendrier, recherche, erreur ≠ vide** (UX48, UX49, UX63) | **Partiel** | Deux séances le même jour listées. **Prod :** 1 pesée/jour (`weight_measurements_user_id_measured_at_key`) — pas un trou UI. **Reste :** recherche progression. |
| **7** | **Messages : brouillon et lu** (UX29–31, UX85) | **Partiel** | Brouillon restauré après aller-retour dashboard. **Reste :** dismiss Accueil ≠ lu. |
| **8** | **Trouver programme et progression** (UX08, UX10, UX81, UX84, UX07 athlète) | **Partiel** | Solo live : Mon programme + `/exercise-progress`. **Reste :** lecture programme coaché. |
| **9** | **File coach et continuité** (UX09, UX33, UX34, UX07 coach, UX35) | **Partiel** | Depuis quand + Passer un signal (annulable) + empty. **Reste :** filtre roster conservé. |
| **10** | **Cohérence restante** | **Partiel** | 10a, 10b, 10c, 10j live. **Reste :** 10d recap Ask (filtre joué) ; 10e check-in coaché. |
| **11** | **Bibliothèque d’exercices** (UX86) | **À vérifier** | Git : `video_url` + mannequin blanc / rouge (`primary` / `secondary`) dans picker **et** fiche séance. Seed 31 vidéos. **Reste :** parcours live picker (prod = apply `20260915180000`). |
| **12** | **Ask solo contextualisé** | **12a–12b À vérifier** | Solo Entraînement + Nutrition : barre Ask + revue. Jamais auto-apply. |
| **13** | **Ask : autres surfaces** | À construire **après 12** | Même contrat (contexte de page, validation humaine). Séance en cours, journal / macros restants, check-in, jour loupé, coaché = brouillon Messages, alternatives d’exo (après 11), plan semaine + courses, swap d’ingrédient, deload. Une PR par ligne. |
| **14** | **Types de séries : builder + logger** | À construire **après 10** | Le plan prescrit **tous** les `SET_TYPES` ; le logger **change de saisie** selon le type (drop = N charges / une série ; superset = les 2+ exos du tour). Séance programmée joue la prescription. Coaché : pas d’exo hors plan. Une PR par ligne. |
| **15** | **Confort séance, journal, photos** | À construire **après 14** | Timer de repos persistant ; séance libre → modèle ; disques ; repas d’un jour choisi ; scanner hérite date/repas ; HEIC. Une PR par ligne. Recettes coaché = **10a**, pas ici. |
| **16** | **Outillage coach et chrome coaché** | À construire **après 15** | FAB check-in ; dupliquer un programme ; notes d’exo au 360 ; copier le setup tracking ; Nutrition coaché sans 6ᵉ onglet. Une PR par ligne. |
| **16f** | **Calculateur de disques visuel** (UX103) | **À vérifier** | Un **côté de barre**, disques ajoutables (kg 25/20/15/10/5/2.5/1.25 ou lbs 55/45/35/25/10/5/2.5), couleurs haltéro, unité du profil. Parcours live 15 sept. (kg 25+10 = 90 ; lbs 55+45 = 245). |
| **16g** | **Logger séance lisible sur téléphone** | **À vérifier** | Header, fiche exo (actions en overflow), rangées de séries. Sans casser le lot 14. Parcours live 390×844 + desktop. **Pas d’ID UX inventé.** |
| **17** | **Hygiène agents** (ARCH01 docs, ARCH09 tests, ARCH12 env) | **Terminé** (17a–17e) | Docs + découverte `src/**/*.test.ts` + nom package + convention env + rename `auditLot*` / `uxPremium`. **Zéro écran.** |
| **18** | **Socle dossiers + alias** (ARCH02 évidents) | **Terminé** | `app` / `features` / `shared` + alias `@/`. Hooks évidents, client Supabase, `ui`, layout, nav. Réexports aux anciens chemins. |
| **19** | **Tokens sémantiques sur primitives** (ARCH06) | **Terminé** | `Button` / `Card` / `Input` / `Select` / `Modal` / `PageHeader` / `EmptyState` / `ErrorState` / `TabList` / `IconButton` = `primary`, `surface`, `ink`, `line`, `danger`. Plus de `blue-600` / `neutral-*` / `rose-*` **dans ces fichiers**. Écrans métier inchangés. |
| **20** | **Migrer `src/lib` par domaine** (ARCH01) | **Terminé** | Coaching, marketplace, workout, nutrition, programs → `features/<domaine>/domain` + réexports `lib/`. |
| **21** | **Découper les mini-apps** (ARCH03, ARCH04) | **21a–b Terminé** ; 21c à construire | 21a router / guards / bootstrap. 21b fetch hors écrans. 21c `coachingStore` **avec façade**. |
| **22** | **Types et i18n par domaine** (ARCH07, ARCH08) | À construire **après 20** | `types.ts` puis `fr.ts`/`en.ts` découpés ; réexport de transition. Hotspots merge : PR courtes. |
| **23** | **Garde-fous CI** (ARCH10, ARCH05) | À construire **après 18** et au fil de 20–22 | `shared` ↛ `features` ; pas de deep-import inter-features ; UI sans `supabase.from()` ; `shared/ui` sans Supabase/Zustand. **Pas** un bang TypeScript extra. |

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
| 21c | `coachingStore` : modules (`clients`, `messages`, `questionnaires`, `interventions`, `tracking`) + **façade** `coachingStore.ts` pour les imports existants. Pas de split sans façade. | ARCH04 |

### Lot 22 — une PR types, une PR i18n (ou par domaine si conflit)

| # | Contenu | IDs |
|---|---|---|
| 22a | Contrats transversaux → `shared/types`. Reste → `features/<domaine>/types.ts`. `lib/types.ts` **réexporte** le temps de la migration. | ARCH07 |
| 22b | `i18n/locales/fr/` et `en/` : `common`, `navigation`, `coaching`, `workout`, `nutrition`, `programs`, `marketplace`. i18next inchangé. | ARCH08 |

### Lot 23 — règles, pas un nouveau style de code

Quand `shared` / `features` existent : ESLint (ou équivalent CI) pour ARCH10 / ARCH05. Ne **pas** activer d’un coup des flags TS absents (`noUncheckedIndexedAccess`, etc.). `strict` est déjà `true`.

**Après les lots 17–23 :** preuve prod des lots M encore « À vérifier », M7, confort P2/P3 restant, capteurs santé (UX112), billing.

**Après le lot 16 :** d’abord **16f–16g** (disques visuels + logger téléphone) si demandés, puis la file structure **17–23**, puis M / UX112 / billing. Ne pas « nettoyer » Supabase (ARCH11).

---

## Ancres code (lot 1–23) — ne pas chercher à l’aveugle

| Lot | Où ça ment / casse aujourd’hui |
|---|---|
| 1 | **Corrigé + parcours 15 sept.** `isPerformedSet` ; `readableSets` = `completed`. Bilan / recap / 360 : 1 cochée + 1 non cochée. |
| 2 | **Terminé.** RPC live `none` / `coach_has_active_clients`. UI Personnel N>0 sans RPC, « Voir mes clients ». |
| 3 | **Partiel.** RPC `save_program` + `stale` live. **Reste :** recap destinataire UI. |
| 4 | **Partiel.** Coach non prisonnier. **Reste :** invite. |
| 5 | **Partiel.** Solo live. **Reste :** photos coaché. |
| 6 | **Partiel.** Deux séances le même jour. Unique pesée/jour en prod. **Reste :** recherche. |
| 7 | **Partiel.** Brouillon restauré live. **Reste :** dismiss ≠ lu. |
| 8 | **Partiel.** Solo Mon programme + progression. **Reste :** coaché. |
| 9 | **Partiel.** Depuis quand + Passer live. **Reste :** `?filter=` roster. |
| 11 | Table `exercises.video_url`. Mannequin `ExerciseMuscleMannequin`. Picker + `ExerciseCard` via `ExerciseMedia`. **Reste :** apply prod + parcours. |
| 12 | `/prometheus` = `CoachOnly`. Solo : revue hebdo Accueil (`soloCopilot`), pas de barre Ask sur `/workout` ni `/nutrition`. Recettes = `recipeStore`. |
| 13 | `WorkoutForm` : pas d’Ask in-session. Check-in : champs, pas de note proposée. Coaché : Ask n’existe pas ; Messages = texte. Picker : pas d’alternatives muscle/matériel. |
| 14 | `ProgramDayExercise` / `ProgramExerciseDraft` : sets, reps, rir, rest, poids. `SET_TYPES` + drop/myo/tempo/iso/cluster **seulement** dans `ExerciseCard` si `!program_day_id`. `hevySimple = !!program_day_id`. Superset = `superset_group_id` à la volée, pas au plan. Drop = **autre ligne** `set_type: drop`, un poids. |
| 15 | `RestTimer` : `open={showTimer}` ; `onClose` démonte. `/programs/new` = `CoachOnly`. `copyFromYesterday`. `navigate('/scanner')` sans query. `heic_unsupported`. |
| 16 | `FAB` : workout / weight / meal. Pas de Dupliquer sur `ProgramsPage`. `LastSessionExercise` sans notes. Setup tracking par client, pas de copie. `mobileTabs` coaché : Aujourd’hui / Entraînement / Check-in / Messages / Profil. |
| 17 | **Terminé.** `npm test` → `scripts/run-unit-tests.mjs`. Nom `prometheus-tracker-app`. Docs + env. Tests : `programAtomicWrites`, `reviewWindowAndPortions`, `clientDossierRealtime`, `programRevisionsAndIntake`, `honestTargetsAndFirstRun`. |
| 18 | **Terminé.** Cibles livrées + réexports. Alias `@/app`, `@/features`, `@/shared`. |
| 19 | **Terminé.** Primitives listées = tokens. `primary` / `success` / `warning` / `danger` dans `tailwind.config.js`. |
| 20 | **Terminé.** Domaines métier dans `features/*/domain`. Réexports `lib/`. Transverse (utils, types, i18n) reste pour 22. |
| 21 | **21a–b livrés.** Reste **21c** : `stores/coachingStore.ts` + façade. |
| 22 | `src/lib/types.ts` ~26 KB. `i18n/locales/fr.ts` / `en.ts` ~87–95 KB. |
| 23 | ESLint standard, pas de frontières `shared`/`features`. `Dashboard.tsx` (et d’autres) : `supabase.from` dans l’UI. `tsconfig.app.json` : `"strict": true` **déjà**. |

---

## Chantier 2 — Continuité, identité, marketplace

**Décision :** un moteur, identité durable, capacité coach ≠ accompagnement personnel, marketplace et suivi dans la même app.

**État code (14 sept. 2026, `3233932`) — ce n’est pas la preuve prod.** Intention après compte, espaces Personnel/Coaching, `client_end_coach_link`, invitation consentie, annuaire / demandes / offre, `respond_coaching_request` **active déjà** le lien **sans paiement**. Les lignes M restent ici tant que migration Git + apply prod + parcours n’ont pas été **prouvés**.

| Lot | Statut | Conditions de fin | Reste réel |
|---|---|---|---|
| **M0** Inventaire rôles / policies vs carte | À vérifier | Scénarios solo, coaché, coach, coach-athlète. Aucun changement de droits. | Revues UX 14 sept. = UI ; confirmer vs policies live, puis retirer. |
| **M1** Capacités + espaces Personnel/Coaching | À vérifier | Backfill coachs ; aucun auto-lien ; rollback UI sans drop de colonnes. | `accountContext` existe. Prouver droits serveur ≠ espace affiché, dual-rôle. **Lot 2 (UX78) : Terminé** (RPC + UI live). `user_roles` reste l’écriture. |
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

## Après la file 1–10 (lots 11–23 et catalogue — live 2–10 joué 15 sept. ; 11–16 ouverts ; 17–23 après 16)

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
| Builder : tous les types de séries + groupes superset | UX98 | Lot 14a, après 10 |
| Logger adapté au type (drop multi-charges, tour superset, …) | UX99 | Lot 14b, après 10 |
| Séance programmée joue la prescription (plus de `hevySimple`) | UX100 | Lot 14c, après 10 |
| Timer de repos persistant | UX101 | Lot 15a |
| Séance libre → jour de plan / modèle | UX102 | Lot 15b |
| Calculateur de disques visuel (un côté, couleurs, 55 lb) | UX103 | Lots 15c / 16f |
| Logger séance lisible sur téléphone | — | Lot 16g (pas d’ID inventé) |
| Réutiliser un repas d’un jour choisi | UX104 | Lot 15d |
| Scanner hérite date + catégorie | UX105 | Lot 15e |
| HEIC iPhone | UX106 | Lot 15f |
| Check-in dans le FAB | UX107 | Lot 16a |
| Dupliquer un programme | UX108 | Lot 16b |
| Notes d’exo en 360 / dernière séance | UX109 | Lot 16c |
| Copier le setup tracking | UX110 | Lot 16d |
| Nutrition coaché sans 6ᵉ onglet | UX111 | Lot 16e |
| Capteurs santé (Apple Health / Garmin, …) | UX112 | Après 16 **et 17–23**, à concevoir |
| Matrice fichiers + design tokens documentés | ARCH01 | Lot 17a |
| Autodiscovery tests + nom package + rename progressif | ARCH09 | Lot 17b–e |
| Une convention `.env` / Netlify | ARCH12 | Lot 17d |
| Dossiers `app`/`features`/`shared` + alias `@/` + déplacements évidents | ARCH02 | Lot 18 |
| Primitives = tokens sémantiques | ARCH06 | Lot 19 |
| `src/lib` → features par domaine | ARCH01 | Lot 20 |
| Composant → hook → API → Supabase | ARCH05 | Lots 17 (convention), 20–21 (déplacer), 23 (CI) |
| Découper `App.tsx` | ARCH03 | **21a Terminé** |
| Gros fichiers / `coachingStore` façade | ARCH04 | **21b Terminé** ; 21c façade |
| `types.ts` par domaine (réexport) | ARCH07 | Lot 22a |
| i18n par domaine | ARCH08 | Lot 22b |
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
| **4** dashboard | **Partiel** | Un hero ; proposition IA = notice (#91). Message + check-in + reminder peuvent coexister. `waiting_program` inerte. |
| **5** Coach Today | **Partiel** | Empty + sévérité texte + featured. « Depuis quand » + Passer un signal (Git lot 9). Parcours live dû. |
| **6** Client 360 | À vérifier | Dernière séance = séries cochées (parcours 15 sept.). Onglet **Récupération** (Git 10c). « Depuis ta dernière visite » (lot 9). |
| **7** Setup 4 étapes | À vérifier | Titre preview « Ce que le client verra » (Git 10j). Parcours live dû. |
| **8** Messages / Prometheus | **Partiel** | Retry / safe-area. Brouillon + lu : Git (lot 7). |
| **9** Marketplace vitrine | À vérifier | Pas de faux prix. Acceptation = **lien actif**. Copy à aligner. |
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
| **UX11** | P2 | 10i | **À vérifier** | Séance / programme / modèle. Copy « routine » retirée. **Reste :** parcours live. | Un nom = une action. |
| **UX74** | P1 | 10h | **À vérifier** | `navConfig` + reset `PageTransition` au changement de persona. **Reste :** parcours dual-rôle live. | Un ajout de destination = un endroit. |
| **UX75** | P1 | 10h | À vérifier | Switcher Profil, 5ᵉ onglet Compte. Dual-rôle : Objectifs selon **espace**. | Changer d’espace change Profil et onglets. |
| **UX76** | P2 | 10g | **À vérifier** | `aria-current="page"` BottomNav / SideNav. Badge unread. **Reste :** zoom 200 % live. | Onglet actif identifiable clavier / lecteur. |
| **UX77** | P2 | 10a | **À vérifier** | Recettes dans AppLayout / Nutrition. Plus de `FullPageLayout`. **Reste :** parcours live (solo + coaché). | Recettes ≠ session ; séance a une sortie. |
| **UX84** | P1 | 8 | À construire | FAB + Nouveau `/workout` : pas de doublon vs jour dû. | Hors programme **nommé** ; pas d’interdiction. |
| **UX107** | P2 | 16a | **À vérifier** | FAB + `quickAddActions` : check-in si le module est on. **Reste :** parcours live. | Check-in sans chercher l’onglet. |
| **UX111** | P2 | 16e | **À vérifier** | Tranché : Check-in en tab ; Nutrition via FAB + Profil + desktop. Pas de 6ᵉ onglet. **Reste :** parcours coaché mobile. | Nutrition = même carte mobile/desktop. |

### Séance

| ID | P | File | Statut | Travail restant | Critère de fin |
|---|---|---|---|---|---|
| **UX12** | P1 | 1 | **Terminé** | Seule une série **cochée** compte (`isPerformedSet` / `readableSets`). Parcours 15 sept. : bilan, recap, 360. | — |
| **UX13** | P2 | ens. | À construire | Reprendre les valeurs ≠ ajouter une série. | Pas de série en trop par raccourci. |
| **UX14** | P2 | 10f | **À vérifier** | Inputs séance agrandis. Progression : `formatWeight` / `unit_weight`. **Reste :** parcours live kg↔lbs. | Édition conservée ; unité du profil. |
| **UX15** | P2 | ens. | À vérifier | Repos 90 s déjà lancé après coche. Préférence auto **volontaire** ; pas au préremplissage. | Désactivable ; jamais sur un simple fill. |
| **UX16** | P1 | ens. | À construire | Langage : appareil / sync / action requise. | Après coupure, on sait ce qui est conservé. |
| **UX17** | P1 | 1 | **Terminé** | Plus de `setTimeout` 30 s. Fermer → recap. Faits, pas « Conseil du coach ». Parcours 15 sept. | — |
| **UX101** | P2 | 15a | **À vérifier** | Barre `data-rest-bar` ; fermer le modal ne reseed pas. UX15 (`restEpoch`) inchangé. **Reste :** parcours live. | On voit le temps restant sans le modal. |
| **UX103** | P3 | 15c / 16f | **À vérifier** | Un côté de barre, disques ajoutables, couleurs haltéro, inventaire kg + **55 lb**. Unité du profil. Parcours live 15 sept. | On voit et on compose la charge, pas une liste. |

### Exercices et programmes

| ID | P | File | Statut | Travail restant | Critère de fin |
|---|---|---|---|---|---|
| **UX18** | P2 | ens. | À construire | Variantes / matériel / récents. | Bonne variante avant sélection. |
| **UX86** | P2 | 11 | **À vérifier** | Vidéo + mannequin dans picker et fiche. Seed 31 URLs. **Reste :** apply prod + parcours. | On voit le mouvement et les muscles avant de choisir. |
| **UX98** | P2 | 14a | **À vérifier** | Builder : type + groupe superset + champs drop/tempo/iso/cluster/myo sur `program_day_exercises`. **Reste :** apply prod + parcours. | Le jour de plan dit *comment* logger, pas seulement 3×10. |
| **UX99** | P2 | 14b | **À vérifier** | Logger : drop = N charges / une coche ; repos superset après le dernier exo du groupe. **Reste :** parcours live. | On ne « simule » pas un drop ou un superset avec des working. |
| **UX100** | P2 | 14c | **À vérifier** | Plus de `hevySimple`. Seed `start_workout_from_template` joue la prescription. Coaché : toujours pas d’exo hors plan. **Reste :** apply prod. | Le client logge ce que le plan a prescrit. |
| **UX102** | P2 | 15b | **À vérifier** | Solo : « Enregistrer comme jour de plan » (`createProgram` + types lot 14). **Reste :** parcours live. | Une bonne séance libre n’est pas perdue. |
| **UX108** | P2 | 16b | **À vérifier** | Overflow « Dupliquer » → `fork_program`. **Reste :** parcours live. | Copier un plan ≠ l’assigner. |
| **UX19** | P2 | ens. | À concevoir | Remplacement « cette séance » vs « proposer au plan ». | Pas de réécriture silencieuse du futur. |
| **UX20** | P1 | 3 | **Partiel** | RPC `save_program` + `stale` live. | Le client voit ou ne voit pas ; pas de plan à moitié. |
| **UX21** | P1 | 3 | **Partiel** | Plus de premier client auto. Recap destinataire **pas** prouvé UI live. | Parcours bibliothèque sans destinataire accidentel. |
| **UX22** | P2 | ens. | À concevoir | Athlète = séance ; coach = structure. | Séance identifiable après report. |
| **UX23** | P1 | ens. | À concevoir | Diff avant/après, auteur, date d’effet. | Restaurer ≠ réécrire le passé. |
| **UX81** | P1 | 8 | À construire | **Après UX12.** Progression **lecture** coaché (`/exercise-progress`). Pas stats/calendrier dans le même PR. | Tendances d’exo accessibles ; plan non éditable. |

### Check-in et relation

| ID | P | File | Statut | Travail restant | Critère de fin |
|---|---|---|---|---|---|
| **UX24** | P2 | fait | À vérifier | Ancres bas/haut livrées (#91). | Historique comparable. |
| **UX25** | P2 | ens. | À construire | Champs vraiment utilisés ; cœur vs détails. | Chaque champ explicable. |
| **UX26** | P1 | 10e | **À vérifier** | Toast « Enregistré — visible par {coach} » après succès serveur. Pas « transmis ». **Reste :** parcours live. | Succès ≠ lu. |
| **UX27** | P2 | ens. | À concevoir | Relier réponse coach / adaptation au bilan. | Le coaché voit à quoi ça a servi. |
| **UX28** | P1 | ens. | À construire | Manque ≠ faute. Relances respectueuses. | Pas d’interprétation santé automatique. |

### Messagerie

| ID | P | File | Statut | Travail restant | Critère de fin |
|---|---|---|---|---|---|
| **UX29** | P1 | 7 | À vérifier | Ancrage au chargement de l’historique. | Page ancienne ≠ saut en bas. |
| **UX30** | P1 | 7 | **Partiel** | Brouillon restauré live (aller-retour dashboard). **Reste :** plusieurs fils / relance. | Changer de fil restaure le bon texte. |
| **UX31** | P1 | 7 | **À vérifier** | `read_at` seulement si `.select('id')` confirme. **Reste :** parcours live. | Pas de doublon ; pas de faux lu. |
| **UX32** | P2 | ens. | À concevoir | Lier séance / check-in (résumé). Après le socle 7. | Objet identifiable dans le fil. |
| **UX85** | P1 | 7 | **À vérifier** | Dismiss Accueil = session locale, pas `markCoachMessageRead`. **Reste :** parcours live. | Masquer un rappel ne marque pas lu. |

Cadrage : conversation intégrée, **pas** WhatsApp. Pièces jointes, vocaux, recherche, présence : **après** le socle. Pas de E2E promis.

### Travail coach

| ID | P | File | Statut | Travail restant | Critère de fin |
|---|---|---|---|---|---|
| **UX33** | P1 | 9 | **Partiel** | Pourquoi + **depuis quand** live. **Reste :** filtre roster. | Priorité compréhensible sans ouvrir la fiche. |
| **UX34** | P2 | 9 | **Partiel** | Passer = un signal, toast Annuler live. | Pas d’écartement en bloc. |
| **UX35** | P2 | 9+10c | À vérifier | « Depuis ta dernière visite ». Dernière séance = UX12. | Répondre sans relire tout le dossier. |
| **UX36** | P2 | ens. | À construire | Filtres visibles, éditables, effaçables. | On sait pourquoi un client est dans la liste. |
| **UX37** | P2 | 10j | **À vérifier** | Titre preview « Ce que le client verra ». **Reste :** parcours setup live. | Pas de surprise d’onglets / champs. |
| **UX38** | P3 | rep. | Reporté | Actions groupées limitées. | Seulement si gain prouvé. |
| **UX78** | P1 | 2 | **Terminé** | RPC live + UI Personnel N>0 (chiffre, « Voir mes clients », pas d’RPC). | Dual-rôle Personnel ne peut pas couper le roster en prod. |
| **UX109** | P2 | 16c | **À vérifier** | `LastSessionExercise.notes` + `SessionReadout`. **Reste :** parcours 360. | Le coach lit ce que l’athlète a noté sur le mouvement. |
| **UX110** | P2 | 16d | **À vérifier** | Setup : copier modules + vars d’un autre client dans le formulaire. **Reste :** parcours live. | Pas de setup à retaper à l’identique. |

### Questionnaire coach (builder)

| ID | P | File | Statut | Travail restant | Critère de fin |
|---|---|---|---|---|---|
| **UX39** | P2 | ens. | À construire | Partir d’un modèle court. | Questionnaire court sans jargon. |
| **UX40** | P2 | ens. | À construire | Preview effort (écrans, obligatoires, FR/EN). | Aperçu = parcours client. |
| **UX41** | P1 | ens. | À construire | Publication : qui doit compléter. | Pas de reset massif pour une typo. |

### IA

| ID | P | File | Statut | Travail restant | Critère de fin |
|---|---|---|---|---|---|
| **UX42** | P1 | 10d | **À vérifier** | Carte qui + effet avant `askCoachAgent`. Roster = filtre local. **Reste :** parcours live. | Pas d’ambiguïté de destinataire. |
| **UX43** | P1 | 10d | **À vérifier** | Effet : filtre / brouillon réponse / programme / plan. Confirm explicite. **Reste :** parcours live. | « Envoyer » ne cache pas un changement de plan. |
| **UX44** | P2 | ens. | À construire | Attente IA quittable. | L’app reste utilisable. |
| **UX45** | P2 | 10b | **À vérifier** | Revue = 3 chiffres (kcal / delta / séances). Notice Accueil gardée. **Reste :** parcours live. | Aucune application sans choix. |
| **UX46** | P2 | 10c | **À vérifier** | Learned : kinds FR/EN, pas de clés JSON. Onglet 360 **Récupération**. **Reste :** parcours live. | Désactivation sans clés techniques. |
| **UX87** | P2 | 12a | **À vérifier** | Barre Ask Entraînement. **Reste :** parcours live. | La réponse est actionnable et durable, jamais auto-appliquée. |
| **UX88** | P2 | 12b | **À vérifier** | Barre Ask Nutrition. **Reste :** parcours live. | Recette proposée = enregistrable **au choix**, jamais forcée. |
| **UX89** | P2 | 13a | **À vérifier** | Ask dans `WorkoutForm` (surface `session`) : apply = cette séance, pas de save plan. **Reste :** parcours live. | N’écrit le plan que si on enregistre. |
| **UX90** | P2 | 13b | **À vérifier** | Restes du jour → 2–3 idées (`recipes`). **Reste :** parcours live. | Même choix qu’UX88. |
| **UX91** | P2 | 13c | **À vérifier** | Check-in → note de séance préremplie. **Reste :** parcours live. | Proposition ≠ diagnostic. |
| **UX92** | P2 | 13d | **À vérifier** | Jour loupé → `plan_shift` (save seulement, pas d’auto-skip). **Reste :** parcours live. | Pas d’auto-skip. |
| **UX93** | P2 | 13e | **À vérifier** | Coaché : Ask = `saveMessageDraft` + `/messages`. **Reste :** parcours live. | Le coach lit ce que le client envoie. |
| **UX94** | P2 | 13f | **À vérifier** | Alternative depuis la fiche (`swap_exercise` cette séance). **Reste :** parcours live. | Swap cette séance après revue. |
| **UX95** | P2 | 13g | **À vérifier** | Semaine + courses (`groceryList`). **Reste :** parcours live. | Enregistrable, pas auto-appliqué. |
| **UX96** | P2 | 13h | **À vérifier** | Swap ingrédient depuis Nutrition. **Reste :** parcours live. | Cibles conservées. |
| **UX97** | P2 | 13i | **À vérifier** | Deload / dernière charge dans la proposition. **Reste :** parcours live. | Revue avant écriture. |

### Calendrier et indicateurs

| ID | P | File | Statut | Travail restant | Critère de fin |
|---|---|---|---|---|---|
| **UX47** | P2 | ens. | À concevoir | Prévu / commencé / terminé ; report expliqué. | Le passé ne disparaît pas. |
| **UX48** | P1 | 6 | **Partiel** | Deux séances le même jour listées live. Unique pesée/jour en prod. **Reste :** recherche. | Deux séances le même jour visibles. |
| **UX49** | P2 | 1+6 | **À vérifier** | Lot 1 : manque ≠ 0. Lot 6 Git : jours ≠ séances (plusieurs cartes). **Reste :** parcours live calendrier. | Pas de conclusion sur données insuffisantes. |
| **UX50** | P2 | ens. | À concevoir | Du point de courbe vers la séance. | Origine retrouvable. |

### Nutrition, recettes, photos

| ID | P | File | Statut | Travail restant | Critère de fin |
|---|---|---|---|---|---|
| **UX51** | P2 | ens. | À construire | Provenance en mots, pas seulement icônes. | Source ≠ certifié. |
| **UX52** | P2 | ens. | À vérifier | Produit introuvable / pas de caméra : issue. | Le journal reste possible. |
| **UX53** | P2 | 10a | **À vérifier** | Recettes dans Nutrition pour solo et coaché. **Reste :** parcours live. | Utiles sans tableau de macros. |
| **UX54** | P1 | 5 | **Partiel** | Solo live : « visible seulement par toi ». **Reste :** coaché + 360. | Audience connue avant upload. |
| **UX104** | P2 | 15d | **À vérifier** | Modal date, pas seulement hier. **Reste :** parcours live. | Le lundi peut reprendre le samedi. |
| **UX105** | P2 | 15e | **À vérifier** | `/scanner?date=&category=` depuis le journal. **Reste :** parcours live. | Le scan tombe dans le bon repas / jour. |
| **UX106** | P2 | 15f | **À vérifier** | Conversion HEIC avant upload (photos, avatar, produit). **Reste :** parcours iPhone. | Pas un mur « choisis JPEG ». |

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
| **UX62** | P1 | chaque | Partiel | Dans chaque lot. OverflowMenu : Échap + focus (Git 10g). | Parcours essentiels sans souris, zoom 200 %. |
| **UX63** | P1 | 3+6 | **À vérifier** | Programmes : erreur conserve la liste. Stats / progression : erreur + réessai, pas un vide fantôme. **Reste :** parcours live. | Données déjà là conservées + réessai. |
| **UX64** | P2 | ens. | À construire | Permission au bon moment ; rappel = objet encore vrai. | Pas de relance d’une tâche finie. |
| **UX65** | P2 | 10f | **À vérifier** | Progression : unité du profil. FR/EN clés ≠ UI encore ailleurs. Fuseau lisible. | Changer d’unité ne change pas la donnée. |
| **UX66** | P2 | ens. | À construire | Audience, export éventuel, delete, liens. | Contrôle sans écrire au support. |
| **UX67** | P2 | ens. | À concevoir | Aide contextuelle. | Pas de dump de parcours. |
| **UX68** | P1 | ens. | À vérifier | Stabilité chargement ; pas de double submit. | Action prise en compte tout de suite. |
| **UX69** | P3 | rep. | Reporté | Raccourcis Accueil seulement si la nav par défaut échoue. | Test comparatif. |
| **UX70** | P2 | cont. | Continu | Mesurer réussite de tâche, pas le temps passé. | Sans contenu de messages / photos. |
| **UX112** | P3 | ens. | À concevoir | **Après 16.** Apple Health / Garmin / etc. Aujourd’hui : saisie manuelle, pas de `/health`. | Un chantier capteurs dédié ; pas dans 14–16. |

### Structure et agents (ARCH)

IDs **ARCH**, distincts d’UX. Diagnostic : [`AUDIT_ARCHITECTURE.md`](AUDIT_ARCHITECTURE.md). File : lots **17–23**.

| ID | P | File | Statut | Travail restant | Critère de fin |
|---|---|---|---|---|---|
| **ARCH01** | P2 | 17+20 | **Terminé** (17a + 20) | Matrice + domaines dans `features/*/domain`. | Un agent sait où créer un fichier sans explorer le repo. |
| **ARCH02** | P2 | 18 | **Terminé** | Dossiers + alias + déplacements évidents + réexports. | Les cas **évidents** sont au bon endroit. Pas tout `lib` d’un coup. |
| **ARCH03** | P2 | 21a | **Terminé** | `App.tsx` assembleur ; routes / gardes / session extraits. | Une PR onboarding et une PR router ne se marchent plus dessus. |
| **ARCH04** | P2 | 21b–c | **21b Terminé** ; 21c à construire | Fetch hors écrans. Reste : `coachingStore` + façade. | Façade store ; composants = écran, pas mini-app. |
| **ARCH05** | P2 | 17+23 | À construire | `Dashboard` (et d’autres) : `supabase.from` dans l’UI. | Composant → hook/model → API → Supabase. CI refuse l’inverse. |
| **ARCH06** | P2 | 19 | **Terminé** | Primitives listées = tokens. Écrans métier encore `blue-600` (hors lot). | `<Button variant="primary">` = tokens. Pas deux systèmes dans les primitives. |
| **ARCH07** | P2 | 22a | À construire | `types.ts` ~26 KB hotspot. | Transversal / domaine + réexport de transition. |
| **ARCH08** | P2 | 22b | À construire | `fr.ts` / `en.ts` ~90 KB. | Un agent nutrition ne touche plus un fichier de 100 KB. |
| **ARCH09** | P1 | 17 | **Terminé** | Découverte `src/**/*.test.ts` ; nom `prometheus-tracker-app` ; rename `auditLot*` / `uxPremium`. | Un `.test.ts` est lancé sans éditer `package.json`. |
| **ARCH10** | P2 | 23 | À construire | Pas de frontières ESLint. Audit source **faux** sur `strict: false`. | Règles `shared`/`features`/`ui`. **Pas** de bang TS extra (`strict` déjà true). |
| **ARCH11** | P1 | — | **Terminé** (ne pas toucher) | 2 migrations ping identiques dans le lock. | Historique appliqué immuable. |
| **ARCH12** | P2 | 17d | **Terminé** | `.env` local ; `.env.example` placeholders ; `.env.production` = clés publiques frontend seulement. | Une convention. Pas de `service_role` dans Git. |

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
| Logger plat sur séance programmée (`hevySimple`) | Non une fois lot 14. Types + groupes viennent du plan. Coaché : pas d’exo hors plan. |
| Refactor `app`/`features`/`shared` pendant 11–16 | Non. File 17–23 après 16. Lot 17 hygiène seulement si un test nouveau. |
| Une PR architecture + comportement | Non. Structure pure, un domaine. |
| Split `coachingStore` sans façade | Non. Lot 21c. |

---

## Preuves de parcours (quand un lot se clôt)

Comptes de test, pas la CI seule. **Joué 15 sept.** (comptes jetables, puis supprimés) : séance 1 cochée + 1 non cochée (bilan, recap, 360) ; dual-rôle Personnel N=0 et N>0. Lots 2–3 : SQL prod lu le 15 sept. Lots 3–7 : parcours live encore dus. Lot 4 : parcours invite encore dû.

| Rôle | Scénario | Observer |
|---|---|---|
| Solo / coaché | Séance : 1 série cochée, 1 préremplie non cochée, Terminer | **Joué.** Bilan / recap / 360 : **une** série réalisée. Graphe `/exercise-progress` : même agrégateur, pas un écran dédié rejoué. |
| Coach dual-rôle | Personnel → Profil → Mode coach OFF avec clients actifs | **Joué (UI).** N>0 : refus chiffré, « Voir mes clients », pas d’RPC, roster intact. N=0 : désactive. Apply prod SQL encore dû. |
| Coaché | Invite → questionnaire incomplet | Code Git : Aujourd’hui / messages / compte plus prison. Bannière + `/questionnaire`. **Reste :** parcours live. |
| Solo | Photos | Code Git : aucun « ton coach voit » en solo. **Reste :** parcours live. |
| Coaché / solo | Deux séances le même jour dans le calendrier | Code Git : les deux listées. **Reste :** parcours live. |
| Coach / coaché | Texte dans un fil, changer de conversation, revenir | Code Git : brouillon intact ; dismiss Accueil ≠ lu. **Reste :** parcours live. |
| Coaché | Entraînement sans éditer le plan | « Mon programme » lecture ; courbes d’exo **après** vérité des séries |
| Coach | File : deux signaux, Passer | Un seul écarté ; ancienneté visible |
| Coach | Assigner un programme depuis la bibliothèque | Recap nom + destinataire + date avant confirm. Pas de premier client auto. |
| Coach / solo | Enregistrer un programme (nom + un jour) | Une écriture ; échec = rien changé. Liste encore là si le chargement rate. |
| Coach → client | Jour avec squat + développé en **superset**, et un développé avec **drop** 100→80→60 | Builder : les 2 exos liés ; drop = 3 charges / 1 série. Logger client : tour A puis B ; une coche drop avec 3 poids. Pas une séance « tout en working ». |
| Tous | Petit écran, clavier, FR/EN, zoom | Lot concerné toujours faisable |

Références a11y : [formulaires multi-pages W3C](https://www.w3.org/WAI/tutorials/forms/multi-page/), [cibles WCAG 2.2](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html), [messages de statut](https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html).
