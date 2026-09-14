# Rapport UX — Fonctionnalités Prometheus

> **Rôle** — inventaire des fonctionnalités **livrées côté client** et diagnostic d’usage pour les trois situations : athlète coaché, athlète solo, coach. Ce n’est ni la vision (`VISION.md`), ni le backlog (`CHANTIER.md`), ni l’audit de chrome (`AUDIT_NAVIGATION_UX.md`).
>
> **Preuve** : revue du code sur `new-JV` au 14 septembre 2026 (routes, `navConfig`, dashboards, gates, stores). Complétée par les parcours authentifiés déjà joués sur les comptes d’audit (Camille / Thomas / Julie / Léa). Ce document décrit l’app **telle qu’elle est**, puis ce qu’il faudrait changer.
>
> **Instruction agents** : ne pas transformer ces recommandations en tickets dans `CHANTIER.md` sans décision produit. Ne pas défaire les décisions déjà prises : cinq onglets, Copilote hors tab bar, switcher Personnel/Coaching uniquement dans Profil, FAB hors espace Coaching, `TrackingGate` (module off = disparu).

---

## Verdict

Prometheus a **un moteur commun solide** et **trois expériences quotidiennes encore inégales**.

Ce qui est déjà juste : un compte, des données personnelles qui appartiennent à l’utilisateur, un suivi individualisé (modules allumés ou éteints), une IA qui prépare sans appliquer, une file coach centrée sur la prochaine décision, un accueil athlète qui tend vers *un verbe*.

Ce qui casse l’usage : la **profondeur arrive trop tôt** (murs d’entrée, proposition de programme en plein écran sur Aujourd’hui, fiche 360 trop dense, builder questionnaire brut) ; la **même chose n’a pas le même nom ni le même endroit** selon le rôle, l’espace et la largeur d’écran ; le coaché **n’a pas accès à sa propre progression** alors que la vision dit que l’histoire suit le compte.

La direction à tenir : **même moteur, trois surfaces quotidiennes**. La profondeur reste disponible **à un tap**, jamais comme un mur sur l’accueil. L’app doit servir le client coaché, le solo et le coach **sans trois produits séparés**, et sans diluer ce qui fait la valeur (programme vivant, suivi convenu, copilote sous contrôle humain).

---

## Comment lire ce rapport

Pour chaque fonctionnalité :

| Rubrique | Sens |
|---|---|
| **Quoi** | Ce que l’utilisateur peut réellement faire aujourd’hui (route, droits lecture/écriture) |
| **Marche** | Contrat déjà tenu, à ne pas casser |
| **Ne va pas** | Friction, incohérence, ou contradiction avec la promesse |
| **Changer** | Comment simplifier **sans retirer la profondeur** |

Gravité utilisée ensuite :

- **P0** — casse le modèle mental ou trahit la promesse (données, autorité, « où est ma prochaine action »)
- **P1** — friction quotidienne d’un parcours essentiel
- **P2** — qualité, jargon, densité, découverte tardive

---

## 1. Un moteur, trois jobs

| Situation | Job du jour | Autorité | Accueil cible |
|---|---|---|---|
| **Coaché** | Faire ce qui est convenu avec le coach | Coach pour le plan ; client pour ses saisies | *Démarrer la séance* / *Envoyer le check-in* / *Lire le message* |
| **Solo** | S’entraîner, logger, comprendre, adapter | L’athlète | *Reprendre / commencer* ; l’IA propose, il valide |
| **Coach** | Traiter le prochain client utile | Coach | *Traiter cette carte* puis le suivant |

Les quatre situations réelles du code (`navPersona`) :

1. Solo — workspace Personnel, pas de coach
2. Coaché — workspace Personnel, lien actif
3. Coach — workspace Coaching
4. Dual-rôle — capacité coach + outils personnels, switcher **dans Profil seulement**

Un coach qui s’entraîne n’est pas « un client de lui-même ». Un coaché n’est pas un solo amputé. Un solo n’est pas un coaché sans messages.

---

## 2. Transversal — compte, chrome, portes

### 2.1 Authentification

| | |
|---|---|
| **Quoi** | `/auth` login / inscription / mot de passe oublié. Inscription ouverte. Rôle **après** le compte (intention) ou via invitation. Reset `/reset-password`. |
| **Marche** | Connexion directe possible. Une invitation n’est **jamais** auto-acceptée après login. Consentement versionné sur `/invite/:token`. |
| **Ne va pas** | Habitué : l’intention n’est demandée qu’une fois, OK ; en revanche le **premier run** empile encore plusieurs murs (intention → questionnaire ou intake → onboarding). OAuth Google/Apple non exposés (volontaire pour l’instant). |
| **Changer** | Garder login immédiat. Pour un *nouveau* compte : une intention, puis **une** première action utile — pas trois questionnaires d’affilée. Reprise si on quitte au milieu. |

### 2.2 Intention d’entrée

| | |
|---|---|
| **Quoi** | `EntryIntentionPage` : « Je me gère seul » → `/dashboard` ; « Trouver un coach » → `/coaches` ; « Je suis coach » → `/dashboard` (espace Coaching, onboarding perso sauté). |
| **Marche** | Trois portes claires. Invitation et client déjà coaché **sautent** l’intention. Retour de coaching (`coach_link_ended_at`) ne relance pas le first-run. |
| **Ne va pas** | « Trouver un coach » saute l’intake kiné **et** l’onboarding tracker : un chercheur peut arriver à l’annuaire sans jamais avoir un espace solo utilisable le jour où aucun coach ne convient. |
| **Changer** | Chercheur = solo **en attente de relation**, pas un quatrième rôle. L’annuaire est un magasin ; l’accueil reste « m’entraîner aujourd’hui » avec un accès discret « trouver un coach ». |

### 2.3 Invitation directe

| | |
|---|---|
| **Quoi** | `/invite/:token` : aperçu du coach, scopes de consentement, case à cocher, Accepter / Annuler. Erreurs : expiré, déjà utilisé, déjà coaché, mauvais compte. |
| **Marche** | Consentement explicite. Token conservé pendant auth. |
| **Ne va pas** | Après acceptation : **mur questionnaire coach** (si assigné et incomplet) **puis** éventuellement intake kiné. Le client a dit oui au coach, pas à trois dossiers médicaux d’affilée avant de voir « Aujourd’hui ». |
| **Changer** | Ordre : relation active → **Aujourd’hui** (état « en préparation ») → questionnaire **quand le coach l’ouvre**, pas un lock global de l’app. L’intake kiné n’est pas un second onboarding si le coach pose déjà les questions utiles. |

