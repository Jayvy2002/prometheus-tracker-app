# Design system — tokens et primitives

> **Rôle** — tokens et primitives. Lot **19 livré** : les primitives listées utilisent les tokens sémantiques. Les écrans métier (`Dashboard`, séances, nutrition) peuvent encore mélanger `neutral-*` / `blue-*` — hors lot, à aligner au fil des PR produit. Diagnostic : [`AUDIT_ARCHITECTURE.md`](AUDIT_ARCHITECTURE.md) ARCH06.

---

## Tokens (réels) — `src/shared/theme/palette.ts`

Les valeurs vivent dans `src/shared/theme/palette.ts` ; `tailwind.config.js` les branche (`colors: tailwindColors()`). Les utiliser via les classes Tailwind générées (`bg-page`, `bg-surface`, `text-ink`, `border-line`, …).

| Token | Rôle | Sombre (défaut) | Clair |
|---|---|---|---|
| `page` | Fond de page | `#000000` | `#f5f5f5` |
| `surface` / `surface-raised` / `surface-hover` | Cartes, panneaux | `#0a0a0a` / `#171717` / `#262626` | `#fafafa` / `#ffffff` / `#e5e5e5` |
| `surface-active` | Hover secondaire | `#404040` | `#d4d4d4` |
| `overlay` | Voile modal | `rgba(0,0,0,0.72)` | `rgba(23,23,23,0.4)` |
| `ink` / `ink-secondary` / `ink-muted` / `ink-disabled` | Texte | `#f8fafc` / `#a3a3a3` / `#949494` / `#525252` | `#171717` / `#525252` / `#5c5c5c` / `#8c8c8c` |
| `line` / `line-subtle` / `line-focus` | Bordures, focus | `#262626` / `#1f1f1f` / `#60a5fa` | `#e5e5e5` / `#ededed` / `#2563eb` |
| `line-strong` / `line-stronger` | Bordures appuyées (hover, focus) — remplacent `[#525252]` / `[#737373]` | `#525252` / `#737373` | `#a3a3a3` / `#8c8c8c` |
| `elevated` | Panneau / empty | `#171717` | `#ffffff` |
| `primary` / `primary-hover` | Action principale | `#2563eb` / `#3b82f6` | `#2563eb` / `#1d4ed8` |
| `success` / `success-hover` | Succès | `#16a34a` / `#22c55e` | `#15803d` / `#166534` |
| `warning` / `warning-hover` | Attention | `#d97706` / `#f59e0b` | `#b45309` / `#92400e` |
| `danger` / `danger-hover` / `danger-muted` | Danger | `#e11d48` / `#f43f5e` / `#fb7185` | `#be123c` / `#9f1239` / `#be123c` |

`index.css` : fond `body` = page, texte = ink, focus visible clavier `#93c5fd` (clair : `#1d4ed8`). Police Inter.

Lot **19** livré : les primitives listées n’utilisent plus `blue-600` / `neutral-*` / `rose-*`. Les écrans métier peuvent encore avoir des classes brutes — ce n’est pas ce lot.

---

## Thème clair / sombre

**Choix** : Profil › Unités & préférences › Apparence — *Sombre* (défaut) / *Clair* / *Automatique* (suit le téléphone ; sans préférence claire du téléphone → sombre). Préférence d’appareil, dans `localStorage['prometheus-prefs'].theme` (`preferencesStore`), appliquée tout de suite.

**Mécanique**

- Toutes les couleurs Tailwind de l’app (`neutral`, `white`, `black`, les teintes `red`…`rose`, les tokens ci-dessus) valent `rgb(var(--c-…) / <alpha-value>)` : les opacités `/10`, `/50`… continuent de marcher. Les variables sombres sont sur `:root` (valeurs identiques à avant, vérifié au pixel), les claires sous `html[data-theme="light"]`.
- Avant le premier rendu, le script inline `#theme-boot` d’`index.html` lit la préférence, pose `data-theme`, `color-scheme` (`light` ou `dark` : calendrier natif, listes, cases et barres de défilement suivent le thème), `theme-color` (`#000000` / `#f5f5f5`) et la barre d’état iOS. Même logique que `src/shared/theme/theme.ts` (testé en exécutant le script).
- `startThemeSync()` (`src/app/bootstrap/themeSync.ts`) suit le changement clair/sombre du téléphone en mode Automatique.
- **Îlots sombres** : un aplat saturé (`bg-primary`, `bg-danger`, `bg-success`, `bg-warning`, `bg-<teinte>-500/600/700`, y compris `!bg-…`) garde les variables sombres à l’intérieur ; `text-white` y reste blanc (bouton primaire, bulle de message, onglet actif). Classe `theme-dark` pour forcer un îlot (disques du calculateur : couleurs physiques). Les interrupteurs `role="switch"` gardent un bouton blanc.
- Voiles : `bg-overlay` et tout `fixed inset-0 bg-black/…` restent un voile sombre en clair.
- Graphiques (Recharts / SVG) : `useChartColors()` (`src/shared/theme/chartColors.ts`) ; un style inline peut lire `rgb(var(--c-…))`.

**Règles pour une nouvelle couleur**

1. Classe Tailwind de la palette ou token : rien à faire, elle suit le thème.
2. Pas de `-[#hex]` ni de `gray`/`slate`/`zinc`/`stone` (non thémés ; un test le vérifie).
3. Texte blanc sur un fond coloré : fond plein `bg-<teinte>-600` (îlot) ou `theme-dark`.
4. Couleur en attribut SVG : `useChartColors()`.

