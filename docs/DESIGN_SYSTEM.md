# Design system — tokens et primitives

> **Rôle** — tokens et primitives. Lot **19 livré** : les primitives listées utilisent les tokens sémantiques. Les écrans métier (`Dashboard`, séances, nutrition) peuvent encore mélanger `neutral-*` / `blue-*` — hors lot, à aligner au fil des PR produit. Diagnostic : [`AUDIT_ARCHITECTURE.md`](AUDIT_ARCHITECTURE.md) ARCH06.

---

## Tokens dans `tailwind.config.js` (réels)

Ces clés existent. Les utiliser via les classes Tailwind générées (`bg-page`, `bg-surface`, `text-ink`, `border-line`, …).

| Token | Rôle | Valeur actuelle |
|---|---|---|
| `page` | Fond de page | `#000000` |
| `surface` / `surface-raised` / `surface-hover` | Cartes, panneaux | `#0a0a0a` / `#171717` / `#262626` |
| `overlay` | Voile modal | `rgba(0,0,0,0.72)` |
| `ink` / `ink-secondary` / `ink-muted` / `ink-disabled` | Texte | `#f8fafc` / `#a3a3a3` / `#737373` / `#525252` |
| `line` / `line-subtle` / `line-focus` | Bordures, focus | `#262626` / `#1f1f1f` / `#60a5fa` |
| `elevated` | Panneau / empty | `#171717` (= `surface-raised`) |
| `primary` / `primary-hover` | Action principale | `#2563eb` / `#3b82f6` |
| `success` / `success-hover` | Succès | `#16a34a` / `#22c55e` |
| `warning` / `warning-hover` | Attention | `#d97706` / `#f59e0b` |
| `danger` / `danger-hover` / `danger-muted` | Danger | `#e11d48` / `#f43f5e` / `#fb7185` |
| `surface-active` | Hover secondaire | `#404040` |

`index.css` : fond `body` = page, texte = ink, focus visible clavier `#93c5fd`. Police Inter.

Lot **19** livré : les primitives listées n’utilisent plus `blue-600` / `neutral-*` / `rose-*`. Les écrans métier peuvent encore avoir des classes brutes — ce n’est pas ce lot.

---

## Primitives (`src/shared/ui/`)

Lot **18** livré : le dossier canonique est `shared/ui/`. `src/components/ui/` réexporte. Tokens : lot **19** livré sur les primitives listées.

| Fichier | Rôle |
|---|---|
| `Button.tsx` | `primary` / `secondary` / `ghost` / `danger` — tokens `primary`, `surface`, `ink`, `danger` |
| `IconButton.tsx` | Action 44 px |
| `Card.tsx`, `CardLink.tsx` | Conteneurs |
| `Input.tsx`, `Select.tsx`, `DateInput.tsx` | Champs |
| `Modal.tsx` | Dialogue |
| `PageHeader.tsx` | Titre de page |
| `EmptyState.tsx`, `ErrorState.tsx` | Vide / erreur (une erreur ≠ écran blanc) |
| `TabList.tsx` | Onglets |
| `ListRow.tsx` | Ligne de liste |
| `OverflowMenu.tsx` | Menu ⋯ (Échap + focus : lot 10g) |
| `Toast.tsx` | Toasts |
| `UnitToggle.tsx` | kg / lbs |
| `PageSkeleton.tsx`, `PageTransition.tsx` | Chargement / transition |
| `Sparkline.tsx`, `ProgressRing.tsx` | Viz — couleurs brutes **autorisées** après le lot 19 |
| `AnimatedList.tsx` | Liste animée |

Écrans métier (`components/workout`, `coaching`, …) : **pas** un restyle total au lot 19. Seulement les primitives listées ci-dessus.

---

## Règles pour un agent

1. Nouveau contrôle générique → une primitive existante, pas une `div` + `bg-blue-600` recopiée.
2. Texte visible → i18n (`fr.ts` / `en.ts`), pas une chaîne en dur.
3. Graphes / disques haltéro / sparkline : exception couleurs brutes documentée.
4. Lot 19 livré : nouvelles primitives = tokens (`bg-primary`, `text-ink`, …), pas `blue-600` recopié. Pas de restyle métier ici.
5. `strict: true` est déjà dans `tsconfig.app.json`. Ne pas ajouter de flags TS extra « pour l’archi ».
