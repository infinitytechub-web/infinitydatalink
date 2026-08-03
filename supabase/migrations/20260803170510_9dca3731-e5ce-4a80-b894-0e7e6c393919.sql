CREATE OR REPLACE FUNCTION public.delete_log_recycle_bin_entries(_ids uuid[])
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _caller uuid := auth.uid();
  _count int := 0;
  _actor_email text;
  _summary jsonb := '[]'::jsonb;
BEGIN
  IF _caller IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT private.has_role(_caller, 'super_admin'::public.app_role) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF _ids IS NULL OR array_length(_ids, 1) IS NULL THEN RETURN 0; END IF;
  IF array_length(_ids, 1) > 500 THEN RAISE EXCEPTION 'too_many_rows'; END IF;

  WITH removed AS (
    DELETE FROM public.recycle_bin rb
    WHERE rb.id = ANY(_ids)
      AND rb.entity_table IN ('audit_log', 'runtime_error_logs')
    RETURNING rb.id, rb.entity_table, rb.entity_id, rb.deleted_at
  )
  SELECT count(*),
         COALESCE(jsonb_agg(jsonb_build_object(
           'bin_id', r.id,
           'entity_table', r.entity_table,
           'entity_id', r.entity_id,
           'purged_at', r.deleted_at
         )), '[]'::jsonb)
    INTO _count, _summary
  FROM removed r;

  SELECT email INTO _actor_email FROM auth.users WHERE id = _caller;
  INSERT INTO public.audit_log(actor_id, actor_email, actor_role, action, target, meta)
  VALUES (_caller, _actor_email, 'super_admin', 'system.log_permanent_delete', 'recycle_bin',
    jsonb_build_object('deleted', _count, 'entries', _summary));

  RETURN _count;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_log_recycle_bin_entries(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_log_recycle_bin_entries(uuid[]) TO authenticated;