### 2.4 Intake kinésiologie (7 écrans)

| | |
|---|---|
| **Quoi** | `KinesiologyIntakeFlow`. Forcé pour un solo sans historique. Pour un coaché : forcé si probe d’usage OK et intake vide ; **sans** écran cibles macros. Revisite `/intake` avec sortie. |
| **Marche** | Barre de progression. Cibles nutrition **calculées pour le solo** à la fin (Mifflin / ISSN) — premier « copilote » honnête. Coaché : pas de cibles self-serve (le coach les enverra). |
| **Ne va pas** | Sept écrans **avant** la première séance, alors que le solo a besoin d’un CTA « première séance ». Empilé avec onboarding tracker si l’intake n’écrit pas `onboarding_completed` (en pratique l’intake solo le fait — à ne pas casser). |
| **Changer** | Solo : garder la sécurité médicale, mais **3 questions maintenant**, le reste au moment utile (première nutrition, premier check-in). Ne jamais reposer ce que le questionnaire coach a déjà. |

### 2.5 Onboarding tracker

| | |
|---|---|
| **Quoi** | `OnboardingFlow` 7 étapes. Sauté si coach, intention `find_coach`, client coaché (différé), ou intake solo déjà complété. |
| **Marche** | Le solo n’enchaîne pas intake **et** onboarding si l’intake a bien marqué `onboarding_completed`. |
| **Ne va pas** | Deux systèmes d’onboarding coexistent dans le code. Un agent ou une régression peut les réempiler. |
| **Changer** | Un seul first-run personnel. L’intake est l’onboarding solo. Retirer ou fusionner `OnboardingFlow` dès que l’intake couvre les champs encore utiles. |

### 2.6 Questionnaire de prise en charge (côté client)

| | |
|---|---|
| **Quoi** | `ClientQuestionnairePanel`. Si réponse assignée sans `completed_at` : **toute navigation** = ce formulaire (`path="*"`). |
| **Marche** | Enregistrer / Soumettre. Versionné côté coach. Distinct du questionnaire *recherche* marketplace (celui-ci n’existe pas encore comme parcours dédié). |
| **Ne va pas** | **Mur total.** Messages, programme, séance : inaccessibles. Contredit « l’app soutient la relation » et « un questionnaire ne bloque pas l’historique ». |
| **Changer** | Bannière persistante + CTA, pas un lock. Le coach voit « questionnaire incomplet » dans la file. Le client peut quand même **lire** un message et **voir** Aujourd’hui. |

### 2.7 Chrome : 5 onglets, FAB, espaces

| | |
|---|---|
| **Quoi** | `navConfig` unique. Mobile 5 destinations. Desktop = les mêmes **groupées** + outils rares. FAB bleu : workspace Personnel seulement ; masqué Coaching, marketplace, `/messages`, `/checkin`. Copilote hors tab bar. Switcher uniquement Profil. |
| **Marche** | Discipline des 5 onglets. `TrackingGate` : module off = disparu, pas un écran cassé. Photos hors tab bar coaché (check-in quotidien vs photos hebdo). |
| **Ne va pas** | Mobile et desktop n’enseignent **pas** la même carte (programme, stats, photos, marketplace). `PageTransition` mélange encore des index d’onglets coach et athlète. Recettes / scanner / séance hors `AppLayout` (pas de BottomNav). Même URL `/dashboard` pour deux produits. |
| **Changer** | Ne **pas** ajouter un 6ᵉ onglet. Enseigner la même carte : ce qui n’est pas dans les 5 onglets se trouve **toujours** au même endroit secondaire (hub Progression pour le solo, Profil pour le compte, « Mon programme » depuis Entraînement). UX77 (SessionShell) : recettes ne sont pas une séance immersive. |

### 2.8 TrackingGate

| | |
|---|---|
| **Quoi** | Modules `workouts` / `checkins` / `nutrition` / `weight`. Solo = tout allumé. Coaché = config coach ; **sans row** = tout éteint (pas de flash tracker complet). |
| **Marche** | Un module désactivé ne produit ni rappel, ni onglet, ni FAB. C’est la bonne analogie « suivi convenu ». |
| **Ne va pas** | Avant setup coach, l’accueil coaché peut être **vide** (waiting_program + rien d’autre). Nutrition/poids hors bottom bar même allumés → découverte via Profil / desktop / FAB. |
| **Changer** | Empty honnête : « Ton coach prépare le suivi » + messages. Ne pas réinventer des onglets. Si nutrition est allumée, un accès mobile **stable** (Profil hub ou lien Depuis Aujourd’hui), pas seulement desktop. |

### 2.9 Langue, unités, PWA, hors ligne

| | |
|---|---|
| **Quoi** | FR/EN via profil. Unités kg/lbs, km/mi, cm/in, RIR. PWA + SW. Push si VAPID. File offline **séances/sets uniquement**. |
| **Marche** | Langue du compte gagne sur l’appareil. États empty/erreur commencent à exister (lots UX 1, 14). |
| **Ne va pas** | Raccourcis du manifeste encore FR. Hors ligne : nutrition, messages, marketplace **non** filés. Accusés de lecture messagerie encore à prouver. |
| **Changer** | Dire « enregistré sur cet appareil » vs « synchronisé ». Ne pas promettre WhatsApp. Priorité : ne pas perdre une série, un message, un check-in. |

### 2.10 Départ de relation

| | |
|---|---|
| **Quoi** | Coach : retirer un client (`end_coach_client_link`). Client : panneau Profil → `client_end_coach_link` (code + migration + tests). Historique personnel conservé, tracking retiré, programme en pause. |
| **Marche** | Même transition solo des deux côtés. Pas d’auto-lien. Confirmation avant départ. |
| **Ne va pas** | `CHANTIER` M2a encore « à construire » (preuve prod, notif coach, sérialisation vs adaptation en cours). L’UI de départ est **enterrée** dans Profil, ce qui est acceptable ; le résumé « ce qui reste / ce qui s’arrête » peut encore être trop technique. |
| **Changer** | Avant confirm : trois listes en langage courant — *tu gardes* (séances, poids, photos) / *ça s’arrête* (messages, plan assigné, partage) / *ça ne part pas chez un autre coach*. Puis accueil solo avec programme en pause, pas un onboarding vide. |

