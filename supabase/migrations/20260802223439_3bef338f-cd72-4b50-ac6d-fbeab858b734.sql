-- Requesting a change: gated on approvals.create
CREATE OR REPLACE FUNCTION public.request_settings_change(_kind settings_change_kind, _payload jsonb, _summary text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
DECLARE _uid uuid := auth.uid(); _id uuid; _email text; _role text;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT private.has_permission(_uid, 'approvals', 'create') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
  END IF;
  IF _summary IS NULL OR length(btrim(_summary)) < 5 THEN RAISE EXCEPTION 'summary_required'; END IF;

  INSERT INTO public.settings_change_requests (kind, payload, summary, requested_by)
  VALUES (_kind, _payload, _summary, _uid)
  RETURNING id INTO _id;

  SELECT email INTO _email FROM auth.users WHERE id = _uid;
  SELECT ur.role::text INTO _role FROM public.user_roles ur WHERE ur.user_id = _uid LIMIT 1;
  INSERT INTO public.audit_log (actor_id, actor_email, actor_role, action, target, meta)
  VALUES (_uid, _email, coalesce(_role, 'member'), 'settings.change.requested', _id::text,
          jsonb_build_object('kind', _kind, 'summary', _summary));
  RETURN _id;
END; $$;

-- Approving a change: gated on approvals.approve + two-person rule
CREATE OR REPLACE FUNCTION public.approve_settings_change(_id uuid, _note text)
RETURNS settings_change_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
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
  -- Two-person rule: the requester may never approve their own change.
  IF _row.requested_by = _uid THEN RAISE EXCEPTION 'two_person_rule_violation' USING ERRCODE='42501'; END IF;

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

    UPDATE public.settings_change_requests
       SET status='applied', reviewed_by=_uid, reviewed_at=now(), review_note=_note, applied_at=now()
     WHERE id=_id
     RETURNING * INTO _row;
  EXCEPTION WHEN OTHERS THEN
    UPDATE public.settings_change_requests
       SET status='failed', reviewed_by=_uid, reviewed_at=now(),
           review_note=coalesce(_note,'') || ' | error: ' || SQLERRM
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

-- Rejecting a change: gated on approvals.reject + two-person rule
CREATE OR REPLACE FUNCTION public.reject_settings_change(_id uuid, _reason text)
RETURNS settings_change_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
DECLARE _uid uuid := auth.uid(); _row public.settings_change_requests%ROWTYPE; _email text; _role text;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT private.has_permission(_uid, 'approvals', 'reject') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
  END IF;
  IF _reason IS NULL OR length(btrim(_reason)) < 3 THEN RAISE EXCEPTION 'reason_required'; END IF;

  SELECT * INTO _row FROM public.settings_change_requests WHERE id = _id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
  IF _row.status <> 'pending' THEN RAISE EXCEPTION 'not_pending'; END IF;
  IF _row.requested_by = _uid THEN RAISE EXCEPTION 'two_person_rule_violation' USING ERRCODE='42501'; END IF;

  UPDATE public.settings_change_requests
     SET status='rejected', reviewed_by=_uid, reviewed_at=now(), review_note=_reason
   WHERE id=_id
   RETURNING * INTO _row;

  SELECT email INTO _email FROM auth.users WHERE id = _uid;
  SELECT ur.role::text INTO _role FROM public.user_roles ur WHERE ur.user_id = _uid LIMIT 1;
  INSERT INTO public.audit_log (actor_id, actor_email, actor_role, action, target, meta)
  VALUES (_uid, _email, coalesce(_role,'member'), 'settings.change.rejected', _id::text,
          jsonb_build_object('kind', _row.kind, 'reason', _reason));
  RETURN _row;
END; $$;

-- Queue visibility for anyone with approvals.view
DROP POLICY IF EXISTS "super_admins read change requests" ON public.settings_change_requests;
CREATE POLICY "approval staff read change requests" ON public.settings_change_requests
  FOR SELECT TO authenticated
  USING (private.has_permission(auth.uid(), 'approvals', 'view') OR requested_by = auth.uid());