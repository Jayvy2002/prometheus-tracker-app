# Audit & Plan d'Amélioration — Prometheus Tracker

> Audit réalisé le 1er avril 2026.
> Dernière mise à jour : 2 avril 2026.

---

## Résumé Exécutif

Prometheus est une application de suivi fitness bien architecturée, couvrant l'entraînement, la nutrition, le poids et les métriques de santé. La base technique est solide (React 18, TypeScript, Supabase, Zustand). Les axes d'amélioration les plus impactants concernent : la **rétention utilisateur** (gamification, rappels), la **complétude des flux critiques** (nutrition, workout), l'**analytique avancée**, et l'**expérience mobile**.

---

## Légende

- ✅ **Implémenté**
- 🔴 **Priorité haute — à faire**
- 🟠 **Priorité moyenne — à faire**
- 🟡 **Priorité basse / nice-to-have**

---

## 1. Expérience Utilisateur (UX)

### ✅ 1.1 Navigation & Structure

**Problème :** Certaines pages importantes (`/stats`, `/exercise-progress`) n'apparaissaient pas dans la navigation principale.

**Implémenté :**
- `/stats` intégré dans la BottomNav mobile (remplace Calendar) : Dashboard → Workout → Stats → Nutrition → Profil
- `/stats` et `/exercise-progress` ajoutés dans la SideNav desktop
- Les deux pages déplacées dans `AppLayout` — elles ont maintenant la nav active, la BottomNav mobile et le FAB

---

### 🟠 1.2 Onboarding

**Problème :** Le flux d'onboarding en 5 étapes ne montre pas la valeur immédiate avant que l'utilisateur s'engage à remplir toutes ses données.

**Recommandation :**
- Ajouter un écran de "preview" avant l'onboarding montrant les fonctionnalités clés
- Permettre de passer certaines étapes et les compléter plus tard
- Barre de progression visuelle avec estimation du temps restant ("2 min pour finir")
- Message de bienvenue personnalisé à la fin avec le prénom et les objectifs calculés

---

### 🟠 1.3 Dashboard

**Problème :** Le dashboard peut sembler vide ou peu engageant pour un nouvel utilisateur sans données.

**Recommandation :**
- Empty states guidés : chaque widget sans données suggère une action
- Widget "Aujourd'hui en bref" : résumé top-niveau (calories restantes, poids de la veille)
- Mémoriser la scroll position lors de la navigation retour
- Widget "Objectif hebdomadaire" (ex : 3 séances/semaine → 2/3 cette semaine)

---

### ✅ 1.4 Workout — Formulaire de logging

> ⚠️ Philosophie : Prometheus est une app de **logging**, pas un companion de séance. L'objectif est de capturer fidèlement ce qui s'est passé à la salle, le plus rapidement possible.

**Implémenté :**
- Performances de la dernière séance sur le même exercice affichées directement dans la fiche (poids × reps par série)
- Données chargées au montage via `fetchPreviousSets` dans le workout store

**Implémenté :**
- Label "Session date" visible au-dessus du DateInput pour mieux signaler la possibilité de modifier la date

**Reste à faire :**
- Saisie numérique optimisée : ouvrir le pavé numérique au tap sur un champ poids/reps
- Enregistrement automatique à chaque modification

---

### ✅ 1.5 Nutrition — Logging des repas

**Implémenté :**
- Bouton **"+ Add"** dans le header de la page Nutrition, détection automatique de la catégorie par heure (avant 11h → breakfast, 11h–14h → lunch, 14h–18h → snack, après 18h → dinner)
- Auto-focus sur le champ de recherche à l'ouverture du formulaire
- Recherche intelligente par ranking IA — à vérifier si déjà en place (bolt.new)

**Reste à faire :**
- "Réutiliser le repas d'hier"
- Indicateur visuel de progression calorique sur la page principale

---

### 🟠 1.6 Scanner & Reconnaissance de produits

**Problème :** Le scanner est exclusivement basé sur les codes-barres. Les produits sans code-barres ne peuvent pas être identifiés.

**Recommandation — Reconnaissance produit par image (sans code-barres) :**
- Mode "Photo du produit" : l'utilisateur prend une photo de l'aliment ou de l'emballage
- Image envoyée à GPT-4o Vision (déjà intégré via la edge function `analyze-product`) pour identification
- Recherche automatique dans la base interne, puis Open Food Facts API
- Confirmation par l'utilisateur avant logging, ou pré-remplissage de la fiche si aucun match

> **Note technique :** Open Food Facts est une base publique gratuite (~3M produits), déjà utilisée dans FoodForm.tsx. À réutiliser.

**Recommandation — Robustesse du scanner code-barres :**
- Fallback JavaScript (`zxing-js`) pour les navigateurs non compatibles (Firefox, etc.)
- Saisie manuelle du code-barres dans la même page

