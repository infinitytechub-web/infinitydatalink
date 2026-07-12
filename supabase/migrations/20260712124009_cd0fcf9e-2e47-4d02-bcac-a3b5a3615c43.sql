
-- ============================================================================
-- 1. Recreate admin helpers to accept an explicit actor id (for service_role
--    callers that have no auth.uid()), preserving all in-function role checks.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.approve_entity(_entity_id uuid, _note text, _actor_id uuid DEFAULT NULL)
RETURNS public.entities
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public', 'private', 'pg_temp'
AS $function$
DECLARE _uid uuid := COALESCE(auth.uid(), _actor_id); _row public.entities%ROWTYPE;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT (private.has_role(_uid,'super_admin'::public.app_role) OR private.has_role(_uid,'compliance_officer'::public.app_role)) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
  END IF;
  UPDATE public.entities SET status='active', reviewed_by=_uid, reviewed_at=now(),
    kyc_notes = COALESCE(_note, kyc_notes) WHERE id=_entity_id RETURNING * INTO _row;
  IF NOT FOUND THEN RAISE EXCEPTION 'entity_not_found'; END IF;
  PERFORM private.write_audit(_uid,'entity.approved',_row.id::text, jsonb_build_object('type',_row.type,'name',_row.name,'note',_note));
  RETURN _row;
END $function$;

CREATE OR REPLACE FUNCTION public.suspend_entity(_entity_id uuid, _reason text, _actor_id uuid DEFAULT NULL)
RETURNS public.entities
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public', 'private', 'pg_temp'
AS $function$
DECLARE _uid uuid := COALESCE(auth.uid(), _actor_id); _row public.entities%ROWTYPE;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT (private.has_role(_uid,'super_admin'::public.app_role) OR private.has_role(_uid,'compliance_officer'::public.app_role)) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
  END IF;
  UPDATE public.entities SET status='suspended', reviewed_by=_uid, reviewed_at=now(),
    kyc_notes = COALESCE(_reason, kyc_notes) WHERE id=_entity_id RETURNING * INTO _row;
  IF NOT FOUND THEN RAISE EXCEPTION 'entity_not_found'; END IF;
  PERFORM private.write_audit(_uid,'entity.suspended',_row.id::text, jsonb_build_object('type',_row.type,'name',_row.name,'reason',_reason));
  RETURN _row;
END $function$;