---

## 3. Client coaché

**Chrome mobile** : Aujourd’hui · Entraînement? · Check-in? · Messages · Profil.

**Interdit** (`CoachedAthleteRedirect`) : calendrier, stats, progression exercices, routines, recettes.

**Interdit** (`CoachOnly`) : roster, 360, Prometheus, builder programmes, learned, offre coach.

### 3.1 Aujourd’hui

| | |
|---|---|
| **Quoi** | `Dashboard`. Header + « Coaché par {nom} ». Carte gym du **jour de programme** (Démarrer / Continuer) **sans** « modifier le plan ». Message non lu → `/messages`. Strip check-in. Un seul reminder (poids possible ; deload/repas/eau **masqués**). Pas de revue hebdo solo, pas de streak, pas d’édition de programme. Anneaux nutrition **seulement** si le coach a envoyé des cibles. |
| **Marche** | Un verbe principal quand un jour de programme existe. Accountability = coach, pas la gamification solo. Modules off = cartes absentes. |
| **Ne va pas** | Si pas de programme : `waiting_program` sans issue claire (écrire au coach ? attendre ?). FAB « nouvelle séance » peut lancer une **séance libre** à côté du plan assigné. Accueil encore capable d’empiler message + check-in + reminder + anneaux. |
| **Changer** | **Une** carte hero. Le reste = une ligne. Empty : « Programme en préparation — tu peux écrire à {coach} ». FAB coaché : **pas** « séance libre » si un jour de programme est dû ; ou libellé « séance hors programme » avec confirmation. |

### 3.2 Séance (gym floor)

| | |
|---|---|
| **Quoi** | `/workout` historique + gym card. `/workout/new` et `/:id` immersifs (`FullPageLayout`). Check série, repos 90s manuel, session programme simplifiée, empty session → suppression à la sortie, finish incomplet → confirmation (ne coche plus tout). Résumé : « ton coach verra » + auto-fermeture **30 s**. |
| **Marche** | Moteur commun (pas un second logger coaché). Terminer ≠ tout cocher (UX12 corrigé en code). Hors ligne séances. |
| **Ne va pas** | Résumé qui se ferme tout seul (UX17). Séance immersive **sans** BottomNav : sortie pas toujours évidente. FAB / « Nouveau » = séance libre vs jour prescrit : le coaché peut croire qu’il suit le plan. Tips du résumé encore un peu moralisateurs (séance courte / volume). |
| **Changer** | Résumé sous contrôle (bouton, retrouvable dans l’historique). Distinguer visuellement *séance du programme* et *séance libre*. Repos auto **optionnel** après une série **confirmée**. Profondeur (RIR, historique 1RM, suggestions) derrière la série, pas au-dessus du check. |

### 3.3 Mon programme (lecture)

| | |
|---|---|
| **Quoi** | `/programs` → `ClientProgramPage` lecture : nom, semaine, jour du jour, jours d’entraînement, archives. Pas d’éditeur. Mobile : **pas** dans la tab bar ; desktop « Mon programme » ; raccourci Profil. |
| **Marche** | Le coaché ne peut pas réécrire le plan du coach. Empty « pas encore assigné ». |
| **Ne va pas** | Introuvable sur téléphone si on ne passe pas par Entraînement / Profil. Pas de « pourquoi ce programme » ni de consignes du coach en tête. Demander un changement = message libre, pas une demande structurée. |
| **Changer** | Lien « Voir la semaine » **depuis la carte gym**. Un tap = semaine ; un second = détail d’un exercice. « Demander un ajustement » préremplit un message (sans créer un second copilote). |

### 3.4 Check-in

| | |
|---|---|
| **Quoi** | `/checkin`. Cœur : sommeil, qualité, énergie, stress. « Plus de détails » : humeur, faim, fatigue, douleur, adhérence, notes — selon `checkin_vars`. Historique 14 j. Tab mobile si module on. |
| **Marche** | Court par défaut. Champs réellement allumés par le coach. Pas de sous-titre « auto-coaching » solo. |
| **Ne va pas** | Accusé : enregistré ≠ « ton coach a vu ». Boucle fermée absente (à quoi a servi le bilan). Échelles 0–10 sans mots-ancres. |
| **Changer** | Après envoi : « Enregistré — {coach} le verra dans sa file ». Si le coach a répondu ou adapté, le relier. Repères verbaux sur les échelles. Ne pas inventer une date de revue. |

### 3.5 Messages

| | |
|---|---|
| **Quoi** | `/messages` fil 1:1 avec le coach. Badge non-lus. FAB masqué. Plein écran conversation. |
| **Marche** | Canal unique humain. Relances coach = messages éditables, pas d’auto-send. |
| **Ne va pas** | Brouillon par conversation encore fragile. Pas de pièce jointe (séance / photo) dans le fil. « Lu » non prouvé. |
| **Changer** | Fiabiliser le socle (conserver le texte, pas de doublon). Ensuite : lier un message à une séance ou un check-in (résumé, pas un dump). Pas de 6ᵉ onglet. |

### 3.6 Nutrition, scanner, poids, photos

| | |
|---|---|
| **Quoi** | Nutrition / scanner si `track_nutrition` ; **pas** de recettes. Anneaux si cibles coach envoyées. Poids si module. Photos Face/Profil/Dos + compare — **toujours** joignables (desktop + hub Profil), hors tab bar. |
| **Marche** | Recettes coupées : le coaché n’a pas à gérer une cuisine autonome si le suivi alimentaire est un journal convenu. Photos hors tab : bon jugement (hebdo). |
| **Ne va pas** | Sur mobile, nutrition/poids/photos sont **cachés** dans Profil alors que le module est allumé — l’utilisateur croit que « ce n’est pas dans l’app ». Cibles absentes = pas d’anneaux, parfois lu comme « ça ne marche pas ». Qui voit les photos n’est pas assez dit **avant** l’upload. |
| **Changer** | Si le module est on : une ligne sur Aujourd’hui (« Ajouter un repas », « Pesée ») suffit. Audience photos : « visible par {coach} » avant transfert. Profondeur (historique, compare, scanner) à un tap, pas dans l’accueil. |

