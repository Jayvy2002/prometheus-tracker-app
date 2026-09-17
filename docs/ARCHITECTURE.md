# Architecture — Prometheus

> **RÔLE — CONTRAT TECHNIQUE DURABLE**
>
> Ce document décrit comment organiser le code pour servir `docs/VISION.md` sans dériver vers trois applications séparées, des permissions fragiles ou des écrans monolithiques.
>
> `docs/CHANTIER.md` définit l’ordre de migration. Ne pas lancer une refonte globale hors de cet ordre.

**Référence architecture : 17 septembre 2026.**

---

## 1. Décision structurante

Prometheus reste un **monolithe modulaire React + Supabase**.

Aucune justification actuelle pour :

- microservices ;
- deuxième backend ;
- deuxième moteur de séances ;
- deuxième moteur de programmes ;
- Redux ou remplacement massif de Zustand ;
- séparation physique Solo/Coaché/Coach.

L’architecture doit exprimer :

```text
un compte
+ un moteur de données personnelles
+ des capacités indépendantes
+ des relations explicites
+ des workspaces UI
```

---

## 2. Architecture frontend cible

```text
src/
├── app/
│   ├── router/
│   ├── guards/
│   ├── bootstrap/
│   ├── layout/
│   └── navigation/
├── features/
│   ├── account/
│   ├── coaching/
│   ├── marketplace/
│   ├── workout/
│   ├── programs/
│   ├── nutrition/
│   ├── checkin/
│   ├── goals/
│   ├── imports/
│   └── profile/
├── shared/
│   ├── api/
│   ├── hooks/
│   ├── lib/
│   ├── types/
│   └── ui/
├── i18n/
└── legacy façades/réexports temporaires
```

Le dépôt actuel possède déjà une partie de cette structure. La migration reste progressive.

---

## 3. Flux de dépendances

Convention cible :

```text
UI
→ hook / use case / model
→ API du domaine
→ Supabase / RPC
```

Un écran ne devrait pas devenir un mini-backend.

### Nouveau code

Pour une nouvelle capacité :

- éviter `supabase.from(...)` directement dans un gros composant ;
- mettre les règles métier testables dans le domaine ;
- utiliser une API/hook clair pour l’orchestration ;
- garder les primitives UI sans logique métier.

### Code historique

Ne pas déplacer des centaines de fichiers uniquement pour respecter l’arbre cible.

Lorsqu’un gros composant historique est touché pour une vraie fonctionnalité, extraire la partie concernée si cela réduit réellement les risques.

---

## 4. Modèle account/capabilities

L’ancien `coaching_role = none/client/coach` est une compatibilité historique, pas le modèle cible.

Contrat conceptuel :

```ts
type AccountContext = {
  personalCoaching: 'solo' | 'coached';
  capabilities: {
    coach: boolean;
  };
  activeWorkspace: 'personal' | 'coaching';
  activeCoachId: string | null;
  marketplacePublished: boolean;
  entitlements: unknown;
}
```

Les noms exacts peuvent évoluer.

### Règles

- `coachCapability` ne doit pas rester éternellement déduit du legacy role ;
- `activeWorkspace` est local/UI et ne donne aucun droit ;
- `personalCoaching` dépend d’une relation active réelle ;
- publication marketplace indépendante ;
- entitlement commercial indépendant.

---

## 5. Autorisations

### Mauvais pattern

```ts
if (persona === 'coached') denyEntireFeature();
```

### Pattern cible

Décider selon :

```text
actor
resource owner
relationship
requested action
server-side rule
```

Exemples :

- un Coaché lit son calendrier ;
- un Coaché logge sa séance ;
- un Coaché ne modifie pas directement le programme assigné ;
- un Coach peut modifier les programmes dont il est propriétaire ou qu’il gère pour un client actif ;
- un Coach ne lit pas le dossier complet d’un simple prospect.

RLS/RPC reste la source de vérité de sécurité.

---

## 6. Backend Supabase

### Tables exposées

RLS obligatoire.

### UPDATE

Vérifier à la fois :

- droit de toucher la ligne actuelle ;
- validité des nouvelles valeurs.

### RPC privilégiées

Pour `SECURITY DEFINER` :

- `auth.uid()` obligatoire ;
- cible validée ;
- état précédent validé ;
- transition autorisée ;
- `search_path` contrôlé ;
- droits `EXECUTE` explicites ;
- idempotence lorsque retry plausible.

### Migrations

Une migration appliquée est immuable.

Ne jamais corriger l’histoire en modifiant une vieille migration : créer une nouvelle migration.

---

## 7. Machines d’état explicites

Les domaines critiques doivent avoir des transitions nommées.

### Marketplace

```text
pending
→ coach_accepted
→ athlete_confirmed
→ relationship active
```

Ne pas confondre avec :

- paiement ;
- entitlement ;
- publication profil ;
- tracking configuration.

### Programme

```text
draft
→ saved revision
→ active
→ superseded/archived
```

