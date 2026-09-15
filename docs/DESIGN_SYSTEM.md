# Design system — tokens et primitives

> **Rôle** — ce que le frontend **a** aujourd’hui, et ce que le lot **19** doit aligner. Pas un restyle dans le lot 17. Ordre : [`CHANTIER.md`](CHANTIER.md) lot **19** (après **18**, pour travailler dans `shared/ui`). Diagnostic : [`AUDIT_ARCHITECTURE.md`](AUDIT_ARCHITECTURE.md) ARCH06.

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

`index.css` : fond `body` = page, texte = ink, focus visible clavier `#93c5fd`. Police Inter.

**Pas encore dans le thème** (cible lot **19**, utilisées en dur aujourd’hui) :

| Intention | Classe actuelle (primitives) | Cible |
|---|---|---|
| Action principale | `bg-blue-600` | `bg-primary` (à ajouter au thème) |
| Succès | souvent `green-*` ad hoc | `bg-success` / `text-success` |
| Attention | ad hoc | `warning` |
| Danger | `bg-rose-600` | `bg-danger` / `text-danger` |

Ne pas inventer un second fichier de tokens. Une fois le lot 19 passé, les primitives n’utilisent plus `blue-600` / `neutral-*` / `rose-*`.

---

## Primitives (`src/shared/ui/`)

Lot **18** livré : le dossier canonique est `shared/ui/`. `src/components/ui/` réexporte. Tokens : lot **19**.

| Fichier | Rôle |
|---|---|
| `Button.tsx` | `primary` / `secondary` / `ghost` / `danger` — encore `blue-600` / `neutral-*` / `rose-*` |
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
4. Lot 19 : changer les classes **dans les primitives**, pas les routes ni les stores.
5. `strict: true` est déjà dans `tsconfig.app.json`. Ne pas ajouter de flags TS extra « pour l’archi ».
