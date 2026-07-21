
-- 1. Profile approval status
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','rejected','deactivated')),
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS rejection_reason text;

-- Backfill existing users as approved so we don't lock anyone out
UPDATE public.profiles SET status = 'approved', approved_at = COALESCE(approved_at, created_at)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS profiles_status_idx ON public.profiles(status);

-- 2. Notifications table
CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  category text NOT NULL DEFAULT 'system',
  title text NOT NULL,
  body text,
  link text,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS notif_read_own ON public.notifications;
CREATE POLICY notif_read_own ON public.notifications FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR user_id IS NULL OR private.has_role(auth.uid(), 'super_admin'::public.app_role));

DROP POLICY IF EXISTS notif_update_own ON public.notifications;
CREATE POLICY notif_update_own ON public.notifications FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS notif_admin_all ON public.notifications;
CREATE POLICY notif_admin_all ON public.notifications FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'super_admin'::public.app_role))
  WITH CHECK (private.has_role(auth.uid(), 'super_admin'::public.app_role));

CREATE INDEX IF NOT EXISTS notifications_user_id_idx ON public.notifications(user_id, created_at DESC);

-- 3. FX rates cache
CREATE TABLE IF NOT EXISTS public.fx_rates (
  base text NOT NULL,
  quote text NOT NULL,
  rate numeric NOT NULL,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  source text NOT NULL DEFAULT 'exchangerate.host',
  PRIMARY KEY (base, quote)
);
GRANT SELECT ON public.fx_rates TO anon, authenticated;
GRANT ALL ON public.fx_rates TO service_role;
ALTER TABLE public.fx_rates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fx_read_all ON public.fx_rates;
CREATE POLICY fx_read_all ON public.fx_rates FOR SELECT TO anon, authenticated USING (true);

-- 4. Recycle bin
CREATE TABLE IF NOT EXISTS public.recycle_bin (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_table text NOT NULL,
  entity_id text NOT NULL,
  payload jsonb NOT NULL,
  deleted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  deleted_at timestamptz NOT NULL DEFAULT now(),
  purge_after timestamptz NOT NULL DEFAULT (now() + interval '30 days')
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.recycle_bin TO authenticated;
GRANT ALL ON public.recycle_bin TO service_role;
ALTER TABLE public.recycle_bin ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS recycle_admin ON public.recycle_bin;
CREATE POLICY recycle_admin ON public.recycle_bin FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'super_admin'::public.app_role))
  WITH CHECK (private.has_role(auth.uid(), 'super_admin'::public.app_role));

-- 5. Expand branding_settings
ALTER TABLE public.branding_settings
  ADD COLUMN IF NOT EXISTS secondary_color text NOT NULL DEFAULT '#0f766e',
  ADD COLUMN IF NOT EXISTS login_hero_url text,
  ADD COLUMN IF NOT EXISTS login_tagline text,
  ADD COLUMN IF NOT EXISTS org_legal_name text,
  ADD COLUMN IF NOT EXISTS org_address text,
  ADD COLUMN IF NOT EXISTS org_registration_no text,
  ADD COLUMN IF NOT EXISTS footer_html text,
  ADD COLUMN IF NOT EXISTS support_email text,
  ADD COLUMN IF NOT EXISTS support_phone text;

