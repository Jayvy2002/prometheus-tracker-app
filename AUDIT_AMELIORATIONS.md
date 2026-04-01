# Audit & Plan d'Amélioration — Prometheus Tracker

> Audit réalisé le 1er avril 2026. Ce document ne contient aucune modification de code — uniquement des recommandations priorisées.

---

## Résumé Exécutif

Prometheus est une application de suivi fitness bien architecturée, couvrant l'entraînement, la nutrition, le poids et les métriques de santé. La base technique est solide (React 18, TypeScript, Supabase, Zustand). Les axes d'amélioration les plus impactants concernent : la **rétention utilisateur** (gamification, rappels), la **complétude des flux critiques** (nutrition, workout), l'**analytique avancée**, et l'**expérience mobile**.

---

## 1. Expérience Utilisateur (UX)

### 1.1 Navigation & Structure

**Problème :** Certaines pages importantes (`/stats`, `/exercise-progress`, `/health`) ne sont accessibles que via des routes directes — elles n'apparaissent pas dans la navigation principale (SideNav/BottomNav). L'utilisateur peut ne jamais les découvrir.

**Recommandation :**
- Intégrer `/stats` dans la navigation principale (remplacer ou compléter `/calendar`)
- Ajouter un menu "Plus" ou une section découverte dans le profil pour les pages secondaires
- Revoir la hiérarchie de navigation : Dashboard → Workout → Nutrition → Stats → Profil

---

### 1.2 Onboarding

**Problème :** Le flux d'onboarding en 5 étapes est fonctionnel mais ne montre pas à l'utilisateur la **valeur immédiate** de l'app avant qu'il s'engage à remplir toutes ses données.

**Recommandation :**
- Ajouter un écran de "preview" avant l'onboarding montrant les fonctionnalités clés (screenshots animés ou démo)
- Permettre de passer certaines étapes (ex : mensurations) et les compléter plus tard
- Ajouter une barre de progression visuelle avec estimation du temps restant ("2 min pour finir")
- Message de bienvenue personnalisé à la fin de l'onboarding avec le prénom et les objectifs calculés

---

### 1.3 Dashboard

**Problème :** Le dashboard est personnalisable mais l'état par défaut peut sembler vide ou peu engageant pour un nouvel utilisateur sans données.

**Recommandation :**
- État vide (empty state) guidé : si aucune donnée, chaque widget suggère une action ("Ajouter votre premier repas", "Démarrer un entraînement")
- Widget "Aujourd'hui en bref" : résumé top-niveau (calories restantes, prochain entraînement prévu, poids de la veille)
- Mémoriser le scroll position du dashboard lors de la navigation retour
- Ajouter un widget "Objectif hebdomadaire" (ex : 3 séances/semaine → 2/3 cette semaine)

---

### 1.4 Workout — Formulaire de logging

> ⚠️ Rappel de philosophie : Prometheus est une app de **logging**, pas un companion de séance. L'objectif est de **capturer fidèlement ce qui s'est passé à la salle**, le plus rapidement possible. Les recommandations ci-dessous visent la vitesse de saisie et la consultation de l'historique — pas un flow guidé.

**Problème :** La saisie des séries (poids/reps) manque de rapidité, et l'utilisateur n'a pas accès à ses performances passées au moment où il en a le plus besoin (pendant ou juste après sa séance).

**Recommandation :**
- Afficher les performances de la dernière séance sur le même exercice directement dans la fiche, sans navigation (ex : "Dernière fois — Série 1 : 80kg × 8, Série 2 : 80kg × 6")
- Saisie numérique optimisée : ouvrir directement le pavé numérique au tap sur un champ poids/reps, pas de clavier alphanumérique
- Permettre le logging rétroactif sans friction : la date de séance doit être facilement modifiable en haut du formulaire (pour ceux qui loggent après coup)
- Enregistrement automatique à chaque modification (pas de bouton "Sauvegarder" à ne pas oublier)

---

### 1.5 Nutrition — Logging des repas

**Problème :** Ajouter un aliment nécessite de naviguer dans plusieurs écrans. Le flux n'est pas aussi rapide que sur des apps concurrentes (MyFitnessPal).

**Recommandation :**
- Barre de recherche d'aliments directement accessible depuis la page Nutrition (pas de navigation supplémentaire)
- Suggestions "récents" et "favoris" affichées en premier dans la recherche d'aliments
- Logging rapide : ajouter un aliment favori en 1 tap depuis la page Nutrition
- Copier les repas d'une journée précédente ("Réutiliser le repas d'hier")
- Indicateur visuel de progression calorique (ex : barre de couleur qui passe de vert à orange à rouge)
- **Recherche intelligente par ranking IA** : plutôt qu'afficher une liste brute de tous les aliments correspondant au texte saisi, classer les résultats par ordre de probabilité contextuelle (fréquence d'utilisation du user, heure de la journée, repas précédents, popularité globale). Cette fonctionnalité est peut-être déjà partiellement implémentée — à vérifier. Si elle ne l'est pas, une alternative sans IA est possible via un scoring simple (fuzzy match + fréquence personnelle + popularité). Si on utilise l'IA, envoyer l'input + contexte (heure, repas du jour) à GPT pour re-scorer les résultats avant affichage.