**Correspondance claire**

- Gris inversés : 100–600 (textes) deviennent des encres foncées, 700–950 (bordures, fonds) des gris clairs. `neutral` clair : 50 `#0a0a0a`, 100 `#171717`, 200 `#262626`, 300 `#404040`, 400 `#525252`, 500 `#5c5c5c`, 600 `#666666`, 700 `#d4d4d4`, 800 `#e5e5e5`, 900 `#ffffff`, 950 `#fafafa`. `white` → `#171717`, `black` → `#f5f5f5`.
- Teintes : 50–200 → 900 ; 300 → 800 ; 400–600 → nuance « texte » T ; 700 → T+100 ; 800 → 300 ; 900 → 200 ; 950 → 100. T = la plus claire qui tient 4,5:1 sur blanc, `#f5f5f5`, `#fafafa`, `#e5e5e5` et sur sa propre teinte à 20 % : 700 pour blue, indigo, violet, purple ; 800 pour les autres.

**Contrastes mesurés en clair** (`src/shared/theme/themePalette.test.ts`)

| Texte | Valeur | sur page `#f5f5f5` | sur carte `#ffffff` | sur puce `#e5e5e5` |
|---|---|---|---|---|
| `text-white` / `ink` (texte principal) | `#171717` | 16,44 | 17,93 | 14,23 |
| `neutral-300` | `#404040` | 9,51 | 10,37 | 8,23 |
| `neutral-400` / `ink-secondary` | `#525252` | 7,17 | 7,81 | 6,20 |
| `neutral-500` / `ink-muted` | `#5c5c5c` | 6,13 | 6,69 | 5,31 |
| `neutral-600` | `#666666` | 5,27 | 5,74 | 4,56 |
| `ink-disabled` (désactivé, hors AA) | `#8c8c8c` | 3,08 | 3,36 | 2,67 |

| Teinte | T | `…-400` clair | sur blanc | sur page | sur sa teinte 20 % |
|---|---|---|---|---|---|
| blue | 700 | `#1d4ed8` | 6,70 | 6,15 | 4,52 |
| emerald | 800 | `#065f46` | 7,68 | 7,05 | 5,13 |
| amber | 800 | `#92400e` | 7,09 | 6,50 | 4,78 |
| rose | 800 | `#9f1239` | 8,02 | 7,35 | 5,14 |
| sky | 800 | `#075985` | 7,56 | 6,94 | 5,06 |
| teal | 800 | `#115e59` | 7,58 | 6,96 | 5,10 |
| cyan | 800 | `#155e75` | 7,27 | 6,67 | 4,91 |
| violet | 700 | `#6d28d9` | 7,10 | 6,52 | 4,69 |
| orange / yellow / lime / green | 800 | `#9a3412` / `#854d0e` / `#3f6212` / `#166534` | ≥ 6,85 | ≥ 6,28 | ≥ 4,66 |
| red / fuchsia / pink / indigo / purple | 800 / 800 / 800 / 700 / 700 | — | ≥ 6,98 | ≥ 6,41 | ≥ 4,60 |

Tokens texte sur blanc / page : `primary` 5,17 / 4,74 ; `success` 5,02 / 4,60 ; `warning` 5,02 / 4,61 ; `danger` 6,29 / 5,76. Focus clavier `#1d4ed8` : 6,70. Texte blanc sur `bg-blue-600` (îlot) : 5,17. Sombre inchangé : `neutral-500` 6,92 sur noir, 5,91 sur `#171717`.

Logo : `logo.svg` est blanc ; toute image du logo porte la classe `logo-mark`, qui l’assombrit en clair (`filter: invert(0.91)` ≈ `#171717`). La page `offline.html` applique la même préférence de thème que l’app.

Limites connues : l’écran de lancement du système (avant que l’app ne s’affiche) vient de `manifest.json` (`#000000`), fixe par nature : il ne peut pas suivre un choix fait dans l’app, et reste noir comme le thème par défaut ; l’écran de chargement de l’app, lui, suit le thème. La barre d’état iOS n’est relue qu’au lancement de la PWA.

---

## Primitives (`src/shared/ui/`)

Lot **18** livré : le dossier canonique est `shared/ui/`. `src/components/ui/` réexporte. Tokens : lot **19** livré sur les primitives listées.

| Fichier | Rôle |
|---|---|
| `Button.tsx` | `primary` / `secondary` / `ghost` / `danger` — tokens `primary`, `surface`, `ink`, `danger` |
| `IconButton.tsx` | Action 44 px |
| `Card.tsx`, `CardLink.tsx` | Conteneurs |
| `Input.tsx`, `Select.tsx` | Champs |
| `DateField.tsx` | Date dans la langue de l’app (FR jj/mm/aaaa, EN mm/dd/yyyy), pas celle du téléphone ; bouton calendrier 44 px qui ouvre le sélecteur natif ; échange toujours l’ISO `YYYY-MM-DD` ; date impossible ou hors bornes = erreur, jamais envoyée. Aucun `<input type="date">` visible ailleurs. `DateInput.tsx` = le même champ pour la date de séance du logger (horodatage à midi local) |
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
3. Graphes / disques haltéro / sparkline : couleurs via `useChartColors()` ou îlot `theme-dark` (voir « Thème clair / sombre »).
4. Lot 19 livré : nouvelles primitives = tokens (`bg-primary`, `text-ink`, …), pas `blue-600` recopié. Pas de restyle métier ici.
5. `strict: true` est déjà dans `tsconfig.app.json`. Ne pas ajouter de flags TS extra « pour l’archi ».