---

### ✅ 1.7 Page Calendrier

**Implémenté :**
- Résumé hebdomadaire : 3 compteurs (séances, jours nutritionnels loggés, pesées de la semaine)
- Progression calorique vs objectif avec barre de couleur dans la carte nutrition
- Clic sur la carte nutrition navigue vers `/nutrition` en pré-sélectionnant le bon jour dans le store
- Skeleton loader dans le panel de résumé journalier

**Reste à faire :**
- Vue mois (actuellement uniquement vue semaine)
- Visualisation des streaks sur le calendrier

---

### ✅ 1.8 États vides & Feedback

**Implémenté :**
- Skeleton loaders sur WorkoutPage (remplace "Loading..." basique)
- Skeleton loaders sur NutritionPage (meal sections)
- Skeleton loader dans le résumé journalier du Calendrier

**Implémenté :**
- Toast "Workout saved!" à la fin d'une séance
- Toast "Workout deleted" sur la suppression d'un workout
- Toast "Exercise removed" sur la suppression d'un exercice
- `ToastContainer` ajouté à `FullPageLayout` (WorkoutForm, ScannerPage)

**Reste à faire :**
- Messages d'erreur réseau plus explicites

---

## 2. Fonctionnalités Manquantes ou Incomplètes

### 2.1 🔴 Priorité Haute

#### Notifications & Rappels
L'app n'a aucun système de rappels ou notifications, ce qui est un facteur clé de rétention.