CREATE OR REPLACE FUNCTION public.list_super_admins(_actor_id uuid DEFAULT NULL)
RETURNS TABLE(user_id uuid, email text, full_name text, member_no text, granted_at timestamp with time zone, granted_by uuid, granted_by_email text, seeded boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public', 'private', 'pg_temp'
AS $function$
DECLARE _caller UUID := COALESCE(auth.uid(), _actor_id);
BEGIN
  IF _caller IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT private.has_role(_caller, 'super_admin'::public.app_role) THEN
    RAISE EXCEPTION 'forbidden: super_admin required' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT ur.user_id,
         u.email::text,
         p.full_name,
         p.member_no,
         ur.granted_at,
         ur.granted_by,
         gu.email::text,
         EXISTS (SELECT 1 FROM public.super_admin_seed_emails s WHERE s.email = lower(u.email))
    FROM public.user_roles ur
    JOIN auth.users u ON u.id = ur.user_id
    LEFT JOIN public.profiles p ON p.id = ur.user_id
    LEFT JOIN auth.users gu ON gu.id = ur.granted_by
   WHERE ur.role = 'super_admin'::public.app_role
   ORDER BY ur.granted_at ASC;
END;
$function$;

CREATE OR REPLACE FUNCTION public.grant_super_admin_by_email(_email text, _note text DEFAULT NULL::text, _actor_id uuid DEFAULT NULL)
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

  SELECT id, lower(email) INTO _target_id, _target_email
    FROM auth.users WHERE lower(email) = lower(_email) AND email_confirmed_at IS NOT NULL;
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
  ON CONFLICT (user_id, role) DO UPDATE SET granted_at = now(), granted_by = _caller
  RETURNING * INTO _target;

  SELECT email INTO _actor_email FROM auth.users WHERE id = _caller;
  INSERT INTO public.audit_log (actor_id, actor_email, actor_role, action, target, meta)
  VALUES (_caller, _actor_email, 'super_admin', 'role.super_admin.grant', _target_id::text,
          jsonb_build_object('email', _target_email, 'note', _note));

  RETURN QUERY SELECT _target.user_id, _target_email, _target.granted_at;
END;
$function$;

CREATE OR REPLACE FUNCTION public.revoke_super_admin(_user_id uuid, _reason text DEFAULT NULL::text, _actor_id uuid DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public', 'private', 'pg_temp'
AS $function$
DECLARE
  _caller UUID := COALESCE(auth.uid(), _actor_id);
  _remaining INT;
  _actor_email TEXT;
  _target_email TEXT;
BEGIN
  IF _caller IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT private.has_role(_caller, 'super_admin'::public.app_role) THEN
    RAISE EXCEPTION 'forbidden: super_admin required' USING ERRCODE = '42501';
  END IF;
  IF _user_id = _caller THEN
    RAISE EXCEPTION 'cannot_revoke_self' USING ERRCODE = '42501';
  END IF;

  SELECT COUNT(*) INTO _remaining FROM public.user_roles
    WHERE role = 'super_admin'::public.app_role AND user_id <> _user_id;
  IF _remaining < 1 THEN
    RAISE EXCEPTION 'last_super_admin' USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.user_roles
    WHERE user_id = _user_id AND role = 'super_admin'::public.app_role;

  SELECT lower(email) INTO _target_email FROM auth.users WHERE id = _user_id;
  DELETE FROM public.super_admin_seed_emails WHERE email = _target_email;

  SELECT email INTO _actor_email FROM auth.users WHERE id = _caller;
  INSERT INTO public.audit_log (actor_id, actor_email, actor_role, action, target, meta)
  VALUES (_caller, _actor_email, 'super_admin', 'role.super_admin.revoke', _user_id::text,
          jsonb_build_object('email', _target_email, 'reason', _reason));
END;
$function$;

-- ============================================================================
-- 2. Lock down EXECUTE privileges.
-- ============================================================================

-- Trigger-only helpers: no one calls them directly.
REVOKE ALL ON FUNCTION public.guard_super_admin_role() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_profile_kyc_self_update() FROM PUBLIC, anon, authenticated;

-- Member-callable helpers: allow signed-in users only (block anon).
REVOKE ALL ON FUNCTION public.reset_own_kyc_pending() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reset_own_kyc_pending() TO authenticated;

REVOKE ALL ON FUNCTION public.request_transfer(uuid, uuid, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_transfer(uuid, uuid, numeric, text) TO authenticated;

REVOKE ALL ON FUNCTION public.register_entity(public.entity_type, text, text, text, uuid, text, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_entity(public.entity_type, text, text, text, uuid, text, text, text, text, text) TO authenticated;

-- Admin/finance/compliance/super_admin helpers: service_role only.
REVOKE ALL ON FUNCTION public.approve_entity(uuid, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.approve_entity(uuid, text, uuid) TO service_role;

REVOKE ALL ON FUNCTION public.suspend_entity(uuid, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.suspend_entity(uuid, text, uuid) TO service_role;

REVOKE ALL ON FUNCTION public.list_super_admins(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_super_admins(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.grant_super_admin_by_email(text, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.grant_super_admin_by_email(text, text, uuid) TO service_role;

REVOKE ALL ON FUNCTION public.revoke_super_admin(uuid, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_super_admin(uuid, text, uuid) TO service_role;

REVOKE ALL ON FUNCTION public.pay_expense(uuid, text, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pay_expense(uuid, text, text, uuid) TO service_role;

REVOKE ALL ON FUNCTION public.approve_expense(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.approve_expense(uuid, uuid) TO service_role;

REVOKE ALL ON FUNCTION public.reject_expense(uuid, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reject_expense(uuid, text, uuid) TO service_role;

REVOKE ALL ON FUNCTION public.post_expense(text, text, numeric, date, text, text, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.post_expense(text, text, numeric, date, text, text, text, uuid) TO service_role;

REVOKE ALL ON FUNCTION public.post_transfer(uuid, uuid, numeric, text, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.post_transfer(uuid, uuid, numeric, text, text, uuid) TO service_role;

REVOKE ALL ON FUNCTION public.clear_transfer(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.clear_transfer(uuid, uuid) TO service_role;

REVOKE ALL ON FUNCTION public.reject_transfer(uuid, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reject_transfer(uuid, text, uuid) TO service_role;

REVOKE ALL ON FUNCTION public.post_balance_adjustment(uuid, public.adjustment_direction, numeric, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.post_balance_adjustment(uuid, public.adjustment_direction, numeric, text, uuid) TO service_role;