---

### 1.6 Scanner & Reconnaissance de produits

**Problème :** Le scanner actuel est exclusivement basé sur la lecture de codes-barres. Les produits sans code-barres (aliments frais, plats cuisinés maison, restaurants) ne peuvent pas être identifiés via cette interface.

**Recommandation — Reconnaissance produit par image (sans code-barres) :**
- Ajouter un mode "Photo du produit" dans le scanner : l'utilisateur prend une photo de l'aliment ou de l'emballage
- L'image est envoyée à GPT-4o Vision (déjà intégré dans l'app via la edge function `analyze-product`) pour identifier le produit
- Une fois le produit identifié par l'IA (ex : "Yaourt nature Danone 125g"), recherche automatique dans : la base interne `food_products`, puis Open Food Facts API (`https://world.openfoodfacts.org/api/v2/search?product_name=...`)
- Si un match est trouvé, proposer le produit à l'utilisateur pour confirmation avant de logger
- Si aucun match, afficher la fiche produit pré-remplie par l'IA pour que l'utilisateur la valide/corrige avant enregistrement
- Cette approche réutilise l'infrastructure OpenAI déjà en place — pas de nouveau service à intégrer

> **Note technique :** Open Food Facts est une base publique gratuite (~3M produits), accessible via API REST sans clé. Elle couvre bien les produits européens/français. À intégrer comme fallback après la base interne.

**Recommandation — Robustesse du scanner code-barres :**
- Afficher clairement les navigateurs supportés avec un message d'aide si la Barcode Detection API n'est pas disponible
- Ajouter une librairie de fallback JavaScript (ex : `zxing-js`) pour les navigateurs non compatibles (Firefox, etc.)
- Permettre la saisie manuelle du code-barres dans la même page (pas de navigation séparée)

---

### 1.7 Page Calendrier

**Problème :** La page Calendrier existe mais son contenu est peu développé. Elle n'affiche probablement pas assez d'informations pour être utile (séances, repas, poids ce jour-là).

**Recommandation :**
- Afficher sur chaque jour : indicateur de séance complétée, calories du jour, poids du jour
- Vue semaine et vue mois
- Cliquer sur un jour ouvre un résumé de la journée (séances, macros, poids)
- Visualisation des streaks directement sur le calendrier

---

### 1.9 États vides & Feedback

**Problème :** Plusieurs pages n'ont probablement pas d'état vide (empty state) bien défini, ce qui peut perturber les nouveaux utilisateurs.

**Recommandation :**
- Chaque liste (workouts, repas, recettes, routines) doit avoir un empty state illustré avec un CTA clair
- Messages d'erreur réseau plus explicites (distinguer "pas de données" de "erreur de chargement")
- Skeleton loaders sur toutes les listes pour éviter le flash de contenu vide
- Toast de confirmation sur toutes les actions critiques (suppression, sauvegarde)

---

## 2. Fonctionnalités Manquantes ou Incomplètes

### 2.1 🔴 Priorité Haute

#### Notifications & Rappels
L'app n'a aucun système de rappels ou notifications, ce qui est un facteur clé de rétention.

