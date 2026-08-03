-- Archive selected audit_log rows into the recycle bin (super admin only).
CREATE OR REPLACE FUNCTION public.archive_audit_log_entries(_ids uuid[])
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _caller uuid := auth.uid();
  _count int := 0;
  _actor_email text;
BEGIN
  IF _caller IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT private.has_role(_caller, 'super_admin'::public.app_role) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF _ids IS NULL OR array_length(_ids, 1) IS NULL THEN RETURN 0; END IF;
  IF array_length(_ids, 1) > 500 THEN RAISE EXCEPTION 'too_many_rows'; END IF;

  WITH moved AS (
    DELETE FROM public.audit_log a
    WHERE a.id = ANY(_ids)
      AND a.action <> 'system.purge'
      AND a.action <> 'system.log_archive'
    RETURNING a.*
  ), snap AS (
    INSERT INTO public.recycle_bin (entity_table, entity_id, payload, deleted_by, purge_after)
    SELECT 'audit_log', m.id::text, to_jsonb(m), _caller, now() + interval '730 days'
    FROM moved m
    RETURNING 1
  )
  SELECT count(*) INTO _count FROM snap;

  SELECT email INTO _actor_email FROM auth.users WHERE id = _caller;
  INSERT INTO public.audit_log(actor_id, actor_email, actor_role, action, target, meta)
  VALUES (_caller, _actor_email, 'super_admin', 'system.log_archive', 'audit_log',
    jsonb_build_object('archived', _count, 'ids', to_jsonb(_ids)));

  RETURN _count;
END;
$$;

-- Archive selected runtime_error_logs rows into the recycle bin (super admin only).
CREATE OR REPLACE FUNCTION public.archive_runtime_error_logs(_ids uuid[])
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _caller uuid := auth.uid();
  _count int := 0;
  _actor_email text;
BEGIN
  IF _caller IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT private.has_role(_caller, 'super_admin'::public.app_role) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF _ids IS NULL OR array_length(_ids, 1) IS NULL THEN RETURN 0; END IF;
  IF array_length(_ids, 1) > 500 THEN RAISE EXCEPTION 'too_many_rows'; END IF;

  WITH moved AS (
    DELETE FROM public.runtime_error_logs r
    WHERE r.id = ANY(_ids)
    RETURNING r.*
  ), snap AS (
    INSERT INTO public.recycle_bin (entity_table, entity_id, payload, deleted_by, purge_after)
    SELECT 'runtime_error_logs', m.id::text, to_jsonb(m), _caller, now() + interval '730 days'
    FROM moved m
    RETURNING 1
  )
  SELECT count(*) INTO _count FROM snap;

  SELECT email INTO _actor_email FROM auth.users WHERE id = _caller;
  INSERT INTO public.audit_log(actor_id, actor_email, actor_role, action, target, meta)
  VALUES (_caller, _actor_email, 'super_admin', 'system.log_archive', 'runtime_error_logs',
    jsonb_build_object('archived', _count, 'ids', to_jsonb(_ids)));

  RETURN _count;
END;
$$;

REVOKE ALL ON FUNCTION public.archive_audit_log_entries(uuid[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.archive_runtime_error_logs(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.archive_audit_log_entries(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.archive_runtime_error_logs(uuid[]) TO authenticated;