### 3.7 Progression (trou P0)

| | |
|---|---|
| **Quoi** | **Aucune.** `/stats`, `/calendar`, `/exercise-progress` redirigent silencieusement vers `/dashboard`. Le coach, lui, voit lifts, poids, photos dans le 360. |
| **Marche** | Évite que le coaché édite un plan ou se construise un second cockpit solo. |
| **Ne va pas** | **Contradiction vision** : les données suivent l’athlète. Le coaché a *fait* les séances et ne peut pas *voir* sa courbe. Ça pousse à quitter l’app pour un tableur, ou à se sentir surveillé plutôt qu’acteur. |
| **Changer** | **Lecture seule** de *sa* progression : hub léger (comme le solo) sans routines, sans recettes, sans édition de programme. Même graphes, même calendrier personnel. Le coach reste l’autorité du plan. Ne pas mettre ça dans la tab bar — depuis Profil ou un lien « Ma progression » sous la carte gym. |

### 3.8 Profil, relation, marketplace

| | |
|---|---|
| **Quoi** | Avatar, objectifs (oui en Personnel), unités, langue, notifs, mdp, feedback, delete. Hub : photos, programme, nutrition?, poids?, intake?. Fin de relation. Annuaire + demandes : **demande bloquée** si déjà coaché (`already_coached`) ; on peut retirer une demande pending. |
| **Marche** | Un seul coach actif. Marketplace ne force pas un second lien. |
| **Ne va pas** | Profil = tiroir fourre-tout. Toggle « trouver un autre coach » absent (volontaire tant que lié) mais l’annuaire reste visible : on parcourt sans pouvoir demander — frustration. |
| **Changer** | Profil = compte + relation + préférences. Raccourcis modules **nommés comme dans la nav**. Annuaire : si déjà coaché, expliquer *pourquoi* on ne peut pas demander, et pointer « mettre fin à la relation » plutôt qu’un formulaire qui échoue. |

### 3.9 Copilote coaché

**Inexistant à dessein.** `/prometheus` est `CoachOnly`. Pas de revue hebdo, pas de proposition de programme self-serve.

C’est **correct** : l’IA prépare pour le coach, pas un second coach dans la poche du client. La profondeur pour le coaché, c’est *comprendre le plan* et *demander*, pas *générer*.

---

## 4. Client solo

**Chrome mobile** : Aujourd’hui · Entraînement · Progression · Nutrition? · Profil. Tracking **toujours allumé**.

**Pas d’accès** : outils coach, Ask Prometheus (`/prometheus`), messages coach (pas de fil).

### 4.1 Aujourd’hui

| | |
|---|---|
| **Quoi** | Carte gym si programme actif ; sinon hero **routine** legacy ; sinon CTA première séance. Check-in. Un reminder (deload / repas / eau / poids). **Proposition de programme en carte pleine** (pourquoi, séances, Accepter / Refuser) — mur potentiel. Revue hebdo (paragraphe 14 j.). Anneaux. Pastilles de semaine. Streak. Lien poids. |
| **Marche** | First-run peut se réduire à **un** CTA séance. IA jamais auto-appliquée. Streak / nudges = auto-coaching assumé (retirés chez le coaché). |
| **Ne va pas** | **Proposition de programme = mur** sur l’accueil : on ne voit plus le verbe du jour. Revue hebdo = pavé. Routine vs programme : deux heroes possibles. Programme **absent** de la tab bar. |
| **Changer** | Accueil = verbe (séance). Proposition IA = **une ligne** « Proposition de programme » → `/programs` (détail + accepter là). Revue = 3 chiffres + Accepter/Garder, texte derrière « Pourquoi ». Une seule notion de *plan actif*. |

### 4.2 Séance

Même moteur que le coaché, plus : séance libre naturelle, lien « Mon programme », pas de bandeau « ton coach verra ».

| **Ne va pas** | Recettes/scanner/séance hors chrome. Confusion « Nouveau » vs jour du plan. Tips résumé moralisateurs. |
| **Changer** | Identique gym-floor (résumé volontaire, repos optionnel). Solo : « séance du plan » vs « séance libre » aussi clair que pour le coaché. |

### 4.3 Programme, routines, templates

| | |
|---|---|
| **Quoi** | `/programs` : créer / éditer jours, accepter une proposition, archives RO. `/programs/new` = CoachOnly (éditeur bibliothèque). `/routines` **redirige** vers `/programs`. Le dashboard peut encore proposer une « prochaine routine » stock. |
| **Marche** | Solo édite **son** plan. Proposition = preview + edit avant accept. |
| **Ne va pas** | Trois mots pour un utilisateur : **routine**, **programme**, **séance**. La redirection `/routines` cache le concept au lieu de l’expliquer. Programme introuvable sur mobile. |
| **Changer** | Vocabulaire unique : **Séance** (ce que je fais maintenant) · **Programme** (la semaine / le cycle) · éventuellement **Modèle** plus tard, pas « routine » dans l’UI. Accès programme : depuis Entraînement (déjà un lien) + depuis Progression, **pas** uniquement Profil. Profondeur (semaines, révisions, NL edit) dans l’éditeur, pas sur Home. |

### 4.4 Progression (hub)

| | |
|---|---|
| **Quoi** | Onglet `/exercise-progress` : hub 2×2 Résumé `/stats`, Entraînement, Mesures `/weight`, Historique `/calendar`. 1RM estimé, tendances, graphes. |
| **Marche** | Le solo *complet* de la vision a enfin un onglet « comprendre » — plus besoin de deviner Profil. |
| **Ne va pas** | Stats encore capables d’interpréter un manque de données. Calendrier : plusieurs séances le même jour / fenêtre de dates à vérifier. Desktop duplique (sidebar Comprendre **et** onglet). |
| **Changer** | Hub = porte. Chaque tuile = une question (« Est-ce que je progresse au développé ? ») pas un export Excel. Donnée manquante ≠ 0. Ne pas ajouter Stats comme 6ᵉ tab. |

### 4.5 Nutrition, eau, pas, recettes, scanner

