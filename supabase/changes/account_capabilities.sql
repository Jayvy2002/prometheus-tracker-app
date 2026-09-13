-- M1 compatibility phase. Test on the isolated database before CLI promotion.
-- user_roles remains the write authority until callers migrate together.
CREATE TABLE IF NOT EXISTS public.user_capabilities (
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 capability text NOT NULL CHECK (capability = 'coach'),
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(user_id, capability)
);
ALTER TABLE public.user_capabilities ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.user_capabilities FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.user_capabilities TO authenticated;
GRANT ALL ON public.user_capabilities TO service_role;
DROP POLICY IF EXISTS user_reads_own_capabilities ON public.user_capabilities;
CREATE POLICY user_reads_own_capabilities ON public.user_capabilities
 FOR SELECT TO authenticated USING(user_id=(SELECT auth.uid()));

CREATE OR REPLACE FUNCTION public.sync_legacy_coach_capability()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF TG_OP='DELETE' THEN
  DELETE FROM public.user_capabilities WHERE user_id=OLD.user_id AND capability='coach';
  RETURN OLD;
 END IF;
 IF NEW.coaching_role='coach' THEN
  INSERT INTO public.user_capabilities(user_id,capability) VALUES(NEW.user_id,'coach')
  ON CONFLICT(user_id,capability) DO NOTHING;
 ELSE
  DELETE FROM public.user_capabilities WHERE user_id=NEW.user_id AND capability='coach';
 END IF;
 RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.sync_legacy_coach_capability() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS sync_legacy_coach_capability ON public.user_roles;
CREATE TRIGGER sync_legacy_coach_capability
 AFTER INSERT OR UPDATE OF coaching_role OR DELETE ON public.user_roles
 FOR EACH ROW EXECUTE FUNCTION public.sync_legacy_coach_capability();

INSERT INTO public.user_capabilities(user_id,capability)
 SELECT user_id,'coach' FROM public.user_roles WHERE coaching_role='coach'
 ON CONFLICT(user_id,capability) DO NOTHING;

-- One snapshot, no caller-controlled account ID and no client dossier.
CREATE OR REPLACE FUNCTION public.get_my_account_context()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT CASE WHEN auth.uid() IS NULL THEN jsonb_build_object('error','not_authenticated')
 ELSE jsonb_build_object(
  'user_id',auth.uid(),
  'coach_capability',EXISTS(SELECT 1 FROM public.user_capabilities WHERE user_id=auth.uid() AND capability='coach'),
  'active_coach_id',(SELECT coach_id FROM public.coach_client_links WHERE client_id=auth.uid() AND status='active'),
  'legacy_coaching_role',COALESCE((SELECT coaching_role FROM public.user_roles WHERE user_id=auth.uid()),'none')
 ) END;
$$;
REVOKE ALL ON FUNCTION public.get_my_account_context() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_account_context() TO authenticated;
