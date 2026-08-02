-- Actor-parameter variants of the membership decision routines, callable by the
-- app server (service_role) which has already authenticated the officer.
-- The role check is repeated here so the routines remain fail-closed.

CREATE OR REPLACE FUNCTION public.approve_user(_uid uuid, _note text, _actor uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _actor_email text; _target_email text; _role text;
BEGIN
  IF _actor IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT (private.has_role(_actor,'super_admin'::public.app_role)
       OR private.has_role(_actor,'compliance_officer'::public.app_role)) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  UPDATE public.profiles
     SET status='approved', approved_at=now(), approved_by=_actor, rejection_reason=NULL
   WHERE id=_uid;
  SELECT email INTO _actor_email FROM auth.users WHERE id=_actor;
  SELECT email INTO _target_email FROM auth.users WHERE id=_uid;
  _role := CASE WHEN private.has_role(_actor,'super_admin'::public.app_role)
                THEN 'super_admin' ELSE 'compliance_officer' END;
  INSERT INTO public.audit_log (actor_id, actor_email, actor_role, action, target, meta)
  VALUES (_actor, _actor_email, _role, 'user.approved', _uid::text,
          jsonb_build_object('email', _target_email, 'note', _note));
END;
$$;

CREATE OR REPLACE FUNCTION public.reject_user(_uid uuid, _reason text, _actor uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _actor_email text; _target_email text; _role text;
BEGIN
  IF _actor IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT (private.has_role(_actor,'super_admin'::public.app_role)
       OR private.has_role(_actor,'compliance_officer'::public.app_role)) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF _reason IS NULL OR length(btrim(_reason)) < 3 THEN
    RAISE EXCEPTION 'reason_required';
  END IF;
  UPDATE public.profiles
     SET status='rejected', rejection_reason=_reason, approved_at=NULL, approved_by=_actor
   WHERE id=_uid;
  SELECT email INTO _actor_email FROM auth.users WHERE id=_actor;
  SELECT email INTO _target_email FROM auth.users WHERE id=_uid;
  _role := CASE WHEN private.has_role(_actor,'super_admin'::public.app_role)
                THEN 'super_admin' ELSE 'compliance_officer' END;
  INSERT INTO public.audit_log (actor_id, actor_email, actor_role, action, target, meta)
  VALUES (_actor, _actor_email, _role, 'user.rejected', _uid::text,
          jsonb_build_object('email', _target_email, 'reason', _reason));
END;
$$;

CREATE OR REPLACE FUNCTION public.set_user_active(_uid uuid, _active boolean, _reason text, _actor uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _actor_email text; _target_email text; _role text;
BEGIN
  IF _actor IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT (private.has_role(_actor,'super_admin'::public.app_role)
       OR private.has_role(_actor,'compliance_officer'::public.app_role)) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  UPDATE public.profiles
     SET status = CASE WHEN _active THEN 'approved' ELSE 'deactivated' END,
         rejection_reason = CASE WHEN _active THEN NULL ELSE _reason END
   WHERE id=_uid;
  SELECT email INTO _actor_email FROM auth.users WHERE id=_actor;
  SELECT email INTO _target_email FROM auth.users WHERE id=_uid;
  _role := CASE WHEN private.has_role(_actor,'super_admin'::public.app_role)
                THEN 'super_admin' ELSE 'compliance_officer' END;
  INSERT INTO public.audit_log (actor_id, actor_email, actor_role, action, target, meta)
  VALUES (_actor, _actor_email, _role,
          CASE WHEN _active THEN 'user.activated' ELSE 'user.deactivated' END,
          _uid::text, jsonb_build_object('email', _target_email, 'reason', _reason));
END;
$$;

REVOKE ALL ON FUNCTION public.approve_user(uuid, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reject_user(uuid, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_user_active(uuid, boolean, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.approve_user(uuid, text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.reject_user(uuid, text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.set_user_active(uuid, boolean, text, uuid) TO service_role;