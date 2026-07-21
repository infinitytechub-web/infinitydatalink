
-- Admin role management RPCs
CREATE OR REPLACE FUNCTION public.admin_assign_role(
  _target_user uuid,
  _role public.app_role,
  _actor_id uuid,
  _note text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  v_actor_email text;
  v_target_email text;
BEGIN
  IF NOT private.is_admin(_actor_id) THEN
    RAISE EXCEPTION 'Forbidden: admin role required';
  END IF;
  IF _role = 'super_admin' THEN
    RAISE EXCEPTION 'Use grant_super_admin_by_email to assign super_admin';
  END IF;

  INSERT INTO public.user_roles(user_id, role, granted_by)
  VALUES (_target_user, _role, _actor_id)
  ON CONFLICT (user_id, role) DO NOTHING;

  SELECT email INTO v_actor_email FROM auth.users WHERE id = _actor_id;
  SELECT email INTO v_target_email FROM auth.users WHERE id = _target_user;

  INSERT INTO public.audit_log(actor_id, actor_email, actor_role, action, target, meta)
  VALUES (
    _actor_id, v_actor_email, 'super_admin',
    'role.assign', _target_user::text,
    jsonb_build_object('role', _role, 'target_email', v_target_email, 'note', _note)
  );
END; $$;

CREATE OR REPLACE FUNCTION public.admin_revoke_role(
  _target_user uuid,
  _role public.app_role,
  _actor_id uuid,
  _reason text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  v_actor_email text;
  v_target_email text;
BEGIN
  IF NOT private.is_admin(_actor_id) THEN
    RAISE EXCEPTION 'Forbidden: admin role required';
  END IF;
  IF _role = 'super_admin' THEN
    RAISE EXCEPTION 'Use revoke_super_admin to remove super_admin';
  END IF;
  IF _role = 'member' THEN
    RAISE EXCEPTION 'Member role cannot be revoked';
  END IF;
  IF _reason IS NULL OR length(btrim(_reason)) < 3 THEN
    RAISE EXCEPTION 'Reason is required';
  END IF;

  DELETE FROM public.user_roles WHERE user_id = _target_user AND role = _role;

  SELECT email INTO v_actor_email FROM auth.users WHERE id = _actor_id;
  SELECT email INTO v_target_email FROM auth.users WHERE id = _target_user;

  INSERT INTO public.audit_log(actor_id, actor_email, actor_role, action, target, meta)
  VALUES (
    _actor_id, v_actor_email, 'super_admin',
    'role.revoke', _target_user::text,
    jsonb_build_object('role', _role, 'target_email', v_target_email, 'reason', _reason)
  );
END; $$;

REVOKE ALL ON FUNCTION public.admin_assign_role(uuid, public.app_role, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_revoke_role(uuid, public.app_role, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_assign_role(uuid, public.app_role, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_revoke_role(uuid, public.app_role, uuid, text) TO service_role;