| | |
|---|---|
| **Quoi** | Journal, macros, cibles self-serve, réutiliser un repas, scanner, eau, pas. Recettes CRUD — **île** `FullPageLayout` sans BottomNav. |
| **Marche** | CTA Ajouter. Scanner : états « recherche » / « introuvable ». Cibles issues de l’intake, pas des 150/250/65 magiques. |
| **Ne va pas** | Recettes = session orpheline. Provenance des aliments = icônes plus que mots. Pas de mode « je veux juste manger » vs bodybuilding tracker. |
| **Changer** | Recettes **dans** le chrome (retour Nutrition). Profondeur (recette, scan, fiche produit) à un tap. Accueil nutrition = « Ajouter » + anneaux, pas la base alimentaire. |

### 4.6 Check-in, poids, photos

Hors 5 tabs (sauf poids via hub Progression). Check-in via bandeau Aujourd’hui + SideNav. Photos via SoloHub.

| **Ne va pas** | Trop d’endroits. Check-in solo a **tous** les champs possibles (pas le sous-ensemble coach) — long si on n’ouvre pas « plus de détails » (le cœur existe, à garder). |
| **Changer** | Même pattern coaché : cœur court, détails à la demande. Photos : audience = **toi** (solo) ; le dire. Poids déjà dans Progression : bien. |

### 4.7 Copilote solo

| | |
|---|---|
| **Quoi** | **Pas** `/prometheus`. Cartes : proposition de programme (draft `onboarding_plan` / `program_nl_edit`) et revue hebdo nutrition. Intake = premières cibles. Rien d’auto-appliqué. |
| **Marche** | « L’IA prépare, l’humain décide » est tenu. Pas un chat qui se prend pour un coach. |
| **Ne va pas** | L’utilisateur cherche un « Copilote » / chat. Il trouve un pavé et un mur. La revue est un paragraphe (`whitespace-pre-line`). |
| **Changer** | Aide **contextuelle** : sur le programme « Adapter », sur une séance « Expliquer cet exo ». Toujours : changement / pourquoi / accepter-modifier-refuser. Pas d’onglet Copilote. Pas de Prometheus copié-collé du coach. |

### 4.8 Marketplace (solo)

Accès discret : SoloHub + SideNav muted. Intention `find_coach` ouvre `/coaches` **avant** intake.

| **Changer** | Magasin = magasin. Un solo qui n’a pas demandé un coach ne voit pas l’annuaire en primaire. Empty directory honnête. Pendant la recherche, **Aujourd’hui reste utilisable**. |

### 4.9 Profil / SoloHub

SoloHub mobile : Recettes · Photos · Annuaire · Demandes. Toggle « passer coach ».

| **Ne va pas** | Profil reste un tiroir « Explorer » alors que Progression existe. Recettes n’ont rien à faire à côté de « supprimer mon compte ». |
| **Changer** | Profil = moi, préférences, compte, **éventuellement** « Trouver un coach ». Recettes → Nutrition. Photos → Progression. |

---

## 5. Coach (espace Coaching)

**Chrome mobile** : Aujourd’hui · Clients · Messages · Programmes · Profil.

**FAB masqué.** Copilote = sidebar desktop + ⌘K, pas un onglet.

**Tracker personnel** : `CoachTrackerRedirect` si pas d’outils personnels. Dual-rôle : switcher Profil → Personnel = solo.

### 5.1 Aujourd’hui — file du jour

| | |
|---|---|
| **Quoi** | `CoachDashboard` + `CoachTodayQueue`. Empty : « premier client » + créer un lien d’invite. Avec roster : cartes groupées par client, sévérité, CTA (ouvrir, relancer **sans** auto-send, configurer, brouillon). Actualiser les priorités (fleet déterministe). Raccourci Ask. |
| **Marche** | Centre de **décisions**, pas un CRM de tuiles. Rien d’auto-appliqué. Relance = compose. Drafts **pas** une 3ᵉ inbox ici (règle : drafts dans Messages). |
| **Ne va pas** | Kinds snake_case sous le capot ; l’UI dépend d’i18n — encore du jargon possible (fleet, ops, Second). Urgence = couleur plus que « depuis quand / quoi de neuf ». Densité si beaucoup de clients. |
| **Changer** | Chaque carte : **pourquoi** · **depuis quand** · **une** action. Dédupliquer deux alertes de la même situation. « Actualiser » en français, pas fleet. Profondeur = ouvrir le 360, pas tout coller sur Today. |

### 5.2 Clients (roster)

| | |
|---|---|
| **Quoi** | Liste triée (attention / setup d’abord). Badges onboarding, setup, médical. Meta objectif / kcal / programme. Invite (durée, usages, copier, révoquer). Retirer un client. Filtre Ask `?filter=`. |
| **Marche** | Setup forcé visible. Pas d’assignation « premier client de la liste » depuis la bibliothèque (corrigé). |
| **Ne va pas** | Filtres Ask peu éditables à la main. Contexte (recherche, client ouvert) à préserver au retour (UX09). |
| **Changer** | Filtres visibles et effaçables. Retour à **la même** liste après une fiche. Profondeur médicale = badge, pas un roman. |

### 5.3 Client 360

| | |
|---|---|
| **Quoi** | Onglets : overview, profile, training, progress, checkins, health, notes — filtrés par `visible_tabs`. Header Message. « Depuis ta dernière visite ». 1 reco max. Setup, intervention, Ask scopé, retirer le lien. |
| **Marche** | Lot 6 : dossier derrière détails, reco limitée. Realtime dossier. Notes privées **coach**. |
| **Ne va pas** | Encore un dossier clinique. Overview peut empiler intake + questionnaire + timeline + KPIs. Onglet « health » = recovery check-in, **pas** Apple Health — nom trompeur. |
| **Changer** | Vue par défaut = **ce qui a changé** + prochain geste. Le reste en sections. Renommer health → Récupération. Profondeur (tout l’historique) à un tap, pour le client *en cours*, pas pour tous. |

### 5.4 Setup wizard (4 étapes)

