## Chantier

- Priorité / sous-tâche : `P?.?`
- Vision / règle concernée :
- Problème observé dans l’existant :

## Ce que cette PR change

Décrire la capacité livrée, pas seulement les fichiers modifiés.

## Ce que cette PR ne change pas

Lister explicitement les sujets proches laissés hors scope afin d’éviter le scope creep.

## Contrat produit

- [ ] J’ai lu `docs/VISION.md` et `docs/CHANTIER.md`.
- [ ] La solution respecte `docs/CARTE_PRODUIT.md` et `docs/ARCHITECTURE.md`.
- [ ] Je réutilise les primitives existantes avant d’en créer de nouvelles.
- [ ] Solo / Coaché / Coach / Coach lui-même Coaché ont été considérés lorsque pertinent.
- [ ] Les permissions dépendent de la ressource/relation/action, pas seulement d’une persona UI.
- [ ] L’IA ne gagne aucune autorité d’application automatique.
- [ ] L’historique utilisateur/programme n’est pas réécrit silencieusement.

## Backend / sécurité

- [ ] Aucune migration appliquée n’a été modifiée ; toute évolution DB est append-only.
- [ ] RLS/RPC/ownership ont été vérifiés si le backend est touché.
- [ ] Aucun secret ou contenu privé n’est ajouté au frontend/télémétrie.
- [ ] Les writes critiques sont atomiques/idempotents lorsque nécessaire.
- [ ] Un état UI de succès n’est affiché qu’après confirmation de persistance.

## UX

- [ ] FR/EN cohérents.
- [ ] Mobile + desktop vérifiés lorsque l’UI change.
- [ ] Loading / empty / error / retry traités.
- [ ] Accessibilité essentielle vérifiée.
- [ ] Comportement offline/réseau explicitement défini.

## Preuves

- [ ] `npm audit --audit-level=critical`
- [ ] `npm test`
- [ ] `npm run typecheck`
- [ ] `npm run lint`
- [ ] `npm run build`
- [ ] `npm run verify:migrations`
- [ ] `npm run verify:edges`
- [ ] `npm run test:rls` si RLS/RPC/sécurité concernés
- [ ] Test navigateur/E2E ajouté ou exécuté si le parcours utilisateur le nécessite

## Documentation et roadmap

- [ ] `docs/CHANTIER.md` reflète le nouvel état de la sous-tâche.
- [ ] Les docs durables sont mises à jour si le contrat a changé.
- [ ] Les anciens audits n’ont pas été utilisés pour contourner la Vision actuelle.

## Risques / rollback

- Risques connus :
- Stratégie de rollback ou de désactivation :
