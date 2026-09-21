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

## 2. Arbre frontend actuel et cible

Le dépôt est **déjà en transition** vers une architecture par domaines. Les chemins historiques restent présents comme façades, écrans métier ou stores. Cette réalité doit rester documentée car les agents et les tests de garde s’en servent pour ne pas inventer une seconde structure en parallèle.

### Arbre actuel

```text
src/
├── App.tsx                 Assembleur BrowserRouter + routes/providers
├── app/                    Router, guards, bootstrap, layout, navigation
├── features/               Domaines progressivement extraits
├── shared/                 API Supabase, hooks, types et primitives UI
├── components/             Écrans métier historiques / réexports temporaires
├── stores/                 Zustand ; façades et stores encore actifs
├── lib/                    Métier, utilitaires et réexports de compatibilité
└── i18n/                   Locales FR/EN
```

**Contrat de compatibilité documentaire :** les répertoires `components/`, `stores/` et `lib/` existent encore. Ne pas les supprimer d’un document ou d’une PR uniquement parce que la cible est plus propre ; leur migration est progressive et doit être prouvée par le code.

Exemple actuel : `src/stores/coachingStore.ts` assemble le store Zustand à partir des slices de `src/features/coaching/model/`. Les règles de domaine résident dans `src/features/coaching/domain/`. Conserver ce point d’entrée compatible pendant la migration progressive.

### Arbre cible

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
└── façades/réexports temporaires jusqu’à migration sûre
```

Le dépôt actuel possède déjà une partie de cette structure. La migration reste progressive : **pas de big-bang de dossiers**.

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
- garder les primitives UI sans logique métier ;
- réutiliser les primitives existantes avant d’ajouter store/table/RPC/Edge Function.

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

Les noms exacts peuvent évoluer ; la séparation des concepts, elle, ne doit pas disparaître.

### Règles

- `coachCapability` ne doit pas rester éternellement déduit du legacy role ;
- `activeWorkspace` est local/UI et ne donne aucun droit ;
- `personalCoaching` dépend d’une relation active réelle ;
- publication marketplace indépendante ;
- entitlement commercial indépendant ;
- un Coach peut utiliser le tracker personnel et peut lui-même être Coaché.

---

## 5. Autorisations : ressource + action, pas persona globale

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
- un Coaché corrige ses propres données historiques ;
- un Coaché ne modifie pas directement le programme assigné ;
- un Coach peut modifier ses modèles et les attributions qu’il gère pour un client actif ;
- un Coach ne lit pas le dossier complet d’un simple prospect.

RLS/RPC reste la source de vérité de sécurité. Une garde React améliore l’UX, elle ne remplace pas l’autorisation serveur.

Les décisions P1.2 vivent dans `src/features/account/domain/resourcePermissions.ts`. Les écrans et gardes de routes les consultent ; le workspace UI n’y figure pas comme condition d’octroi. Côté serveur, `save_program` refuse un Coaché qui possède encore le plan qui lui est assigné. Les primitives `sync_program_days` / `save_program_day_exercises` / `snapshot_program_revision` / `sync_program_phases` / `create_program_with_days` sont internes (pas d’EXECUTE `authenticated`). Les writes Data API du graphe programme (`programs` INSERT/UPDATE/DELETE, `program_days`, `program_day_exercises`, `program_phases`) sont fermés : commandes métier RPC uniquement (`save_program`, `delete_program`, versions). `delete_program` prend `FOR UPDATE` sur la ligne programme avant ses gardes, pour qu’un assignment concurrent ne soit pas CASCADE-supprimé. Un Coach lui-même Coaché continue de gérer les programmes de ses clients actifs.

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

Ne jamais corriger l’histoire en modifiant une vieille migration : créer une nouvelle migration et mettre à jour les tests/locks associés.

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

Une acceptation du Coach ne doit jamais activer seule la relation. Le dernier consentement appartient à l’athlète. La conversation prospect sans dossier (P4.3) n’est pas ouverte par cette transition.

Un signalement (P4.4) n’active ni n’arrête une relation. La suspension d’annuaire est une retenue de visibilité, pas une fin de suivi.

Ne pas confondre cette machine d’état avec :

- paiement ;
- entitlement ;
- publication profil ;
- tracking configuration.

### Relation de coaching

```text
prospect/pending
→ active
→ ended
```

La relation n’a pas d’état `paused`. Une interruption est représentée par `ended`, avec possibilité d’un nouveau cycle ultérieur. Ne pas réutiliser un statut de programme/attribution pour masquer l’état relationnel.

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

Le moteur actuel est une fondation à conserver.

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
→ session_organization (fixed_days | in_order)
→ version (révision active + optionnellement une future)
→ phases optionnelles
→ session templates (program_days)
→ prescriptions
→ execution history (workouts tamponnés)
```

Scheduling P3.1 : calendrier (`fixed_days`) et séquence (`in_order`) sur le même
moteur. Phases P3.2 : optionnelles, même logger. Versions P3.3 : `program_revisions`
+ pointeurs d’activation, pas de second graphe.