-- 6. Approval RPCs
CREATE OR REPLACE FUNCTION public.approve_user(_uid uuid, _note text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, private, pg_temp AS $fn$
DECLARE _caller uuid := auth.uid(); _actor_email text; _target_email text;
BEGIN
  IF _caller IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT (private.has_role(_caller,'super_admin'::public.app_role)
       OR private.has_role(_caller,'compliance_officer'::public.app_role)) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  UPDATE public.profiles
     SET status='approved', approved_at=now(), approved_by=_caller, rejection_reason=NULL
   WHERE id=_uid;
  SELECT email INTO _actor_email FROM auth.users WHERE id=_caller;
  SELECT email INTO _target_email FROM auth.users WHERE id=_uid;
  INSERT INTO public.audit_log (actor_id, actor_email, actor_role, action, target, meta)
  VALUES (_caller, _actor_email,
    CASE WHEN private.has_role(_caller,'super_admin'::public.app_role) THEN 'super_admin' ELSE 'compliance_officer' END,
    'user.approved', _uid::text, jsonb_build_object('email', _target_email, 'note', _note));
END; $fn$;

CREATE OR REPLACE FUNCTION public.reject_user(_uid uuid, _reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, private, pg_temp AS $fn$
DECLARE _caller uuid := auth.uid(); _actor_email text; _target_email text;
BEGIN
  IF _caller IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT (private.has_role(_caller,'super_admin'::public.app_role)
       OR private.has_role(_caller,'compliance_officer'::public.app_role)) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF _reason IS NULL OR length(btrim(_reason)) < 3 THEN RAISE EXCEPTION 'reason_required'; END IF;
  UPDATE public.profiles
     SET status='rejected', approved_by=_caller, rejection_reason=_reason, approved_at=now()
   WHERE id=_uid;
  SELECT email INTO _actor_email FROM auth.users WHERE id=_caller;
  SELECT email INTO _target_email FROM auth.users WHERE id=_uid;
  INSERT INTO public.audit_log (actor_id, actor_email, actor_role, action, target, meta)
  VALUES (_caller, _actor_email,
    CASE WHEN private.has_role(_caller,'super_admin'::public.app_role) THEN 'super_admin' ELSE 'compliance_officer' END,
    'user.rejected', _uid::text, jsonb_build_object('email', _target_email, 'reason', _reason));
END; $fn$;

CREATE OR REPLACE FUNCTION public.set_user_active(_uid uuid, _active boolean, _reason text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, private, pg_temp AS $fn$
DECLARE _caller uuid := auth.uid(); _actor_email text;
BEGIN
  IF _caller IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT private.has_role(_caller,'super_admin'::public.app_role) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  UPDATE public.profiles
     SET status = CASE WHEN _active THEN 'approved' ELSE 'deactivated' END
   WHERE id=_uid;
  SELECT email INTO _actor_email FROM auth.users WHERE id=_caller;
  INSERT INTO public.audit_log (actor_id, actor_email, actor_role, action, target, meta)
  VALUES (_caller, _actor_email, 'super_admin',
    CASE WHEN _active THEN 'user.reactivated' ELSE 'user.deactivated' END,
    _uid::text, jsonb_build_object('reason', _reason));
END; $fn$;

REVOKE EXECUTE ON FUNCTION public.approve_user(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.reject_user(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.set_user_active(uuid, boolean, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.approve_user(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_user(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_user_active(uuid, boolean, text) TO authenticated;

-- 7. Purge RPCs
CREATE OR REPLACE FUNCTION public.purge_notifications(_scope text DEFAULT 'read', _before timestamptz DEFAULT NULL)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, private, pg_temp AS $fn$
DECLARE _caller uuid := auth.uid(); _count int; _actor_email text;
BEGIN
  IF _caller IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT private.has_role(_caller,'super_admin'::public.app_role) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF _scope = 'all' THEN
    DELETE FROM public.notifications WHERE (_before IS NULL OR created_at < _before);
  ELSIF _scope = 'read' THEN
    DELETE FROM public.notifications WHERE read_at IS NOT NULL AND (_before IS NULL OR created_at < _before);
  ELSE RAISE EXCEPTION 'invalid_scope'; END IF;
  GET DIAGNOSTICS _count = ROW_COUNT;
  SELECT email INTO _actor_email FROM auth.users WHERE id=_caller;
  INSERT INTO public.audit_log(actor_id, actor_email, actor_role, action, target, meta)
  VALUES (_caller, _actor_email, 'super_admin', 'system.purge', 'notifications',
    jsonb_build_object('scope', _scope, 'before', _before, 'deleted', _count));
  RETURN _count;
END; $fn$;

CREATE OR REPLACE FUNCTION public.purge_audit_log(_before timestamptz)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, private, pg_temp AS $fn$
DECLARE _caller uuid := auth.uid(); _count int; _actor_email text;
BEGIN
  IF _caller IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT private.has_role(_caller,'super_admin'::public.app_role) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF _before IS NULL OR _before > now() - interval '7 days' THEN
    RAISE EXCEPTION 'must_be_older_than_7_days';
  END IF;
  DELETE FROM public.audit_log WHERE created_at < _before AND action <> 'system.purge';
  GET DIAGNOSTICS _count = ROW_COUNT;
  SELECT email INTO _actor_email FROM auth.users WHERE id=_caller;
  INSERT INTO public.audit_log(actor_id, actor_email, actor_role, action, target, meta)
  VALUES (_caller, _actor_email, 'super_admin', 'system.purge', 'audit_log',
    jsonb_build_object('before', _before, 'deleted', _count));
  RETURN _count;
END; $fn$;

CREATE OR REPLACE FUNCTION public.purge_recycle_bin(_all boolean DEFAULT false)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, private, pg_temp AS $fn$
DECLARE _caller uuid := auth.uid(); _count int; _actor_email text;
BEGIN
  IF _caller IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT private.has_role(_caller,'super_admin'::public.app_role) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF _all THEN
    DELETE FROM public.recycle_bin;
  ELSE
    DELETE FROM public.recycle_bin WHERE purge_after < now();
  END IF;
  GET DIAGNOSTICS _count = ROW_COUNT;
  SELECT email INTO _actor_email FROM auth.users WHERE id=_caller;
  INSERT INTO public.audit_log(actor_id, actor_email, actor_role, action, target, meta)
  VALUES (_caller, _actor_email, 'super_admin', 'system.purge', 'recycle_bin',
    jsonb_build_object('all', _all, 'deleted', _count));
  RETURN _count;
END; $fn$;

REVOKE EXECUTE ON FUNCTION public.purge_notifications(text, timestamptz) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.purge_audit_log(timestamptz) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.purge_recycle_bin(boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.purge_notifications(text, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.purge_audit_log(timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.purge_recycle_bin(boolean) TO authenticated;

-- 8. FX upsert helper (service_role only)
CREATE OR REPLACE FUNCTION public.upsert_fx_rate(_base text, _quote text, _rate numeric)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
  INSERT INTO public.fx_rates(base, quote, rate, fetched_at)
  VALUES (upper(_base), upper(_quote), _rate, now())
  ON CONFLICT (base, quote) DO UPDATE SET rate = EXCLUDED.rate, fetched_at = now();
$fn$;
REVOKE EXECUTE ON FUNCTION public.upsert_fx_rate(text, text, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_fx_rate(text, text, numeric) TO service_role;
