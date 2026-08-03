-- Shared apply logic for staged change requests
CREATE OR REPLACE FUNCTION private.apply_change_request(_row public.settings_change_requests, _uid uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private', 'pg_temp'
AS $$
BEGIN
  IF _row.kind::text = 'branding' THEN
    PERFORM private.apply_branding_payload(_row.payload, _uid);
  ELSIF _row.kind::text = 'permission_matrix' THEN
    PERFORM private.apply_permission_matrix(_row.payload, _uid);
  ELSIF _row.kind::text = 'payment_config' THEN
    INSERT INTO public.payment_providers(code, label, mode, enabled, config, secret_ref, webhook_path)
    VALUES (
      _row.payload->>'code',
      coalesce(_row.payload->>'label', _row.payload->>'code'),
      coalesce(_row.payload->>'mode', 'sandbox'),
      coalesce((_row.payload->>'enabled')::boolean, false),
      coalesce(_row.payload->'config', '{}'::jsonb),
      _row.payload->>'secret_ref',
      _row.payload->>'webhook_path'
    )
    ON CONFLICT (code) DO UPDATE SET
      label = excluded.label,
      mode = excluded.mode,
      enabled = excluded.enabled,
      config = excluded.config,
      secret_ref = excluded.secret_ref,
      webhook_path = excluded.webhook_path,
      updated_at = now();
  ELSIF _row.kind::text = 'role_grant' THEN
    PERFORM public.admin_assign_role(
      (_row.payload->>'user_id')::uuid,
      (_row.payload->>'role')::public.app_role,
      _uid,
      _row.payload->>'note'
    );
  ELSIF _row.kind::text = 'role_revoke' THEN
    PERFORM public.admin_revoke_role(
      (_row.payload->>'user_id')::uuid,
      (_row.payload->>'role')::public.app_role,
      _uid,
      _row.payload->>'note'
    );
  END IF;
END; $$;

REVOKE ALL ON FUNCTION private.apply_change_request(public.settings_change_requests, uuid) FROM PUBLIC;

-- Approval now delegates to the shared apply routine
CREATE OR REPLACE FUNCTION public.approve_settings_change(_id uuid, _note text)
RETURNS public.settings_change_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private', 'pg_temp'
AS $$
DECLARE _uid uuid := auth.uid(); _row public.settings_change_requests%ROWTYPE; _email text; _role text;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT private.has_permission(_uid, 'approvals', 'approve') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
  END IF;

  SELECT * INTO _row FROM public.settings_change_requests WHERE id = _id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
  IF _row.status <> 'pending' THEN RAISE EXCEPTION 'not_pending'; END IF;
  IF _row.requested_by = _uid THEN RAISE EXCEPTION 'two_person_rule_violation' USING ERRCODE='42501'; END IF;

  BEGIN
    PERFORM private.apply_change_request(_row, _uid);
    UPDATE public.settings_change_requests
       SET status='applied', reviewed_by=_uid, reviewed_at=now(), review_note=_note,
           applied_at=now(), error=NULL
     WHERE id=_id
     RETURNING * INTO _row;
  EXCEPTION WHEN OTHERS THEN
    UPDATE public.settings_change_requests
       SET status='failed', reviewed_by=_uid, reviewed_at=now(),
           review_note=coalesce(_note,''), error=SQLERRM
     WHERE id=_id
     RETURNING * INTO _row;
    RETURN _row;
  END;

  SELECT email INTO _email FROM auth.users WHERE id = _uid;
  SELECT ur.role::text INTO _role FROM public.user_roles ur WHERE ur.user_id = _uid LIMIT 1;
  INSERT INTO public.audit_log (actor_id, actor_email, actor_role, action, target, meta)
  VALUES (_uid, _email, coalesce(_role,'member'), 'settings.change.approved', _id::text,
          jsonb_build_object('kind', _row.kind, 'note', _note, 'requested_by', _row.requested_by));
  RETURN _row;
END; $$;

-- Retry applying an approved or failed request
CREATE OR REPLACE FUNCTION public.apply_settings_change(_id uuid, _note text)
RETURNS public.settings_change_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private', 'pg_temp'
AS $$
DECLARE _uid uuid := auth.uid(); _row public.settings_change_requests%ROWTYPE; _email text; _role text;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT private.has_permission(_uid, 'approvals', 'approve') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
  END IF;
  IF _note IS NULL OR length(btrim(_note)) < 5 THEN RAISE EXCEPTION 'note_required'; END IF;

  SELECT * INTO _row FROM public.settings_change_requests WHERE id = _id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
  IF _row.status NOT IN ('approved', 'failed') THEN RAISE EXCEPTION 'not_appliable'; END IF;
  IF _row.requested_by = _uid THEN RAISE EXCEPTION 'two_person_rule_violation' USING ERRCODE='42501'; END IF;

  BEGIN
    PERFORM private.apply_change_request(_row, _uid);
    UPDATE public.settings_change_requests
       SET status='applied', reviewed_by=_uid, reviewed_at=now(), review_note=_note,
           applied_at=now(), error=NULL
     WHERE id=_id
     RETURNING * INTO _row;
  EXCEPTION WHEN OTHERS THEN
    UPDATE public.settings_change_requests
       SET status='failed', reviewed_by=_uid, reviewed_at=now(), review_note=_note, error=SQLERRM
     WHERE id=_id
     RETURNING * INTO _row;
    RETURN _row;
  END;

  SELECT email INTO _email FROM auth.users WHERE id = _uid;
  SELECT ur.role::text INTO _role FROM public.user_roles ur WHERE ur.user_id = _uid LIMIT 1;
  INSERT INTO public.audit_log (actor_id, actor_email, actor_role, action, target, meta)
  VALUES (_uid, _email, coalesce(_role,'member'), 'settings.change.applied', _id::text,
          jsonb_build_object('kind', _row.kind, 'note', _note, 'requested_by', _row.requested_by));
  RETURN _row;
END; $$;

REVOKE ALL ON FUNCTION public.apply_settings_change(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_settings_change(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_settings_change(uuid, text) TO service_role;