| | |
|---|---|
| **Quoi** | Comprendre → Suivi → Prise en charge → Vérifier. Modules + variables. Cibles garder/ISSN. Programme pick / draft IA. Résumé « X recevra ». Confirm = `applyIntervention`, rien d’auto. |
| **Marche** | Meilleur contrat coach de l’app. Le client ne « flash » plus un tracker complet avant setup (`ALL_OFF`). |
| **Ne va pas** | Aperçu réel des **écrans client** encore faible. Mapping questionnaire « Avancé » — bien caché, mais l’étape Comprendre peut être longue. |
| **Changer** | Étape Suivi : prévisualiser ce que Thomas verra (onglets + champs). Par défaut **court**. Profondeur variables derrière « Personnaliser ». |

### 5.5 Interventions / brouillons

| | |
|---|---|
| **Quoi** | Kinds : onboarding, calories, programme, adhérence, keep_in_touch, ask_prometheus, NL edit… Page draft : observation / pourquoi / avant-après / message. Envoyer, Relancer, Garder, Note, Écarter. Claim/release. |
| **Marche** | Humain dans la boucle. Comparer avant/après. Inbox Messages a une section « À traiter ». |
| **Ne va pas** | Trois boîtes mentales : **Messages** · **Brouillons** · **Prometheus**. Un coach se demande où cliquer. Libellés kinds techniques. |
| **Changer** | Une règle dite à l’écran : *Today = qui traiter* · *Messages = parler + brouillons à envoyer* · *Prometheus = poser une question*. Boutons d’effet explicites (message seul vs changer le plan). |

### 5.6 Messages coach

Inbox : À traiter + conversations. Thread `/messages/:clientId`. Relances templates (réglages).

Même dette fiabilité que le client. Plus : bascule client trop facile à perdre le brouillon.

### 5.7 Ask Prometheus

| | |
|---|---|
| **Quoi** | `/prometheus`. Question → filtre roster **ou** brouillon agent. ⌘K desktop. Contextuel depuis un lift / un client. |
| **Marche** | Hors tab bar. Ne remplace pas la file. Pas d’auto-apply. |
| **Ne va pas** | Filtres issus du NL peu visibles comme filtres. « Envoyer » peut sembler chat alors que ça crée un draft programme. Cible client parfois implicite. |
| **Changer** | Toujours montrer **qui** + **quel effet** (réponse / filtre / brouillon). Quittable pendant une génération. Pas d’onglet mobile. |

### 5.8 Programmes (bibliothèque + assign)

| | |
|---|---|
| **Quoi** | Liste, créer, éditeur, assigner (client + date, **sans** premier client auto), supprimer, routines = templates. NL « Demander à Prometheus » dans l’éditeur. Assign aussi via setup / intervention. |
| **Marche** | Un moteur. Athlète exécute un snapshot. Révisions existent côté data. |
| **Ne va pas** | Brouillon vs enregistré vs **actif chez le client** encore trop interne. Routines vs programmes : même confusion que solo, côté coach. Historique visuel des révisions à construire (chantier transversal). |
| **Changer** | Trois états **lisibles** : brouillon · enregistré · publié/assigné. Assign = récap destinataire / date / remplacement. L’athlète voit la séance, le coach voit la structure — déjà la bonne idée (UX22), à pousser dans l’UI. |

### 5.9 Questionnaire builder

| | |
|---|---|
| **Quoi** | `/coach/questionnaire`. Sections, questions FR/EN, types, required/medical, publish, défaut, duplicate, preview. |
| **Marche** | Versionné. Distinct de la recherche marketplace. |
| **Ne va pas** | Builder **brut** (outil interne). Aperçu effort client (nombre d’écrans, obligatoire) faible. Publier une version peut surprendre les clients existants. |
| **Changer** | Commencer par un **modèle court**. Preview mobile + « X questions obligatoires ». Publication : qui recevra un complément, qui garde l’ancienne réponse. |

### 5.10 Learned

| | |
|---|---|
| **Quoi** | `/coach/learned`. Leçons : lire, corriger, réactiver, supprimer. Tours fleet en métadonnées. |
| **Marche** | Sans cron/round/seen dans l’UI récente. Correction possible. |
| **Ne va pas** | Mot « learned » / « ce que Prometheus a appris » encore abstrait. Lien depuis réglages, pas le quotidien. |
| **Changer** | « Préférences que Prometheus utilise ». Une ligne humaine + désactiver. Pas dans la tab bar. |

### 5.11 Fleet round

Déterministe, manuel, jamais d’auto-apply. Produit des **brouillons**.

| **Changer** | Bouton « Recalculer les priorités ». Expliquer : *aucun message n’est envoyé*. |

### 5.12 Invites, réglages, marketplace coach

Invites : empty Today + roster. Réglages : onglets 360, tracking défaut, templates relance, timezone, cutoff séance manquée, questionnaire, learned.

Offre `/coach/profile` : opt-in, `accepting_clients`, pas de faux prix (`priceOnRequest`). Demandes `/coaching-requests`. Un coach peut **ne pas** publier et quand même inviter.

| **Ne va pas** | Billing fermé : « accepter une demande » ≠ paiement ≠ parfois ≠ lien selon M6 — à dire **très** clairement. Profil offre vs Profil compte : deux « profils ». |
| **Changer** | Vocabulaire : **Compte** vs **Offre publique**. Demande acceptée : état réel (lien créé ou pas) en une phrase. Pas de prix inventé — déjà. |

### 5.13 Espace Personnel du coach

Le coach dual-rôle retrouve le tracker solo. C’est la bonne architecture.

| **Ne va pas** | Même `/dashboard`. Si on oublie l’espace, on traite des clients ou on log une séance par erreur. |
| **Changer** | Marque d’espace **visible** (mot, pas seulement le switcher Profil) : « Coaching » vs « Mon entraînement ». Pas de switcher dans la tab bar. |

---

## 6. Marketplace (les trois personae)

**Livré en code** : `/coaches`, `/:id`, compare (2–3), `/coaching-requests`, `/coach/profile`. Filtres exacts discipline / langue / format. Profils opt-in. Demandes pending/accepted/declined/withdrawn. Coaché : nouvelle demande bloquée.

**Pas livré / fermé** : billing, matching riche (indispensables vs préférences expliquées), questionnaire *recherche* distinct, modération / signalement, avis, OAuth, wearables.

**Écart docs** : `CARTE_PRODUIT` et lots M4–M5 du `CHANTIER` parlent encore d’annuaire absent ; le **lot UX 9** est marqué terminé. L’expérience vitrine existe ; la **preuve prod + activation relation** n’est pas le même lot.

