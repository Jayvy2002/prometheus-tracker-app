-- Durable, minimal notice for the former coach. No access to the former client dossier.
CREATE TABLE IF NOT EXISTS public.coach_relationship_notices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_name text NOT NULL DEFAULT '',
  ended_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz,
  CONSTRAINT coach_relationship_notice_distinct CHECK (coach_id <> client_id)
);
ALTER TABLE public.coach_relationship_notices ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.coach_relationship_notices FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.coach_relationship_notices TO authenticated;
GRANT ALL ON public.coach_relationship_notices TO service_role;
DROP POLICY IF EXISTS coach_reads_relationship_notices ON public.coach_relationship_notices;
CREATE POLICY coach_reads_relationship_notices ON public.coach_relationship_notices
  FOR SELECT TO authenticated USING (coach_id = (SELECT auth.uid()));
CREATE INDEX IF NOT EXISTS coach_relationship_notices_unread_idx
  ON public.coach_relationship_notices(coach_id, ended_at DESC) WHERE read_at IS NULL;

CREATE INDEX IF NOT EXISTS coach_relationship_notices_coach_idx ON public.coach_relationship_notices(coach_id);
CREATE INDEX IF NOT EXISTS coach_relationship_notices_client_idx ON public.coach_relationship_notices(client_id);

CREATE OR REPLACE FUNCTION public.dismiss_coach_relationship_notice(p_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN jsonb_build_object('ok',false,'error','not_authenticated'); END IF;
  UPDATE public.coach_relationship_notices SET read_at = COALESCE(read_at, now())
    WHERE id=p_id AND coach_id=auth.uid();
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'error','not_found'); END IF;
  RETURN jsonb_build_object('ok',true);
END; $$;
REVOKE ALL ON FUNCTION public.dismiss_coach_relationship_notice(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dismiss_coach_relationship_notice(uuid) TO authenticated;

-- Candidate: isolated replay only. Generate a migration with the CLI after validation.
-- Both initiators use the same transition; its active link is locked before writes.
CREATE OR REPLACE FUNCTION public.transition_client_to_solo(p_coach_id uuid, p_client_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$ DECLARE v_updated int; BEGIN IF p_coach_id IS NULL OR p_client_id IS NULL OR p_coach_id = p_client_id THEN RETURN jsonb_build_object('ok', false, 'error', 'invalid_pair'); END IF; PERFORM 1 FROM public.coach_client_links WHERE coach_id = p_coach_id AND client_id = p_client_id AND status = 'active' FOR UPDATE; IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'not_linked'); END IF; UPDATE public.program_assignments SET status = 'paused', updated_at = now() WHERE client_id = p_client_id AND assigned_by = p_coach_id AND status = 'active'; UPDATE public.coach_client_links SET status = 'ended', updated_at = now() WHERE coach_id = p_coach_id AND client_id = p_client_id AND status = 'active'; GET DIAGNOSTICS v_updated = ROW_COUNT; IF v_updated = 0 THEN RETURN jsonb_build_object('ok', false, 'error', 'not_linked'); END IF; UPDATE public.user_roles SET coaching_role = 'none', updated_at = now() WHERE user_id = p_client_id AND coaching_role = 'client'; DELETE FROM public.client_tracking_config WHERE client_id = p_client_id AND coach_id = p_coach_id; UPDATE public.user_profiles SET coach_link_ended_at = now(), solo_trial_ends_at = COALESCE(solo_trial_ends_at, now() + interval '30 days'), updated_at = now() WHERE id = p_client_id; 
  IF auth.uid() = p_client_id THEN
    INSERT INTO public.coach_relationship_notices(coach_id,client_id,client_name)
    SELECT p_coach_id,p_client_id,COALESCE(
      (SELECT full_name FROM public.user_profiles WHERE id=p_client_id),'');
  END IF;

RETURN jsonb_build_object('ok', true); END; $$; REVOKE ALL ON FUNCTION public.transition_client_to_solo(uuid, uuid) FROM PUBLIC, anon, authenticated; GRANT EXECUTE ON FUNCTION public.transition_client_to_solo(uuid, uuid) TO service_role; CREATE OR REPLACE FUNCTION public.end_coach_client_link(p_client_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$ DECLARE v_uid uuid := auth.uid(); BEGIN IF v_uid IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated'); END IF; IF p_client_id = v_uid THEN RETURN jsonb_build_object('ok', false, 'error', 'cannot_end_self'); END IF; RETURN public.transition_client_to_solo(v_uid, p_client_id); END; $$; REVOKE ALL ON FUNCTION public.end_coach_client_link(uuid) FROM PUBLIC, anon; GRANT EXECUTE ON FUNCTION public.end_coach_client_link(uuid) TO authenticated;


create or replace function public.client_end_coach_link()
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_coach_id uuid; v_result jsonb;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;
  select coach_id into v_coach_id from public.coach_client_links
  where client_id = v_uid and status = 'active';
  if v_coach_id is null then
    return jsonb_build_object('ok', false, 'error', 'not_linked');
  end if;
  v_result := public.transition_client_to_solo(v_coach_id, v_uid);
  if v_result->>'ok' = 'true' then
    return v_result || jsonb_build_object('former_coach_id', v_coach_id,
      'ended_at', (SELECT coach_link_ended_at FROM public.user_profiles WHERE id=v_uid));
  end if;
  return v_result;
end;
$$;
revoke all on function public.client_end_coach_link() from public, anon;
grant execute on function public.client_end_coach_link() to authenticated;
