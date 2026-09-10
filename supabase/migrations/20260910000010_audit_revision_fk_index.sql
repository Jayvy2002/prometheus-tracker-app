-- Audit lot 7 (suivi vérification finale) : index FK manquant sur program_revisions.created_by.
-- La migration 00008 a créé la table avec FK vers auth.users SANS index dédié ;
-- l'advisor "unindexed foreign keys" l'a signalé. Correctif additif et idempotent.
-- Note : appliqué manuellement en prod pendant la vérification ; rejouer ici pour l'historique.

CREATE INDEX IF NOT EXISTS program_revisions_created_by_idx
  ON public.program_revisions (created_by);