| **Marche** | Accès discret (pas d’onglet). Pas de faux prix. Choix mutuel, pas d’Uber magique. |
| **Ne va pas** | Matching = intersection de filtres, pas une explication. Chercheur sans intake = accueil perso faible. Acceptation sans paiement : OK tant que dit. |
| **Changer** | Garder la vitrine simple. Expliquer compatibilité en puces (« langue, remote, force ») sans % inventé. Empty honnête. Billing **plus tard**. |

---

## 7. Matrice de cohérence

Même concept, trois bouches :

| Concept | Coaché | Solo | Coach | Problème |
|---|---|---|---|---|
| Accueil | Aujourd’hui | Aujourd’hui | Aujourd’hui (file) | Même URL, deux produits |
| Plan | Mon programme (RO, caché mobile) | Programme éditable (caché mobile) | Bibliothèque + assign | Mot « routine » zombie |
| Logger | Séance assignée (+ libre via FAB) | Séance libre / plan | N/A en Coaching | FAB libre vs plan |
| Bilan corps | Check-in tab | Bandeau + SideNav | Onglet 360 | Pas le même geste |
| Comprendre | **Bloqué** | Onglet Progression | Onglet progress du client | Coaché aveugle sur *ses* data |
| Parler | Messages tab | — | Messages tab | OK |
| IA | Absente (juste) | Cartes Home trop lourdes | Prometheus + drafts | Solo cherche un chat |
| Nutrition | Module + pas recettes | Journal + recettes île | Cibles envoyées | Découverte mobile |
| Compte | Profil fourre-tout | Profil + SoloHub | Profil + offre + settings | Tiroir |

Règle cible, **un mot partout** : Séance · Programme · Check-in · Message · Progression · Compte. Jamais Accueil *et* Tableau de bord *et* Today pour le même écran athlète.

---

## 8. Ce qui marche — ne pas casser

1. **Un moteur** — `user_id` sur les saisies, RPC séance commune, programmes + snapshots, pas de second logger.
2. **L’espace n’accorde aucun droit** — `accountContext` (capacité / relation / affichage).
3. **Cinq onglets** — discipline rare ; le problème est le *contenu* et le débord, pas le nombre.
4. **TrackingGate** — suivi convenu, pas un tracker culpabilisant.
5. **IA sous contrôle** — fleet déterministe, apply explicite, solo identique (accepter / refuser).
6. **File coach** — décisions, pas un dashboard vanity.
7. **Setup 4 étapes** — le client reçoit un suivi choisi ; `ALL_OFF` avant setup.
8. **Invitation consentie** — jamais d’auto-accept.
9. **Photos hors tab coaché** — check-in quotidien vs photos hebdo.
10. **Copilote hors tab bar** — Prometheus n’est pas le job du matin.
11. **FAB hors Coaching** — le coach n’a pas un « + » de logging client.
12. **Marketplace sans faux prix** et sans 6ᵉ onglet.
13. **Vérité séance** — Terminer ne coche plus les séries (à ne pas réintroduire).
14. **First-run solo à un CTA** — direction bonne si on ne la recouvre pas de la proposition IA.
15. **Données au compte** — départ (code) conserve l’historique ; notes privées coach non transférées.

---

## 9. Ce qui ne va pas — synthèse

### P0 — modèle mental / promesse

| # | Problème | Qui |
|---|---|---|
| 1 | Coaché **sans sa progression** (redirect silencieux) | Coaché vs vision « l’histoire suit » |
| 2 | Accueil solo **muré** par la proposition de programme (carte pleine) | Solo |
| 3 | Questionnaire coach = **lock de toute l’app** | Coaché |
| 4 | Mobile ≠ desktop (programme, photos, stats, marketplace) | Tous |
| 5 | First-run **empilé** (intake + questionnaire + onboarding selon le chemin) | Solo, coaché, chercheur |

### P1 — quotidien

| # | Problème | Qui |
|---|---|---|
| 6 | Empty coaché sans programme / sans tracking : pas d’issue | Coaché |
| 7 | FAB / Nouveau = séance libre alors qu’un jour de plan est dû | Coaché, solo |
| 8 | Résumé séance auto-close 30 s | Tous athlètes |
| 9 | Check-in « enregistré » ≠ « vu par le coach » | Coaché |
| 10 | File coach : urgence peu expliquée, jargon | Coach |
| 11 | 360 encore un dossier, pas « ce qui a changé » | Coach |
| 12 | Trois boîtes Messages / Drafts / Prometheus | Coach |
| 13 | Programme introuvable sur mobile | Solo, coaché |
| 14 | Recettes / scanner hors chrome | Solo |
| 15 | Messagerie : brouillons, lu, reconnexion | Coach + coaché |
| 16 | Dual-rôle : même URL, espace facile à oublier | Coach-athlète |

### P2 — profondeur mal placée / cohérence

| # | Problème | Qui |
|---|---|---|
| 17 | Routine vs programme vs séance | Solo, coach |
| 18 | Revue hebdo en paragraphe | Solo |
| 19 | Builder questionnaire brut | Coach |
| 20 | Learned / fleet / health (= récup) | Coach |
| 21 | Annuaire visible mais demande impossible si lié | Coaché |
| 22 | Matching marketplace pauvre (OK pour vitrine) | Chercheur |
| 23 | Docs chantier en retard vs code (M4–M5, M2a) | Équipe |
| 24 | PageTransition spatiale mensongère | Tous |
| 25 | Wearables absents (onglet health trompeur) | Coach |

---

## 10. Garder la profondeur, cesser de la mettre sur le chemin

Principe unique, trois applications :

> **Aujourd’hui = 1 verbe. La profondeur = 1 tap. Jamais 0 accès, jamais un mur.**

| Couche | Coaché | Solo | Coach |
|---|---|---|---|
| **Verbe** | Démarrer / Check-in / Message | Démarrer la séance | Traiter cette carte |
| **Un tap** | Semaine, progression RO, repas, photos, programme | Programme, stats, recettes, proposition IA | 360 « ce qui a changé », brouillon, Ask |
| **Profondeur** | Historique, compare photos, détail exo, départ | Éditeur, cycles, scan, revue, annuaire | Builder, learned, variables, NL, fleet |