Les deux créent des séances dans le **même** moteur de workout.

Le logger décrit ce qui a réellement été fait. Le programme décrit ce qui était planifié. Une substitution ponctuelle ne réécrit pas automatiquement le programme futur.

---

## 9. IA / Copilote

Ne pas créer un bot séparé par client ou par Coach.

Le système cible converge les briques existantes : `solo_weekly_reviews`, fleet, interventions et `coach-agent`.

```text
agrégats déterministes
→ signaux persistants (`athlete_signals`)
→ revue hebdomadaire universelle (`athlete_weekly_reviews`, P2.2)
→ journal des décisions humaines (`athlete_decision_log`, P2.3)
→ hypothèses / preuves pour et contre
→ confiance qualitative
→ proposition éventuelle (`coach_interventions` / Solo copilot)
→ décision humaine
→ mémoire pour la prochaine revue
```

### Source de vérité

Une génération IA n’est jamais l’état métier final.

L’état final est une écriture contrôlée : proposition persistée, décision humaine et effets confirmés.

La revue hebdomadaire est fixe ; les analyses événementielles la complètent. Le système doit pouvoir conclure « attendre davantage de données ».

---

## 10. Offline

Priorité : **workout**.

Principes :

- IDs stables ;
- queue namespacée par compte ;
- retry idempotent ;
- dead-letter pour erreurs durables ;
- ne jamais afficher le cache d’un autre utilisateur ;
- purge adaptée au logout ;
- aucun succès affiché avant écriture ou mise en queue fiable.

Étendre à d’autres domaines uniquement si le besoin UX est réel. Marketplace et IA peuvent rester online-only.

---

## 11. Marketplace et prospects

Les prospects sont un domaine de relation **pré-coaching**, pas de faux clients actifs.

Avant activation :

- accès dossier limité ;
- pas de `is_coach_of` implicite ;
- conversation possible selon contrat ;
- pas d’accès aux photos/check-ins/historique complet ;
- aucune modification de programme du prospect.

L’activation atomique doit vérifier qu’aucun autre Coach actif n’existe et que l’athlète a donné sa confirmation finale.

---

## 12. Commercial

Le modèle historique `free/premium` est transitoire.

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

Règles durables :

- essai Solo après perte du Coach : **14 jours** ;
- grâce Coach en cas de défaut de paiement : **7 jours** ;
- prix et quotas définitifs : **non décidés** ;
- source unique applicative : `src/lib/commercialTerms.ts` ; source unique SQL : `solo_trial_interval()` / `coach_grace_interval()` ;
- pendant la bêta, l’accès peut être ouvert via `beta_access`, sans cesser de mesurer les coûts ;
- Prometheus facture son logiciel, pas la prestation Coach ↔ athlète ;
- la plateforme ne doit pas introduire paiement/payout/commission de coaching sans nouvelle décision produit explicite.

---

## 13. Import

L’import spreadsheet/CSV est une pipeline, pas une série d’`INSERT` depuis le client.

```text
parse
→ normalize
→ map
→ validate
→ preview
→ human correction
→ confirm
→ transactional apply
```

Pour les gros imports, conserver un identifiant d’import, provenance et état afin de pouvoir reprendre/diagnostiquer.

Si le client n’a pas encore de compte, le Coach prépare un dossier provisoire ; le rattachement définitif requiert le compte et le consentement de l’athlète.

Le pipeline est conçu pour l’import. Ne pas ajouter un moteur d’export complet comme symétrie « naturelle » : ce n’est pas une capacité produit prévue par la Vision actuelle.

---

## 14. Bibliothèque exercices

Un exercice canonique possède plusieurs alias FR/EN et variantes clairement distinguées.

Ne pas utiliser le texte du nom comme seule identité durable lorsque les performances historiques y sont attachées.

Une fusion de doublons doit réaffecter les références sans perdre l’histoire.

Avant de créer un nouvel exercice, rechercher les concepts proches. Une incertitude doit rester explicite plutôt que créer un faux doublon automatiquement.

---

## 15. Télémétrie et coûts

Produit : respecter `docs/TELEMETRY.md`.

Coûts bêta : mesurer les métadonnées économiques sans recopier le contenu sensible.

Exemples sûrs selon contexte :

- feature/action ;
- model/provider ;
- token counts ;
- duration ;
- success/failure ;
- estimated/actual cost ;
- stockage ou unité facturable.

Pas de prompt complet, message privé, note libre sensible, photo ou réponse santé simplement pour calculer le coût.

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

Browser/E2E sur les quatre états essentiels :

- Solo ;
- Coaché ;
- Coach + Solo personnel ;
- Coach + lui-même Coaché.

### CI

Une tâche normale ne peut être considérée terminée avec CI rouge. Les tests de garde documentaire sont des contrats : si un document change volontairement, garder les informations encore vraies ou mettre à jour le test dans le même changement lorsque le contrat lui-même évolue.

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
