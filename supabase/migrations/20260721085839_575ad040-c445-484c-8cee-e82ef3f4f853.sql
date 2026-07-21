CREATE OR REPLACE FUNCTION public.grant_super_admin_by_email(_email text, _note text DEFAULT NULL::text, _actor_id uuid DEFAULT NULL::uuid)
RETURNS TABLE(user_id uuid, email text, granted_at timestamp with time zone)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public', 'private', 'pg_temp'
AS $function$
DECLARE
  _caller UUID := COALESCE(auth.uid(), _actor_id);
  _actor_email TEXT;
  _target public.user_roles%ROWTYPE;
  _target_id UUID;
  _target_email TEXT;
  _seeded BOOLEAN;
BEGIN
  IF _caller IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT private.has_role(_caller, 'super_admin'::public.app_role) THEN
    RAISE EXCEPTION 'forbidden: super_admin required' USING ERRCODE = '42501';
  END IF;

  SELECT u.id, lower(u.email) INTO _target_id, _target_email
    FROM auth.users u
    WHERE lower(u.email) = lower(_email) AND u.email_confirmed_at IS NOT NULL;
  IF _target_id IS NULL THEN RAISE EXCEPTION 'user_not_found_or_unconfirmed'; END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.super_admin_seed_emails s WHERE s.email = _target_email
  ) INTO _seeded;
  IF NOT _seeded THEN
    INSERT INTO public.super_admin_seed_emails (email, note, created_by)
    VALUES (_target_email, COALESCE(_note, 'Granted via admin console'), _caller);
  END IF;

  INSERT INTO public.user_roles (user_id, role, granted_by)
  VALUES (_target_id, 'super_admin'::public.app_role, _caller)
  ON CONFLICT ON CONSTRAINT user_roles_user_id_role_key
  DO UPDATE SET granted_at = now(), granted_by = EXCLUDED.granted_by
  RETURNING public.user_roles.* INTO _target;

  SELECT u.email INTO _actor_email FROM auth.users u WHERE u.id = _caller;
  INSERT INTO public.audit_log (actor_id, actor_email, actor_role, action, target, meta)
  VALUES (_caller, _actor_email, 'super_admin', 'role.super_admin.grant', _target_id::text,
          jsonb_build_object('email', _target_email, 'note', _note));

  RETURN QUERY SELECT _target.user_id, _target_email, _target.granted_at;
END;
$function$;

REVOKE ALL ON FUNCTION public.grant_super_admin_by_email(text, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.grant_super_admin_by_email(text, text, uuid) TO service_role;