Ce qu’il **ne faut pas** faire pour « simplifier » :

- Retirer le 360, le builder, le scanner, les révisions, le RIR.
- Ajouter un 6ᵉ onglet « tout le reste ».
- Mettre Copilote dans la tab bar.
- Auto-appliquer l’IA.
- Allumer tous les modules d’un coaché « pour qu’il ait la même app que le solo ».
- Construire un second moteur séance.

Ce qu’il **faut** faire :

- **Progressive disclosure** partout (déjà le bon réflexe check-in « plus de détails »).
- **Mots stables** (séance, programme, check-in).
- **Même carte** téléphone / desktop.
- **États honnêtes** (en préparation, enregistré, transmis, pas encore vu).
- **Empty utiles** (écrire au coach, première séance, inviter un client) — jamais un blanc, jamais une fausse tâche.

---

## 11. Changements recommandés (ordre d’usage, pas un second chantier)

Lots **d’expérience**. Les IDs `CHANTIER` déjà ouverts restent la source des statuts. Ici : *quoi changer dans le produit ressenti*.

### Lot A — Vérité et accueil (P0/P1, peu de surface)

1. **Coaché : lecture de sa progression** (stats / calendrier / exercise-progress en RO). Tab bar inchangée ; lien depuis Aujourd’hui ou Profil.
2. **Solo : proposition IA = notice**, détail sur `/programs` (le mur Home est le plus grave défaut solo actuel).
3. **Questionnaire : bannière, pas lock.**
4. **Résumé séance** : plus d’auto-close ; tips factuels, pas de leçon.
5. **Empty waiting_program** + empty pre-setup : message + CTA Messages.
6. **Séance libre vs séance du plan** : libellé et confirmation.

### Lot B — Trouver sans ajouter d’onglets

7. **Mon programme** toujours à un tap depuis Entraînement (les deux athlètes).
8. **Recettes dans le shell** Nutrition (UX77 ciblé recettes, pas toute la séance).
9. **Profil = compte** ; sortir Recettes / Photos / Programme du tiroir.
10. **Marque d’espace** Coaching vs Mon entraînement (couleur/mot), switcher reste dans Profil.
11. **Health → Récupération.** Learned / Actualiser les priorités en français.

### Lot C — Relation quotidienne coach ↔ coaché

12. Check-in : accusé **Enregistré / transmis** ; plus tard « vu » si preuve.
13. File : pourquoi + depuis quand + une action ; dédupliquer.
14. 360 : « depuis ta dernière visite » vraiment en tête (renforcer le lot 6).
15. Setup : preview de ce que le client recevra.
16. Prometheus : cible + type d’effet avant envoi.

### Lot D — Entrée et transitions

17. Un seul first-run personnel ; chercheur = solo + magasin.
18. Invite → Aujourd’hui utilisable, questionnaire demandé, pas un mur.
19. Départ : trois listes *gardes / s’arrête / ne se transmet pas* ; reprise solo sans onboarding.
20. Annuaire si déjà lié : expliquer, ne pas faire échouer un formulaire.

### Plus tard (ne pas mélanger)

- Billing, matching riche, modération, wearables, OAuth, pièces jointes chat, cycles/phases programme, offline élargi.
- Accessibilité parcours complet, parité i18n restante, mesure d’utilité (UX70).

---

## 12. Comment les trois personae se servent mutuellement

L’app n’est pas « trop complexe parce qu’il y a trois rôles ». Elle est difficile quand **un rôle voit les entrailles des deux autres**.

| Si on simplifie pour… | Ne pas… | Faire plutôt… |
|---|---|---|
| **Coaché** | Lui cacher *ses* courbes | Cacher l’édition du plan, pas l’histoire |
| **Solo** | Le pousser vers un coach ou un chat Prometheus | Tracker complet + IA facultative **à côté** de la séance |
| **Coach** | Lui coller le logger perso dans la file | File courte + 360 profond + Personnel séparé |
| **Tous** | Ajouter des destinations | Un verbe, les mêmes mots, la profondeur au tap |

Le coaché **utilise** le moteur solo (séance, nutrition, poids) **bridé** par le suivi convenu. Le solo **utilise** le moteur coach (programme, propositions, cibles) **sans** roster. Le coach **utilise** le même programme et les mêmes saisies **dans une file**. C’est déjà l’architecture. L’UX doit **la faire sentir**, pas la masquer sous des murs et des tiroirs.

---

## 13. Hors périmètre de ce diagnostic

- Ne pas réécrire `VISION.md`.
- Ne pas fusionner les lots M1–M8 ici (identité, billing).
- Ne pas rouvrir : 6ᵉ onglet, Copilote tab, switcher chrome, FAB Coaching, TrackingGate inverse (montrer un module off).
- Wearables : l’onglet 360 « health » n’est pas Apple Health ; le renommer suffit jusqu’à un vrai chantier capteurs.
- Preuve prod des RPC marketplace / départ : `CHANTIER`, pas ce fichier.

---

## 14. Sources code (ancrage)

| Sujet | Fichiers |
|---|---|
| Personae / tabs | `src/navigation/navConfig.ts` |
| Gates / redirects | `src/App.tsx` (`CoachedAthleteRedirect`, `CoachOnly`, `TrackingGate`, `CoachTrackerRedirect`) |
| Accueil athlète | `src/components/dashboard/Dashboard.tsx`, `SoloProgramProposal.tsx`, `SoloWeeklyReview.tsx`, `ClientGymCard.tsx` |
| Accueil coach | `src/components/coaching/CoachDashboard.tsx`, `CoachTodayQueue.tsx` |
| Tracking | `src/lib/clientTracking.ts` |
| Chrome | `src/components/layout/AppLayout.tsx`, `FAB.tsx`, `BottomNav.tsx`, `SideNav.tsx` |
| Relation | `ClientCoachRelationshipPanel.tsx`, `client_end_coach_link` |
| Séance | `WorkoutForm.tsx`, `WorkoutSummaryScreen.tsx` |

Compléments : `docs/VISION.md` (destination), `docs/CARTE_PRODUIT.md` (parcours cibles ; marketplace datée), `docs/AUDIT_NAVIGATION_UX.md` (chrome), `docs/CHANTIER.md` (statuts).
