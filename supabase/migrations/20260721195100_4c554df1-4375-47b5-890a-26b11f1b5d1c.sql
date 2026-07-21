-- 1. Enums
DO $$ BEGIN
  CREATE TYPE public.settings_change_kind AS ENUM ('branding', 'institution', 'role_grant', 'role_revoke');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.settings_change_status AS ENUM ('pending', 'approved', 'rejected', 'applied', 'failed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. settings_change_requests
CREATE TABLE IF NOT EXISTS public.settings_change_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind public.settings_change_kind NOT NULL,
  status public.settings_change_status NOT NULL DEFAULT 'pending',
  payload jsonb NOT NULL,
  summary text,
  requested_by uuid NOT NULL,
  requested_at timestamptz NOT NULL DEFAULT now(),
  reviewed_by uuid,
  reviewed_at timestamptz,
  review_note text,
  applied_at timestamptz,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.settings_change_requests TO authenticated;
GRANT ALL ON public.settings_change_requests TO service_role;
ALTER TABLE public.settings_change_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "super_admins read change requests" ON public.settings_change_requests;
CREATE POLICY "super_admins read change requests" ON public.settings_change_requests
  FOR SELECT TO authenticated USING (private.has_role(auth.uid(), 'super_admin'::public.app_role));

DROP POLICY IF EXISTS "super_admins insert change requests" ON public.settings_change_requests;
CREATE POLICY "super_admins insert change requests" ON public.settings_change_requests
  FOR INSERT TO authenticated
  WITH CHECK (private.has_role(auth.uid(), 'super_admin'::public.app_role) AND requested_by = auth.uid());

DROP TRIGGER IF EXISTS settings_change_requests_updated_at ON public.settings_change_requests;
CREATE TRIGGER settings_change_requests_updated_at
  BEFORE UPDATE ON public.settings_change_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS settings_change_requests_status_idx
  ON public.settings_change_requests (status, requested_at DESC);

-- 3. settings_snapshots
CREATE TABLE IF NOT EXISTS public.settings_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text NOT NULL,
  note text,
  branding jsonb,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, DELETE ON public.settings_snapshots TO authenticated;
GRANT ALL ON public.settings_snapshots TO service_role;
ALTER TABLE public.settings_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "super_admins read snapshots" ON public.settings_snapshots;
CREATE POLICY "super_admins read snapshots" ON public.settings_snapshots
  FOR SELECT TO authenticated USING (private.has_role(auth.uid(), 'super_admin'::public.app_role));

DROP POLICY IF EXISTS "super_admins insert snapshots" ON public.settings_snapshots;
CREATE POLICY "super_admins insert snapshots" ON public.settings_snapshots
  FOR INSERT TO authenticated
  WITH CHECK (private.has_role(auth.uid(), 'super_admin'::public.app_role) AND created_by = auth.uid());

DROP POLICY IF EXISTS "super_admins delete snapshots" ON public.settings_snapshots;
CREATE POLICY "super_admins delete snapshots" ON public.settings_snapshots
  FOR DELETE TO authenticated USING (private.has_role(auth.uid(), 'super_admin'::public.app_role));

-- 4. Helper (private): apply branding payload
CREATE OR REPLACE FUNCTION private.apply_branding_payload(_payload jsonb, _actor uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE public.branding_settings b SET
    app_name            = COALESCE(r.app_name, b.app_name),
    tagline             = COALESCE(r.tagline, b.tagline),
    logo_path           = COALESCE(r.logo_path, b.logo_path),
    favicon_path        = COALESCE(r.favicon_path, b.favicon_path),
    primary_color       = COALESCE(r.primary_color, b.primary_color),
    secondary_color     = COALESCE(r.secondary_color, b.secondary_color),
    accent_color        = COALESCE(r.accent_color, b.accent_color),
    login_hero_url      = COALESCE(r.login_hero_url, b.login_hero_url),
    login_tagline       = COALESCE(r.login_tagline, b.login_tagline),
    org_legal_name      = COALESCE(r.org_legal_name, b.org_legal_name),
    org_address         = COALESCE(r.org_address, b.org_address),
    org_registration_no = COALESCE(r.org_registration_no, b.org_registration_no),
    footer_html         = COALESCE(r.footer_html, b.footer_html),
    support_email       = COALESCE(r.support_email, b.support_email),
    support_phone       = COALESCE(r.support_phone, b.support_phone),
    email_from_name     = COALESCE(r.email_from_name, b.email_from_name),
    email_reply_to      = COALESCE(r.email_reply_to, b.email_reply_to),
    email_header_html   = COALESCE(r.email_header_html, b.email_header_html),
    email_footer_html   = COALESCE(r.email_footer_html, b.email_footer_html),
    updated_by          = _actor,
    updated_at          = now()
  FROM jsonb_populate_record(NULL::public.branding_settings, _payload) AS r
  WHERE b.id = 1;
END; $$;

REVOKE EXECUTE ON FUNCTION private.apply_branding_payload(jsonb, uuid) FROM PUBLIC;

-- 5. Request a change (any super_admin)
CREATE OR REPLACE FUNCTION public.request_settings_change(
  _kind public.settings_change_kind,
  _payload jsonb,
  _summary text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
DECLARE _uid uuid := auth.uid(); _id uuid; _email text;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT private.has_role(_uid, 'super_admin'::public.app_role) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
  END IF;
  INSERT INTO public.settings_change_requests (kind, payload, summary, requested_by)
  VALUES (_kind, _payload, _summary, _uid)
  RETURNING id INTO _id;

  SELECT email INTO _email FROM auth.users WHERE id = _uid;
  INSERT INTO public.audit_log (actor_id, actor_email, actor_role, action, target, meta)
  VALUES (_uid, _email, 'super_admin', 'settings.change.requested', _id::text,
          jsonb_build_object('kind', _kind, 'summary', _summary));
  RETURN _id;
END; $$;

-- 6. Approve + apply
CREATE OR REPLACE FUNCTION public.approve_settings_change(_id uuid, _note text)
RETURNS public.settings_change_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
DECLARE _uid uuid := auth.uid(); _row public.settings_change_requests%ROWTYPE; _email text;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT private.has_role(_uid, 'super_admin'::public.app_role) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
  END IF;

  SELECT * INTO _row FROM public.settings_change_requests WHERE id = _id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
  IF _row.status <> 'pending' THEN RAISE EXCEPTION 'not_pending'; END IF;

  BEGIN
    IF _row.kind = 'branding' THEN
      PERFORM private.apply_branding_payload(_row.payload, _uid);
    ELSIF _row.kind = 'role_grant' THEN
      PERFORM public.admin_assign_role(
        (_row.payload->>'user_id')::uuid,
        (_row.payload->>'role')::public.app_role,
        _uid,
        _row.payload->>'note'
      );
    ELSIF _row.kind = 'role_revoke' THEN
      PERFORM public.admin_revoke_role(
        (_row.payload->>'user_id')::uuid,
        (_row.payload->>'role')::public.app_role,
        _uid,
        COALESCE(_row.payload->>'reason', 'Approved via settings workflow')
      );
    ELSIF _row.kind = 'institution' THEN
      NULL; -- client-side; intent recorded via audit only
    END IF;

    UPDATE public.settings_change_requests
       SET status='applied', reviewed_by=_uid, reviewed_at=now(),
           review_note=_note, applied_at=now(), error=NULL
     WHERE id=_id
     RETURNING * INTO _row;
  EXCEPTION WHEN OTHERS THEN
    UPDATE public.settings_change_requests
       SET status='failed', reviewed_by=_uid, reviewed_at=now(),
           review_note=_note, error=SQLERRM
     WHERE id=_id
     RETURNING * INTO _row;
  END;

  SELECT email INTO _email FROM auth.users WHERE id = _uid;
  INSERT INTO public.audit_log (actor_id, actor_email, actor_role, action, target, meta)
  VALUES (_uid, _email, 'super_admin',
          CASE WHEN _row.status='applied' THEN 'settings.change.applied' ELSE 'settings.change.failed' END,
          _id::text,
          jsonb_build_object('kind', _row.kind, 'note', _note, 'error', _row.error));
  RETURN _row;
END; $$;

-- 7. Reject
CREATE OR REPLACE FUNCTION public.reject_settings_change(_id uuid, _reason text)
RETURNS public.settings_change_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
DECLARE _uid uuid := auth.uid(); _row public.settings_change_requests%ROWTYPE; _email text;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT private.has_role(_uid, 'super_admin'::public.app_role) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
  END IF;
  IF _reason IS NULL OR length(btrim(_reason)) < 3 THEN RAISE EXCEPTION 'reason_required'; END IF;

  UPDATE public.settings_change_requests
     SET status='rejected', reviewed_by=_uid, reviewed_at=now(), review_note=_reason
   WHERE id=_id AND status='pending'
   RETURNING * INTO _row;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found_or_not_pending'; END IF;

  SELECT email INTO _email FROM auth.users WHERE id = _uid;
  INSERT INTO public.audit_log (actor_id, actor_email, actor_role, action, target, meta)
  VALUES (_uid, _email, 'super_admin', 'settings.change.rejected', _id::text,
          jsonb_build_object('kind', _row.kind, 'reason', _reason));
  RETURN _row;
END; $$;

-- 8. Snapshot create
CREATE OR REPLACE FUNCTION public.create_settings_snapshot(_label text, _note text)
RETURNS public.settings_snapshots
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
DECLARE _uid uuid := auth.uid(); _row public.settings_snapshots%ROWTYPE;
        _branding jsonb; _email text;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT private.has_role(_uid, 'super_admin'::public.app_role) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
  END IF;

  SELECT to_jsonb(b) INTO _branding FROM public.branding_settings b WHERE id = 1;

  INSERT INTO public.settings_snapshots (label, note, branding, created_by)
  VALUES (
    COALESCE(NULLIF(btrim(_label), ''), 'Snapshot ' || to_char(now(), 'YYYY-MM-DD HH24:MI')),
    _note, _branding, _uid
  )
  RETURNING * INTO _row;

  SELECT email INTO _email FROM auth.users WHERE id = _uid;
  INSERT INTO public.audit_log (actor_id, actor_email, actor_role, action, target, meta)
  VALUES (_uid, _email, 'super_admin', 'settings.snapshot.created', _row.id::text,
          jsonb_build_object('label', _row.label));
  RETURN _row;
END; $$;

-- 9. Snapshot restore
CREATE OR REPLACE FUNCTION public.restore_settings_snapshot(_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
DECLARE _uid uuid := auth.uid(); _snap public.settings_snapshots%ROWTYPE; _email text;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT private.has_role(_uid, 'super_admin'::public.app_role) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
  END IF;

  SELECT * INTO _snap FROM public.settings_snapshots WHERE id = _id;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;

  IF _snap.branding IS NOT NULL THEN
    PERFORM private.apply_branding_payload(_snap.branding, _uid);
  END IF;

  SELECT email INTO _email FROM auth.users WHERE id = _uid;
  INSERT INTO public.audit_log (actor_id, actor_email, actor_role, action, target, meta)
  VALUES (_uid, _email, 'super_admin', 'settings.snapshot.restored', _id::text,
          jsonb_build_object('label', _snap.label));
END; $$;

-- 10. Lock down execute privileges
REVOKE EXECUTE ON FUNCTION public.request_settings_change(public.settings_change_kind, jsonb, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.approve_settings_change(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.reject_settings_change(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_settings_snapshot(text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.restore_settings_snapshot(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.request_settings_change(public.settings_change_kind, jsonb, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.approve_settings_change(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.reject_settings_change(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.create_settings_snapshot(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.restore_settings_snapshot(uuid) TO service_role;