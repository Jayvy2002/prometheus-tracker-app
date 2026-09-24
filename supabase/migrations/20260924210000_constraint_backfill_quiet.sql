-- La reprise des limitations saisies à l'accueil (20260924140000) insère des
-- contraintes au nom de l'athlète : le trigger notify_on_constraint les
-- prenait pour des déclarations nouvelles et mettait en file une notification
-- « contrainte déclarée » vers le Coach actif. Ce n'est pas une nouvelle : on
-- retire ces notifications, jamais envoyées, avant le premier envoi.
--
-- Ne touche que les notifications encore en attente dont l'athlète n'a
-- aucune déclaration réelle (tous ses événements de contrainte sont la
-- reprise « migrated »). Idempotente.

DELETE FROM public.notification_outbox o
 WHERE o.kind = 'constraint_declared'
   AND o.sent_at IS NULL
   AND o.claimed_at IS NULL
   AND o.dedupe_key LIKE 'constraint:%'
   AND EXISTS (
     SELECT 1 FROM public.athlete_constraint_events e
      WHERE e.user_id::text = substr(o.dedupe_key, length('constraint:') + 1)
        AND e.note = 'migrated'
   )
   AND NOT EXISTS (
     SELECT 1 FROM public.athlete_constraint_events e
      WHERE e.user_id::text = substr(o.dedupe_key, length('constraint:') + 1)
        AND e.note IS DISTINCT FROM 'migrated'
   );