**À implémenter :**
- Rappels configurables : "N'oublie pas ton entraînement" (heure définie par l'utilisateur)
- Rappel de log nutritionnel si aucun repas enregistré après 14h
- Rappel d'hydratation
- Utiliser les **Web Notifications API** + Service Worker

---

#### ✅ Historique des performances par exercice

**Implémenté :**
- `/exercise-progress` intégré dans la navigation principale (SideNav desktop + accessible depuis WorkoutPage)
- Record personnel (PR) all-time affiché sous la valeur de la dernière session
- Badge 🏆 "PR" sur la dernière session si elle égale le record all-time
- Trophée et bordure ambrée dans l'historique pour les sessions record
- Calcul 1RM via formule d'Epley déjà en place

---

### 2.2 🟠 Priorité Moyenne

#### Routines — Améliorations
Les routines sont fonctionnelles mais pourraient être plus puissantes.

**À implémenter :**
- Historique des performances sur chaque routine (tonnage moyen, évolution)
- Planification de routine sur le calendrier (ex : "Lundi : Push, Mercredi : Pull")

---

### 2.3 🟡 Priorité Basse / Nice-to-have

#### Intelligence Artificielle — Coach Virtuel

**À implémenter :**
- Analyse hebdomadaire automatique : résumé de la semaine avec observations
- Suggestions d'ajustement de charge (progressive overload automatiquement détectée)
- Chatbot coach nutritionnel (réutilise l'intégration OpenAI déjà présente)

---

#### Social & Communauté

**À implémenter :**
- Partage d'une séance ou d'un résumé nutritionnel (image générée)
- Défi entre amis
- Leaderboard optionnel (opt-in)

---

#### Plan alimentaire

**À implémenter :**
- Planificateur de repas pour la semaine
- Liste de courses générée automatiquement
- Suggestions de repas selon les objectifs macros restants de la journée

---

## 3. Performance & Technique

### 🟡 3.1 Pagination & virtualisation des listes

**Recommandation :**
- Pagination ou infinite scroll sur : historique des workouts, logs nutritionnels, liste d'aliments
- Virtualisation (`react-window` ou `react-virtual`) pour les longues listes

---

### 🟠 3.2 PWA & Offline

**Recommandation :**
- `manifest.json` pour permettre l'installation sur l'écran d'accueil mobile
- Service Worker avec cache-first pour les assets statiques
- Sync en arrière-plan quand la connexion est rétablie

---

### 🟡 3.3 Optimisation des requêtes Supabase

**Recommandation :**
- Jointures Supabase pour récupérer les données imbriquées en une seule requête
- Cache stale-while-revalidate pour les données de référence

---

### 🟠 3.4 Validation des formulaires

**Recommandation :**
- Librairie de validation (`zod` + `react-hook-form`) pour une validation cohérente
- Messages d'erreur inline sur tous les champs
- Validation en temps réel (au blur)

---

### 🟠 3.5 Sécurité & Authentification

**Recommandation :**
- Vérification email obligatoire (Supabase Auth)
- Authentification sociale (Google, Apple)
- Politique de mot de passe affichée à la création de compte

---

## 4. Accessibilité 🟡

**Recommandation :**
- `aria-label` sur tous les boutons icônes
- Vérification des ratios de contraste sur fond sombre
- Navigation au clavier sur les modales et formulaires
- `aria-live` pour les messages d'état
- Support du mode "Reduce Motion"

---

## 5. Roadmap

| Statut | Amélioration | Impact | Effort |
|--------|-------------|--------|--------|
| ✅ | Performances précédentes inline dans le formulaire workout | UX quotidienne | Faible |
| ✅ | Bouton Quick Add nutrition + auto-focus search | UX quotidienne | Faible |
| ✅ | Skeleton loaders cohérents (Workout, Nutrition, Calendrier) | Qualité perçue | Faible |
| ✅ | Stats & Exercise Progress dans la navigation principale | Découvrabilité | Faible |
| ✅ | Record personnel (PR) + badge sur Exercise Progress | Motivation | Faible |
| ✅ | Calendrier enrichi (résumé hebdo, progression calorique, navigation date) | UX | Faible |
| ✅ | Notifications & rappels — UI + permission + scheduling local | Rétention | Moyen |
| ✅ | Scanner — reconnaissance produit par image sans code-barres | Fonctionnalité clé | Moyen |
| ✅ | Scanner — déduplication par nom pour éviter les doublons | Qualité données | Faible |
| ✅ | PWA (manifest + service worker) | Mobile UX | Moyen |
| ✅ | Logging rétroactif — label "Session date" visible | UX | Faible |
| ✅ | Toasts sur les actions critiques (save, delete workout, remove exercise) | Feedback | Faible |
| ✅ | Dashboard — Widget "Objectif hebdomadaire" (dots Mon–Dim, barre de progression) | Motivation | Faible |
| ✅ | Dashboard — Empty states guidés (Weight, WorkoutVolume) avec CTA | UX nouvel utilisateur | Faible |
| ✅ | Pagination — Load more sur historique workouts, favoris & récents nutrition | Performance | Faible |
| ✅ | Routines — Historique (nb utilisations + dernière date) dans chaque carte | Découvrabilité | Faible |
| 🟠 | Notifications push serveur (VAPID + Supabase cron) | Rétention background | Élevé |
| 🟠 | Validation formulaires (zod + react-hook-form) | Qualité | Moyen |
| 🟠 | Planificateur de repas hebdomadaire | Valeur ajoutée | Élevé |
| 🟡 | Optimisation requêtes Supabase (jointures) | Performance | Faible |
| 🟡 | Coach IA — analyse hebdomadaire | Différenciation | Élevé |
| 🟡 | Social — partage de séances | Acquisition | Élevé |

---

## 6. Ce qui fonctionne bien (à conserver)

- Architecture Zustand bien organisée par domaine
- Dark theme cohérent et moderne
- Animations et transitions fluides
- Barcode scanning natif + fallback image + Open Food Facts déjà intégré
- Calcul automatique BMR/TDEE/macros à l'onboarding
- Système de widgets dashboard personnalisable
- RLS Supabase correctement configuré (sécurité des données)
- Intégration OpenAI pour l'analyse des produits alimentaires (edge function `analyze-product`)

---

## 7. Analyse Logique des Fonctionnalités

> Audit réalisé le 2 avril 2026. Objectif : évaluer la cohérence **produit** de chaque fonctionnalité — est-ce que le flux utilisateur a du sens ? Y a-t-il des incohérences, des angles morts, ou des comportements qui pourraient frustrer l'utilisateur dans un usage quotidien réel ?

---

### 7.1 Workout — Formulaire & Historique

**Ce que l'utilisateur peut faire :**
Créer une séance, ajouter des exercices, loguer des séries (poids, reps, RIR), démarrer un timer, modifier le nom et la date, sauvegarder.

**Problèmes logiques :**

✅ **Les séances passées sont éditables.** Cliquer sur une séance dans l'historique rouvre le WorkoutForm — l'utilisateur peut modifier les séries, les poids, les exercices.

✅ **Suppression de série individuelle.** Un bouton `Trash2` est présent sur chaque `SetRow` dans `ExerciseCard.tsx` et appelle `deleteSet(set.id)` via le workout store.

🟡 **Pas de vue lecture seule d'une séance.** Cliquer sur une séance passée ouvre directement le mode édition — ce qui fonctionne pour relire les données, mais crée une ambiguïté : l'utilisateur qui veut juste consulter sa séance se retrouve en mode "edit" sans l'avoir voulu. Une vue dédiée en lecture seule serait plus claire.

🟡 **Le timer tourne dès la création.** Dès qu'une nouvelle séance est créée, le timer démarre automatiquement. Si l'utilisateur crée une séance puis tarde à commencer, le timer sera faux. Il devrait pouvoir démarrer/mettre en pause manuellement selon sa préférence.

---

### 7.2 Nutrition — Logging & FoodForm

**Ce que l'utilisateur peut faire :**
Logger des repas par catégorie, rechercher des aliments, scanner des codes-barres, voir les macros et calories du jour, naviguer entre les jours passés.

**Problèmes logiques :**

✅ **Les logs nutrition sont éditables.** Un `EditFoodModal` existe et permet de modifier nom, quantité, unité et valeurs nutritionnelles d'un log existant.

✅ **Les macros ont bien une barre de progression vs objectif.** `MacroSummary.tsx` affiche une barre colorée pour chaque macro (protéines, glucides, lipides) avec valeur actuelle / cible tirée du profil.

✅ **Navigation vers les jours passés disponible** directement depuis la page Nutrition.

✅ **Le système de recettes a une page dédiée** (`RecipesPage`) pour créer, modifier et supprimer les recettes.

🟡 **La catégorie de repas est détectée automatiquement par l'heure.** C'est une bonne idée, mais si l'utilisateur logge un repas rétroactivement (hier soir à 21h, saisi ce matin), la catégorie auto-détectée sera "breakfast". Il faudrait détecter la catégorie en fonction de la date/heure du log, pas de l'heure actuelle.

---

### 7.3 Calendrier

**Ce que l'utilisateur peut faire :**
Visualiser l'activité semaine par semaine, cliquer sur un jour pour voir un résumé (séance, nutrition, poids), naviguer vers les détails.

**Problèmes logiques :**

🟠 **Impossible de naviguer vers les jours futurs.** L'utilisateur ne peut pas planifier ou voir les semaines à venir. Même sans planification, bloquer la navigation vers l'avenir est surprenant — si on est jeudi, on ne peut pas voir vendredi.

🟡 **Résumé journalier trop dense.** Toutes les infos (séance, nutrition, poids) sont empilées dans un seul panneau sans hiérarchie claire. Au premier coup d'œil, il est difficile de distinguer "j'ai bien mangé" de "j'ai bien entraîné".

---

### 7.4 Routines

**Ce que l'utilisateur peut faire :**
Créer des templates de séances, les démarrer directement, voir le nombre d'utilisations et la dernière date.

**Problèmes logiques :**

🟠 **Impossible de voir la progression sur une routine.** L'utilisateur sait qu'il a utilisé une routine 8 fois, mais pas si ses charges ont augmenté. L'objectif d'une routine est de progresser — il manque un graphe ou un résumé "Dernière fois : 80kg × 5 / Cette fois : 82.5kg × 5".

🟠 **Modifier une routine n'affecte que les futures séances, mais ce n'est pas indiqué.** Si l'utilisateur modifie une routine (ex : change un exercice), il ne sait pas si ses anciennes séances seront impactées ou non. Il manque une indication claire : "Les séances passées ne seront pas modifiées."

🟡 **Pas d'ordre des exercices modifiable.** Lors de la création ou l'édition d'une routine, si l'utilisateur veut réorganiser l'ordre des exercices, ce n'est pas possible (drag-and-drop absent). Il doit supprimer et re-ajouter.

---

### 7.5 Stats

**Ce que l'utilisateur peut faire :**
Voir des graphiques et statistiques agrégées sur 1 semaine, 1 mois ou 3 mois (calories, macros, poids, workouts).

**Problèmes logiques :**

🟠 **Les stats sont descriptives, jamais prescriptives.** L'utilisateur voit que sa moyenne calorique est de 2100 kcal pour un objectif de 2500 — mais rien ne lui dit "tu es en déficit depuis 2 semaines, est-ce intentionnel ?". Les stats sans interprétation ont une valeur limitée.

🟠 **Pas de comparaison entre périodes.** Il n'est pas possible de comparer "cette semaine vs la semaine dernière" ou "ce mois vs le mois précédent". Le progrès ne se lit qu'en ayant mémorisé les valeurs passées.

🟡 **Le graphe de poids n'apparaît que si 2+ pesées existent.** Un utilisateur qui a pesé une seule fois voit une page vide sans savoir pourquoi. Il n'y a pas de message d'état vide clair pour ce graphe.

---

### 7.6 Dashboard

**Ce que l'utilisateur peut faire :**
Voir un tableau de bord personnalisable avec des widgets (calories, eau, poids, objectif hebdomadaire, etc.), les réorganiser, les redimensionner.

**Problèmes logiques :**

🟠 **La customisation n'est pas découvrable.** Le long-press pour activer le mode édition est une interaction cachée. Il n'y a pas d'icône de crayon ou de bouton "Modifier" visible au premier regard. L'utilisateur qui ne connaît pas ce pattern ne saura jamais qu'il peut personnaliser son dashboard.

🟠 **Les widgets naviguent vers la page, mais ne permettent pas d'agir directement.** Taper sur le widget "Calories" ouvre la page Nutrition. Mais l'utilisateur voulait peut-être juste ajouter un repas rapide. Un raccourci "+" sur le widget lui éviterait un aller-retour.

🟡 **Le widget "Objectif hebdomadaire" a un TARGET fixe à 3 séances** codé en dur. Si l'utilisateur a défini 5 séances/semaine dans son profil, l'objectif du widget ne le reflète pas.

---

### 7.7 Scanner

**Ce que l'utilisateur peut faire :**
Scanner un code-barres, uploader une photo de produit, créer un produit via IA, ou saisir manuellement le code.

**Problèmes logiques :**

🟠 **La catégorie de repas est choisie avant de scanner.** Si l'utilisateur change d'avis ou scanne plusieurs produits pour des repas différents, il doit sortir du scanner et recommencer. La catégorie devrait être sélectionnable après le scan, au moment de confirmer.

🟠 **Aucun historique de scans récents.** L'utilisateur qui scanne son pot de yaourt chaque matin doit répéter toute l'opération chaque fois. Un "Récemment scannés" dans le scanner permettrait d'aller 3× plus vite.

🟡 **Le processus de création IA manque de guidage.** Quand un produit n'est pas trouvé, l'IA demande des photos, mais sans instructions claires : combien de photos ? Face avant, tableau nutritionnel, liste d'ingrédients ? L'utilisateur ne sait pas ce qui aide l'IA.

---

### 7.8 Profil

**Ce que l'utilisateur peut faire :**
Modifier ses informations personnelles, ses objectifs, ses unités, son mot de passe, activer les notifications, envoyer un feedback.

**Problèmes logiques :**

✅ **Suppression de compte implémentée.** Bouton "Delete my account" dans ProfilePage → modal de confirmation avec saisie obligatoire de "DELETE" → edge function `delete-account` (Supabase, service role) qui supprime l'utilisateur et toutes ses données en cascade. L'export de données n'est pas proposé (choix délibéré).

🟠 **Les objectifs (calories, macros, eau) sont dans le profil mais leur impact n'est pas visible depuis là.** L'utilisateur modifie son objectif calorique à 2200 kcal, mais il ne voit pas ce que ça changera. Un mini-preview "Voici à quoi ressemblera votre dashboard avec ces valeurs" renforcerait la compréhension.

🟡 **Les sections accordion s'ouvrent une à la fois, mais rien ne l'indique.** Ouvrir "Mes objectifs" ferme silencieusement "Mes informations". L'utilisateur peut croire avoir perdu ses données non sauvegardées de la section précédente.

---

### 7.9 Cohérence Globale — Flux transversaux

Ces problèmes touchent plusieurs fonctionnalités simultanément :

**✅ Mécanisme d'annulation (undo) implémenté.** `Toast.tsx` étendu avec `toastWithUndo()` — bouton "Undo" visible 4,5s après chaque suppression : série (ExerciseCard), exercice (ExerciseCard + restauration complète avec toutes ses séries via `restoreExercise`), repas nutrition (MealSection — modal de confirmation remplacée par undo toast direct), séance (WorkoutPage — undo s'ajoute au modal de confirmation existant).

✅ **La philosophie "logging" est cohérente.** Séances et logs nutrition sont tous les deux éditables après sauvegarde — l'utilisateur peut toujours corriger une erreur de saisie.

✅ **Le fil conducteur entre les pages est géré.** Les boutons d'ajout rapide existent, et la date peut être modifiée au moment de saisir un repas ou une séance.

**🟠 Les objectifs sont définis dans le profil mais nulle part rappelés en contexte.** Quand l'utilisateur logge un repas, il ne voit pas "il te reste 600 kcal pour atteindre ton objectif". Quand il logge un workout, il ne voit pas "c'est ta 2e séance sur 4 cette semaine". L'app collecte les données mais ne les relie pas aux objectifs au moment de l'action.

---

### 7.10 Résumé des priorités logiques

| Priorité | Problème | Impact utilisateur |
|----------|----------|-------------------|
| ✅ | Édition des séances et logs passés | Fonctionnel — WorkoutForm réouvre la séance, EditFoodModal édite les logs |
| ✅ | Suppression individuelle de série | Implémenté — bouton Trash2 sur chaque SetRow |
| ✅ | Undo sur suppressions (série, exercice, repas, séance) | Implémenté — toastWithUndo() + restoreSet/restoreExercise |
| ✅ | Suppression de compte | Implémenté — edge function delete-account + modal avec confirmation textuelle |
| ✅ | Macros avec barre de progression vs objectif | Fonctionnel — MacroSummary affiche une barre par macro avec cible du profil |
| ✅ | Navigation vers les jours passés depuis Nutrition | Fonctionnel |
| ✅ | Fil conducteur entre pages (ajout rapide + date modifiable) | Fonctionnel |
| 🟠 | Routines sans vue de progression | La valeur principale de la routine n'est pas visible |
| 🟠 | Stats descriptives sans interprétation | Données sans sens actionnable |
| 🟠 | Customisation dashboard non découvrable | Fonctionnalité clé inconnue de la majorité |
| 🟠 | Widget objectif hebdo non lié aux objectifs du profil | Incohérence de données |
| 🟠 | Catégorie repas choisie avant le scan | Contrainte artificielle |
| 🟡 | Timer démarre automatiquement à la création | Imprécision involontaire |
| 🟡 | Détection catégorie repas basée sur l'heure actuelle | Incohérence sur les logs rétroactifs |
| ✅ | Recettes avec page de gestion dédiée | Fonctionnel — RecipesPage existe |
| 🟡 | Vue lecture seule d'une séance (vs mode edit forcé) | Ambiguïté UX mineure |

---

*Audit logique réalisé par Claude — Prometheus Tracker v1.0*

---

## 8. Audit des Fonctions IA

> Audit réalisé le 2 avril 2026. Objectif : évaluer la **pertinence et l'efficacité** de chaque fonction intelligente de l'app — est-ce que la logique utilisée est la bonne ? Y a-t-il des bugs, des incohérences scientifiques, ou des améliorations architecturales qui rendraient ces fonctions plus fiables et moins coûteuses ?

L'app contient **4 fonctions intelligentes** : 2 edge functions GPT-4o (analyse produit, vérification exercice), 1 utilitaire de calcul de macros, et 1 composant de recommandation calorique basé sur des règles.

---

### 8.1 Edge Function `analyze-product` — Extraction nutritionnelle par image

**Ce que ça fait :** Reçoit jusqu'à 3 photos d'un produit (face avant, face arrière, tableau nutritionnel) + un code-barres optionnel + des notes, et renvoie les valeurs nutritionnelles per 100g via GPT-4o.

**Ce qui fonctionne bien :**
- `temperature: 0.1` — bon choix, force des sorties déterministes et structurées
- Le prompt gère les aliments frais sans étiquette (pomme, poulet…) en utilisant les connaissances USDA du modèle
- La déduplication par code-barres puis par nom/marque évite les doublons dans la base

**Problèmes identifiés :**

🔴 **Aucun score de confiance dans la réponse.** L'IA retourne des valeurs avec le même JSON qu'il s'agisse d'une photo nette d'un tableau nutritionnel ou d'une image floue. L'utilisateur n'a aucun signal que les valeurs sont "estimées" plutôt que "lues". Résultat : des entrées potentiellement fausses dans la base sans aucune indication.

🟠 **GPT-4o utilisé même quand il n'y a pas d'images.** Si l'utilisateur fournit seulement un code-barres ou des notes textuelles, GPT-4o (le modèle le plus cher) est quand même appelé, alors qu'un modèle de type `gpt-4o-mini` suffit amplement pour un input purement textuel. Coût inutile.

🟠 **Pas de vérification Open Food Facts côté edge function.** La logique actuelle tente Open Food Facts dans `FoodForm.tsx` (côté client), mais la edge function `analyze-product` ne vérifie pas si le code-barres correspond à un produit connu avant d'appeler GPT-4o. Si le client échoue et passe par l'IA, un appel coûteux est fait pour un produit qui aurait pu être résolu gratuitement.

🟡 **`max_tokens: 500` légèrement juste.** Suffisant pour le JSON en temps normal, mais en cas de produit avec un nom long ou une marque étendue, la réponse peut être tronquée, causant un échec de parsing JSON silencieux.

🟡 **Pas d'instruction sur la gestion des contradictions entre images.** Si la face avant dit "250 kcal" mais le tableau nutritionnel dit "240 kcal/100g", le prompt ne précise pas quelle source privilégier. Le tableau nutritionnel doit toujours primer.

**Recommandation :**

```
1. Ajouter un champ "confidence": 0-100 dans le JSON retourné (100 = valeurs lues
   directement sur étiquette, <70 = estimation). Afficher une alerte UI si < 70.

2. Dans la edge function : si barcode fourni, tenter Open Food Facts AVANT d'appeler GPT.
   Ne passer à GPT que si la requête échoue ou ne renvoie rien.

3. Brancher sur gpt-4o-mini quand l'input est textuel uniquement (barcode + notes,
   pas d'images). Utiliser gpt-4o uniquement pour les requêtes avec images.

4. Passer max_tokens à 600.

5. Ajouter dans le prompt : "If images contain conflicting values, always prioritize
   the official nutrition facts label over front-of-pack claims."
```

---

### 8.2 Edge Function `verify-exercise` — Validation et description d'exercice

**Ce que ça fait :** Reçoit un nom d'exercice (+ muscles/description optionnels) et utilise GPT-4o pour valider s'il s'agit d'un vrai exercice, puis retourne les muscles primaires/secondaires, les instructions en français et la difficulté.

**Ce qui fonctionne bien :**
- Le prompt est strict sur les noms de muscles (enum fixe), ce qui garantit la cohérence des données en base
- Les instructions et tips sont retournés en français — cohérent avec l'audience cible
- La détection de variantes (ex : "close grip bench press") est bien gérée

**Problèmes identifiés :**

🔴 **Aucune vérification en base avant l'appel GPT-4o.** Si 500 utilisateurs ajoutent "Bench Press", GPT-4o est appelé 500 fois alors que la réponse serait identique à chaque fois. La table `exercises` est peuplée au fil du temps — une simple recherche insensible à la casse devrait être la première étape.

🟠 **GPT-4o est surdimensionné pour cette tâche.** Valider qu'un exercice existe et extraire des données structurées est une tâche de niveau `gpt-4o-mini` — pas de vision, raisonnement simple. Le coût par appel est 10× supérieur à ce qui est nécessaire.

🟠 **Pas de gestion du cas "nom de muscle hors enum".** Si GPT-4o retourne `"deltoids"` au lieu de `"side_delts"`, le JSON est techniquement valide mais la donnée est corrompue. Il n'y a pas de validation post-parsing qui vérifie que chaque muscle est bien dans la liste attendue.

🟡 **Pas de suggestion d'exercices similaires existants.** Si l'utilisateur tape "Incline Dumbbell Press" alors que "Incline DB Press" existe déjà, deux entrées quasi-identiques sont créées. L'IA devrait d'abord retourner les exercices similaires en base pour éviter les doublons sémantiques.

**Recommandation :**

```
1. Avant tout appel GPT : chercher l'exercice dans la table exercises avec
   ILIKE '%nom%'. Si match exact ou très proche, retourner directement sans appel IA.

2. Remplacer gpt-4o par gpt-4o-mini — suffisant pour cette tâche, 10× moins cher.

3. Post-parsing : valider chaque muscle retourné contre l'enum autorisé.
   Mapper les synonymes courants (deltoids → side_delts, etc.) avant de sauvegarder.

4. Ajouter un champ "similar_exercises": string[] dans le prompt pour que l'IA
   suggère les noms proches — utilisable côté client pour prévenir les doublons.
```

---

### 8.3 Utilitaire `calculateMacros()` — Calcul des macronutriments

**Ce que ça fait :** Calcule les objectifs protéines/lipides/glucides en grammes à partir d'un objectif calorique et d'un goal (cut/bulk/maintain).

**Ce qui fonctionne bien :**
- Logique simple et déterministe, aucune dépendance externe

**Problèmes identifiés :**

🔴 **Bug critique : `maintain` et `bulk` ont des paramètres identiques.** Les deux utilisent `protein: 30%, fat: 25%, carbs: 45%`. C'est un copier-coller oublié — un objectif "maintien" et un objectif "prise de masse" ne devraient pas avoir les mêmes ratios macros.

🔴 **La protéine est calculée en pourcentage de calories, pas en fonction du poids corporel.** C'est l'approche la moins précise scientifiquement. Pour un athlète de 90kg en phase de sèche avec un objectif de 1800 kcal : `35% × 1800 / 4 = 157g` de protéines, soit seulement 1.75g/kg — acceptable mais sous-optimal. Pour un athlète de 60kg avec 2500 kcal en prise de masse : `30% × 2500 / 4 = 187g`, soit 3.1g/kg — bien trop élevé. Le pourcentage ne s'adapte pas au profil de l'utilisateur.

🟠 **Le consensus scientifique recommande un calcul basé sur le poids** : 2.0–2.2g/kg en sèche, 1.8g/kg en prise de masse, 1.6g/kg en maintien (source : International Society of Sports Nutrition, 2017). L'approche actuelle peut sur ou sous-estimer les besoins selon le profil.

**Recommandation :**

```typescript
// Logique recommandée
export function calculateMacros(calorieTarget: number, goal: string, weightKg?: number) {
  // Protéine basée sur le poids corporel (consensus ISSN)
  const proteinPerKg = goal === 'cut' ? 2.2 : goal === 'bulk' ? 1.8 : 1.6;
  const proteinG = weightKg
    ? Math.min(Math.round(weightKg * proteinPerKg), Math.round(calorieTarget * 0.40 / 4))
    : Math.round(calorieTarget * 0.30 / 4); // fallback si pas de poids

  const proteinCals = proteinG * 4;
  const remainingCals = calorieTarget - proteinCals;

  // Distribution fat/carbs selon l'objectif
  const fatPct = goal === 'cut' ? 0.35 : 0.25; // sèche = plus de lipides, prise = plus de glucides
  const fatG = Math.round((remainingCals * fatPct) / 9);
  const carbsG = Math.round((remainingCals * (1 - fatPct)) / 4);

  return { protein: proteinG, fat: fatG, carbs: carbsG };
}
```

Ce calcul nécessite de passer le `weightKg` du profil utilisateur — données déjà disponibles dans `profileStore`.

---

### 8.4 Composant `WeeklyAdjustment` — Suggestion d'ajustement calorique

**Ce que ça fait :** Compare la moyenne de poids de la semaine en cours à la semaine précédente et suggère d'augmenter ou baisser les calories de 100–150 kcal selon l'objectif.

**Ce qui fonctionne bien :**
- La logique de base est saine (comparer les tendances de poids à l'objectif) et s'appuie sur un principe utilisé par des apps comme MacroFactor
- Les seuils de variation (trop vite/trop lentement) sont différenciés par objectif

**Problèmes identifiés :**

🟠 **Fenêtre de 7 jours insuffisante pour des tendances fiables.** La rétention d'eau peut provoquer des fluctuations de ±1.5kg sur une semaine sans aucun changement de composition corporelle. Une suggestion basée sur 7 jours peut être fausse à cause d'une pesée après un repas salé, d'un cycle hormonal, ou d'une activité physique inhabituelle.

🟠 **La suggestion s'affiche même avec 1 ou 2 pesées disponibles.** Il n'y a pas de garde-fou sur le nombre minimum de points de données. Une suggestion affichée avec 2 pesées sur 7 jours est statistiquement non fiable et peut induire l'utilisateur en erreur.

🟠 **Aucune explication du raisonnement.** L'utilisateur voit "+100 kcal" mais ne sait pas pourquoi. "Ta moyenne cette semaine est 80.2kg vs 80.8kg la semaine dernière, soit –0.6kg — ta prise de masse stagne" serait bien plus actionnable et pédagogique.

🟡 **Pas de bouton "Appliquer".** La suggestion est affichée mais l'utilisateur doit aller manuellement dans son profil pour modifier son objectif calorique. Ce friction inutile réduit drastiquement le taux d'adoption de la recommandation.

🟡 **La fenêtre d'analyse ne glisse pas (rolling window).** Le système compare "semaine N" à "semaine N-1" en blocs fixes. Si l'utilisateur a pesé lundi et vendredi cette semaine et mercredi la semaine dernière, la comparaison est biaisée. Une moyenne glissante sur 14 jours serait plus robuste.

**Recommandation :**

```
1. Exiger un minimum de 5 pesées sur les 14 derniers jours avant d'afficher
   une suggestion. En dessous, afficher : "Pèse-toi plus régulièrement pour
   recevoir des recommandations fiables (5 pesées/2 semaines minimum)."

2. Passer à une moyenne glissante sur 14 jours (au lieu de 7) pour réduire
   le bruit statistique.

3. Afficher le raisonnement complet : "Moyenne 14j : 80.4kg → tendance : –0.3kg/sem
   (objectif : –0.25kg/sem). Tu es légèrement en dessous de ta cible — bon rythme."

4. Ajouter un bouton "Appliquer (+100 kcal)" qui met à jour directement
   l'objectif calorique dans le profil sans navigation supplémentaire.
```

---

### 8.5 Résumé des priorités — Fonctions IA

| Priorité | Problème | Fonction | Impact |
|----------|----------|----------|--------|
| ✅ | Bug : `maintain` = `bulk` dans `calculateMacros()` | Macros | Corrigé — maintain : 30% P / 30% F / 40% G (vs bulk 30/25/45) |
| 🔴 | Protéine calculée en % calories, pas en g/kg | Macros | Surestimation pour les petits gabarits, sous-estimation pour les grands |
| 🔴 | Pas de vérification en base avant appel GPT (`verify-exercise`) | Exercices | Coût élevé + résultats redondants |
| 🟠 | Pas de score de confiance dans `analyze-product` | Nutrition IA | Fausses valeurs nutritionnelles silencieuses |
| 🟠 | GPT-4o au lieu de GPT-4o-mini pour `verify-exercise` | Exercices | Coût 10× supérieur au nécessaire |
| 🟠 | Pas de check Open Food Facts dans la edge function | Nutrition IA | Appels GPT inutiles pour produits connus |
| 🟠 | `WeeklyAdjustment` sans minimum de pesées requis | Recommandation | Suggestions non fiables avec peu de données |
| 🟠 | Pas de bouton "Appliquer" sur `WeeklyAdjustment` | Recommandation | Friction qui réduit l'adoption des suggestions |
| 🟡 | Pas de muscle validation post-parsing (`verify-exercise`) | Exercices | Données corrompues possibles |
| 🟡 | `max_tokens: 500` juste pour `analyze-product` | Nutrition IA | Parsing JSON qui peut échouer sur produits complexes |
| 🟡 | Fenêtre 7j trop courte dans `WeeklyAdjustment` | Recommandation | Bruit statistique élevé |

---

*Audit fonctions IA réalisé par Claude — Prometheus Tracker v1.0*
