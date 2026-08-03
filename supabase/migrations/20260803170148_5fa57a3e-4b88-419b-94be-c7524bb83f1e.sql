CREATE OR REPLACE FUNCTION public.restore_audit_log_entries(_ids uuid[])
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

  WITH picked AS (
    SELECT rb.id, rb.payload
    FROM public.recycle_bin rb
    WHERE rb.id = ANY(_ids)
      AND rb.entity_table = 'audit_log'
  ), inserted AS (
    INSERT INTO public.audit_log (id, actor_id, actor_email, actor_role, action, target, meta, created_at)
    SELECT (p.payload->>'id')::uuid,
           NULLIF(p.payload->>'actor_id','')::uuid,
           p.payload->>'actor_email',
           p.payload->>'actor_role',
           p.payload->>'action',
           p.payload->>'target',
           COALESCE(p.payload->'meta', '{}'::jsonb),
           COALESCE((p.payload->>'created_at')::timestamptz, now())
    FROM picked p
    ON CONFLICT (id) DO NOTHING
    RETURNING id
  ), cleared AS (
    DELETE FROM public.recycle_bin rb
    USING picked p
    WHERE rb.id = p.id
    RETURNING 1
  )
  SELECT count(*) INTO _count FROM inserted;

  SELECT email INTO _actor_email FROM auth.users WHERE id = _caller;
  INSERT INTO public.audit_log(actor_id, actor_email, actor_role, action, target, meta)
  VALUES (_caller, _actor_email, 'super_admin', 'system.log_restore', 'audit_log',
    jsonb_build_object('restored', _count, 'ids', to_jsonb(_ids)));

  RETURN _count;
END;
$$;

CREATE OR REPLACE FUNCTION public.restore_runtime_error_logs(_ids uuid[])
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

  WITH picked AS (
    SELECT rb.id, rb.payload
    FROM public.recycle_bin rb
    WHERE rb.id = ANY(_ids)
      AND rb.entity_table = 'runtime_error_logs'
  ), inserted AS (
    INSERT INTO public.runtime_error_logs
    SELECT (jsonb_populate_record(null::public.runtime_error_logs, p.payload)).*
    FROM picked p
    ON CONFLICT (id) DO NOTHING
    RETURNING id
  ), cleared AS (
    DELETE FROM public.recycle_bin rb
    USING picked p
    WHERE rb.id = p.id
    RETURNING 1
  )
  SELECT count(*) INTO _count FROM inserted;

  SELECT email INTO _actor_email FROM auth.users WHERE id = _caller;
  INSERT INTO public.audit_log(actor_id, actor_email, actor_role, action, target, meta)
  VALUES (_caller, _actor_email, 'super_admin', 'system.log_restore', 'runtime_error_logs',
    jsonb_build_object('restored', _count, 'ids', to_jsonb(_ids)));

  RETURN _count;
END;
$$;

REVOKE ALL ON FUNCTION public.restore_audit_log_entries(uuid[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.restore_runtime_error_logs(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.restore_audit_log_entries(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.restore_runtime_error_logs(uuid[]) TO authenticated;