**À implémenter :**
- Rappels configurables : "N'oublie pas ton entraînement" (heure définie par l'utilisateur)
- Rappel de log nutritionnel si aucun repas enregistré après 14h
- Rappel d'hydrataion (ex : "Tu n'as pas encore loggé d'eau aujourd'hui")
- Notification de fin de timer de repos
- Utiliser les **Web Notifications API** + Service Worker

---

#### Historique des performances par exercice
Le suivi de progression par exercice (`/exercise-progress`) existe mais est accessible uniquement via une route directe.

**À implémenter :**
- Accès rapide depuis la fiche exercice dans une séance active
- Graphique de 1RM estimé (formule d'Epley) calculé automatiquement depuis les séries
- Tableau comparatif semaine par semaine
- Record personnel (PR) affiché et célébré lors d'un dépassement

---

### 2.2 🟠 Priorité Moyenne

#### Routines — Améliorations
Les routines sont fonctionnelles mais pourraient être bien plus puissantes.

**À implémenter :**
- Programmes d'entraînement prédéfinis (PPL, 5/3/1, etc.) importables en 1 clic
- Historique des performances sur chaque routine (tonnage moyen, évolution)
- Planification de routine sur le calendrier (ex : "Lundi : Push, Mercredi : Pull")
- Partage de routine entre utilisateurs

---

### 2.3 🟡 Priorité Basse / Nice-to-have

#### Intelligence Artificielle — Coach Virtuel

**À implémenter :**
- Analyse hebdomadaire automatique : "Tu as mangé 15% sous ton objectif cette semaine, voici pourquoi c'est risqué..."
- Suggestions d'ajustement de charge (progressive overload automatiquement détectée)
- Chatbot coach nutritionnel (utilisation de l'intégration OpenAI déjà présente)

---

#### Social & Communauté

**À implémenter :**
- Profil public optionnel
- Défi entre amis (ex : "Qui fait le plus de séances ce mois-ci ?")
- Partage d'une séance ou d'un résumé nutritionnel sur les réseaux sociaux (image générée)
- Leaderboard (optionnel, opt-in)

---

#### Plan alimentaire

**À implémenter :**
- Planificateur de repas pour la semaine
- Liste de courses générée automatiquement depuis le plan alimentaire
- Suggestions de repas selon les objectifs macros restants de la journée

---

## 3. Performance & Technique

### 3.1 Pagination & virtualisation des listes

**Problème :** Les listes (séances, logs nutritionnels) chargent probablement toutes les données sans pagination. Cela deviendra un problème de performance après plusieurs mois d'utilisation.

**Recommandation :**
- Pagination ou infinite scroll sur : historique des workouts, logs nutritionnels, liste d'aliments
- Virtualisation (`react-window` ou `react-virtual`) pour les longues listes d'exercices et d'aliments

---

### 3.2 PWA & Offline

**Problème :** L'app n'est pas configurée comme PWA (Progressive Web App). Il n'y a pas de Service Worker, pas de manifeste d'installation.

**Recommandation :**
- Ajouter un `manifest.json` pour permettre l'installation sur l'écran d'accueil mobile
- Service Worker avec cache-first pour les assets statiques
- Offline-first pour le logging de séances (déjà partiellement en place avec le localStorage)
- Sync en arrière-plan quand la connexion est rétablie

---

### 3.3 Optimisation des requêtes Supabase

**Problème :** Les requêtes sont effectuées de manière séquentielle pour les données imbriquées (workout → exercises → sets), ce qui multiplie les aller-retours réseau.

**Recommandation :**
- Utiliser les **jointures Supabase** (`.select('*, workout_exercises(*, workout_sets(*))') `) pour récupérer les données imbriquées en une seule requête
- Mettre en cache les données de référence (exercices, produits fréquents) avec une stratégie stale-while-revalidate
- Utiliser Supabase **Realtime** pour les mises à jour en temps réel si plusieurs appareils utilisés

---

### 3.4 Validation des formulaires

**Problème :** La validation côté client est minimale sur certains formulaires.

**Recommandation :**
- Intégrer une librairie de validation (ex : `zod` + `react-hook-form`) pour une validation cohérente
- Messages d'erreur inline sur tous les champs (pas seulement des toasts)
- Validation en temps réel (au blur) plutôt qu'uniquement à la soumission

---

### 3.5 Sécurité & Authentification

**Problème :** Pas de vérification d'email, pas de 2FA, pas de rate limiting côté client.

**Recommandation :**
- Activer la vérification email obligatoire (configurable dans Supabase Auth)
- Proposer l'authentification sociale (Google, Apple) pour réduire la friction à l'inscription
- Ajouter un délai côté client entre les tentatives de connexion échouées
- Politique de mot de passe affichée à la création de compte

---

## 4. Accessibilité

**Problème :** L'app semble être développée sans attention particulière à l'accessibilité.

**Recommandation :**
- Tous les boutons icônes doivent avoir un `aria-label`
- Contraste de texte : vérifier les ratios sur les éléments en gris clair sur fond sombre
- Navigation au clavier testée sur les modales et les formulaires
- Messages d'état (loading, erreur, succès) annoncés avec `aria-live`
- Support du mode "Reduce Motion" pour désactiver les animations

---

## 5. Roadmap Priorisée

| Priorité | Amélioration | Impact | Effort |
|----------|-------------|--------|--------|
| 🔴 1 | Notifications & rappels (Web Push) | Rétention élevée | Moyen |
| 🔴 2 | Performances précédentes affichées inline dans le formulaire | UX quotidienne | Faible |
| 🔴 4 | Empty states + skeleton loaders cohérents | Qualité perçue | Faible |
| 🟠 5 | Barre de recherche nutrition directe | UX quotidienne | Faible |
| 🟠 6 | PWA (manifest + service worker) | Mobile UX | Moyen |
| 🟠 7 | Programmes d'entraînement prédéfinis importables | Onboarding | Moyen |
| 🟠 8 | Planificateur de repas hebdomadaire | Valeur ajoutée | Élevé |
| 🟡 9 | Pagination & virtualisation des listes | Performance | Moyen |
| 🟡 10 | Optimisation requêtes Supabase (jointures) | Performance | Faible |
| 🟡 11 | Social — partage de séances | Acquisition | Élevé |
| 🟡 12 | Coach IA — analyse hebdomadaire | Différenciation | Élevé |

---

## 6. Ce qui fonctionne bien (à conserver)

- Architecture Zustand bien organisée par domaine
- Dark theme cohérent et moderne
- Animations et transitions fluides
- Barcode scanning natif + fallback image
- Calcul automatique BMR/TDEE/macros à l'onboarding
- Système de widgets dashboard personnalisable
- RLS Supabase correctement configuré (sécurité des données)
- Intégration OpenAI pour l'analyse des produits alimentaires

---

*Audit réalisé par Claude — Prometheus Tracker v1.0*
