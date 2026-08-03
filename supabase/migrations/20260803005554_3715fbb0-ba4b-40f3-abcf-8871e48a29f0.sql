CREATE OR REPLACE FUNCTION public.admin_set_role_permissions(_role text, _capabilities text[], _actor uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
DECLARE _email text; _actor_role text; _count integer; _before text[];
BEGIN
  IF _actor IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF _role IS NULL OR btrim(_role) = '' THEN RAISE EXCEPTION 'role_required'; END IF;
  IF _role = 'super_admin' THEN RAISE EXCEPTION 'super_admin_matrix_immutable'; END IF;
  IF NOT private.has_permission(_actor, 'users', 'manage') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT array_agg(module || '.' || action ORDER BY module, action) INTO _before
  FROM public.role_permissions WHERE role = _role;

  DELETE FROM public.role_permissions WHERE role = _role;

  INSERT INTO public.role_permissions (role, module, action)
  SELECT _role, split_part(cap, '.', 1), split_part(cap, '.', 2)
  FROM unnest(coalesce(_capabilities, ARRAY[]::text[])) AS cap
  WHERE split_part(cap, '.', 1) <> '' AND split_part(cap, '.', 2) <> ''
  ON CONFLICT DO NOTHING;

  SELECT count(*)::int INTO _count FROM public.role_permissions WHERE role = _role;

  SELECT email INTO _email FROM auth.users WHERE id = _actor;
  SELECT ur.role::text INTO _actor_role FROM public.user_roles ur WHERE ur.user_id = _actor LIMIT 1;
  INSERT INTO public.audit_log (actor_id, actor_email, actor_role, action, target, meta)
  VALUES (_actor, _email, coalesce(_actor_role, 'member'), 'permissions.matrix.updated', _role,
          jsonb_build_object('role', _role, 'before', coalesce(_before, ARRAY[]::text[]),
                             'after', coalesce(_capabilities, ARRAY[]::text[]), 'count', _count));
  RETURN _count;
END; $$;

REVOKE ALL ON FUNCTION public.admin_set_role_permissions(text, text[], uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_role_permissions(text, text[], uuid) TO service_role;