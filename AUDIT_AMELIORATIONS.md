# Audit & Plan d'Amélioration — Prometheus Tracker

> Audit réalisé le 1er avril 2026.
> Dernière mise à jour : 1er avril 2026.

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

**Reste à faire :**
- Saisie numérique optimisée : ouvrir le pavé numérique au tap sur un champ poids/reps
- Logging rétroactif : date de séance facilement modifiable en haut du formulaire
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

**Reste à faire :**
- Messages d'erreur réseau plus explicites
- Toast de confirmation sur toutes les actions critiques (suppression, sauvegarde)

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
| 🔴 | Notifications & rappels (Web Push) | Rétention élevée | Moyen |
| 🟠 | Scanner — reconnaissance produit par image sans code-barres | Fonctionnalité clé | Moyen |
| 🟠 | Programmes d'entraînement prédéfinis importables (PPL, 5/3/1…) | Onboarding | Moyen |
| 🟠 | PWA (manifest + service worker) | Mobile UX | Moyen |
| 🟠 | Validation formulaires (zod + react-hook-form) | Qualité | Moyen |
| 🟠 | Planificateur de repas hebdomadaire | Valeur ajoutée | Élevé |
| 🟡 | Pagination & virtualisation des listes | Performance | Moyen |
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

*Audit réalisé par Claude — Prometheus Tracker v1.0*
