# P1.4 — Lifecycle marketplace avec confirmation finale Athlète

## Contrat

Une acceptation Coach ne crée jamais `coach_client_links.active`. Le dernier consentement
appartient à l’athlète. Ce n’est pas un paiement, ni un abonnement.

```text
pending
→ coach_accepted          # Coach accepte de poursuivre (prospect)
→ athlete_confirmed       # l’athlète confirme → relation active
```

Fermetures : `declined` (Coach, depuis `pending`), `withdrawn` (athlète, depuis
`pending` ou `coach_accepted`).

La conversation prospect dans la messagerie est **P4.3**. P1.4 pose l’état
`coach_accepted` ; les messages restent derrière une relation active.

## Vérité serveur

Migration append-only `20260918130232_marketplace_athlete_confirm` (appliquée
en production, même timestamp).

- Statuts stockés : `pending | accepted | coach_accepted | athlete_confirmed | declined | withdrawn`.
  `accepted` est un état historique terminal de l’ancien contrat (acceptation Coach =
  activation directe). La migration ne le réécrit pas en `athlete_confirmed` : cette
  confirmation athlète n’a jamais eu lieu. Les nouvelles écritures ne produisent plus
  `accepted` (`pending → coach_accepted → athlete_confirmed`).
- Index unique ouvert : `(coach_id, client_id)` tant que `pending` ou `coach_accepted`.
- `request_coaching` : réutilise une demande `pending` ou `coach_accepted` existante ;
  `already_coached` si un lien actif existe.
- `respond_coaching_request` :
  - Coach `accepted` → `coach_accepted` uniquement depuis `pending`. Pas d’activation,
    pas de consentement dossier, pas de retrait des autres demandes.
  - Coach `declined` depuis `pending`.
  - Athlète `withdrawn` depuis `pending` ou `coach_accepted`.
  - Athlète `confirmed` depuis `coach_accepted` : `activate_coaching_relationship`,
    consentement v2, retrait des autres `pending`/`coach_accepted`, statut
    `athlete_confirmed`.
  - Replay : si le statut vaut déjà la cible, retour sans ré-activer.
  - Une ligne historique `accepted` reste `accepted` et lève `request_closed` (pas de
    nouvelle relation, pas de réactivation après départ).
- `activate_coaching_relationship` n’est pas GRANT à `authenticated` ni `anon`.
  Le verrou `user_roles` + l’index `coach_client_one_active_coach` empêchent deux
  suivis actifs.

## Câblage UI

- Coach, demande `pending` : Accepter de poursuivre / Refuser + texte prospect.
- Athlète, demande `coach_accepted` : Confirmer ce coach / Retirer ma demande.
- Une demande `athlete_confirmed` affiche l’événement historique, puis l’état courant lu
  dans `coach_client_links` (actif / terminé / indisponible). Ce n’est pas un paiement.
- Une demande historique `accepted` est affichée selon le lien réel
  (`coach_id` + `client_id`), sans prétendre qu’une confirmation athlète a eu lieu.
  Le consentement n’est pas la source de l’état courant.
- Télémétrie : `coaching_request_accepted` au clic Coach ; `marketplace_athlete_confirmed`
  à la confirmation athlète.

## Hors scope

P4.3 messagerie prospect. P1.5 durées commerciales. Paiement / Stripe.
Édition du plan Coach. Matching avancé (P4.1–P4.2).

## Livraison

PR [#189](https://github.com/Jayvy2002/prometheus-tracker-app/pull/189) mergée dans `new-JV`
(`ced733516a4351eed5bed629794fe8ff3de87621`). Production : 116e version
`20260918130232_marketplace_athlete_confirm`. `activate_coaching_relationship` reste
interne. Leftover `accepted` inchangé.