### Objectif

```text
active
→ reached | maintenance | replaced | paused | abandoned
```

Des états métier différents ne doivent pas être représentés par un même booléen si cela rend les transitions ambiguës.

---

## 8. Moteur entraînement/programmes

Le moteur actuel est à conserver.

### Prescriptions existantes à préserver

- sets/reps ;
- RIR ;
- repos ;
- warmup/working ;
- drop ;
- myo ;
- tempo ;
- isometric ;
- cluster ;
- supersets ;
- charge prescrite ;
- snapshots/révisions.

### Extension cible

```text
Program
→ Phase/Block
→ Cycle optionnel
→ SessionTemplate
→ ExercisePrescription
```

Scheduling :

- calendrier ;
- séquence.

Tous deux créent des séances dans le même moteur.

---

## 9. IA / Copilote

Ne pas créer un nouveau bot par client/Coach.

Le système cible repose sur :

```text
agrégats déterministes
→ signaux persistants
→ hypothèses/mémoire
→ génération contextualisée si utile
→ décision humaine
```

Réutiliser/converger les briques `solo_weekly_reviews`, fleet, interventions et `coach-agent`.

### Source de vérité

Une génération IA n’est jamais l’état métier final.

L’état final est une écriture contrôlée : proposition persistée, décision humaine et effets confirmés.

---

## 10. Offline

Priorité : **workout**.

Principes :

- IDs stables ;
- queue namespacée par compte ;
- retry idempotent ;
- dead-letter pour erreurs durables ;
- ne jamais afficher le cache d’un autre utilisateur ;
- purge adaptée au logout.

Étendre à d’autres domaines uniquement si le besoin UX est réel.

---

## 11. Marketplace et prospects

Les prospects doivent être un domaine de relation pré-coaching, pas un faux client actif.

Avant activation :

- accès limité ;
- pas de `is_coach_of` implicite ;
- conversation possible selon contrat ;
- pas d’accès aux photos/check-ins/historique complet.

L’activation atomique doit vérifier qu’aucun autre Coach actif n’existe.

---

## 12. Commercial

Le modèle `free/premium` historique doit être considéré comme transitoire.

Cible : entitlements séparés par capacité/service.

```text
solo_entitlement
coach_entitlement
tier/client_limit
trial
grace
beta_access
billing_status
```

Stripe met à jour le commercial ; il ne définit pas directement la relation Coach ou l’identité.

---

## 13. Import

L’import spreadsheet/CSV doit être une pipeline, pas une série d’INSERT depuis le client.

```text
parse
→ normalize
→ map
→ validate
→ preview
→ confirm
→ transactional apply
```

Pour les gros imports, conserver un identifiant d’import, provenance et état afin de pouvoir reprendre/diagnostiquer.

---

## 14. Bibliothèque exercices

Un exercice canonique possède plusieurs alias.

Ne pas utiliser le texte du nom comme seule identité durable lorsque les performances historiques y sont attachées.

Une fusion de doublons doit réaffecter les références sans perdre l’histoire.

---

## 15. Télémétrie et coûts

Produit : respecter `docs/TELEMETRY.md`.

Coûts bêta : mesurer métadonnées économiques sans recopier le contenu sensible.

Exemples sûrs selon contexte :

- feature ;
- model/provider ;
- token counts ;
- duration ;
- success/failure ;
- estimated cost ;
- user pseudonymous/server id selon politique interne.

Pas de prompt complet, message privé ou note santé uniquement pour calculer le coût.

---

## 16. Tests par couche

### Domaine

Tests unitaires pour règles pures : matching, permissions dérivées, conversions, transitions, scheduling.

### DB

Tests RLS/RPC pour :

- isolation ;
- transitions relation ;
- capacité Coach ;
- activation marketplace ;
- programme atomique ;
- fin de relation.

### Parcours

Browser/E2E sur les 4 états essentiels :

- Solo ;
- Coaché ;
- Coach + Solo personnel ;
- Coach + lui-même Coaché.

### CI

Une tâche normale ne peut être considérée terminée avec CI rouge.

---

## 17. Garde-fous de dépendances

Conserver et renforcer progressivement les règles :

- `shared` ne dépend pas d’un domaine métier ;
- un domaine ne doit pas importer arbitrairement les internals d’un autre ;
- utiliser une API publique de feature lorsque deux domaines collaborent ;
- éviter les cycles ;
- conserver les façades temporaires tant qu’elles facilitent une migration sûre.

---

## 18. Règle de refactor

Refactoriser lorsqu’au moins un de ces critères est vrai :

- la fonctionnalité ne peut pas être implémentée sûrement dans la structure actuelle ;
- la logique est dupliquée ;
- les tests sont impossibles à écrire ;
- une permission/règle critique est enfouie dans l’UI ;
- le même domaine est régulièrement cassé par sa taille/couplage.

Ne pas refactoriser uniquement pour obtenir un arbre plus élégant.
