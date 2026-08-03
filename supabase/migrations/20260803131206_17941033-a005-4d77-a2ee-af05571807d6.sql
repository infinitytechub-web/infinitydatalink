CREATE TABLE public.kyc_vault_retention (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  auto_purge_enabled boolean NOT NULL DEFAULT false,
  retention_years integer NOT NULL DEFAULT 7 CHECK (retention_years >= 1 AND retention_years <= 25),
  legal_hold_days integer NOT NULL DEFAULT 30 CHECK (legal_hold_days >= 0 AND legal_hold_days <= 3650),
  last_purge_at timestamptz,
  last_purge_entries integer,
  last_purge_documents integer,
  last_purge_actor text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

GRANT SELECT, UPDATE ON public.kyc_vault_retention TO authenticated;
GRANT ALL ON public.kyc_vault_retention TO service_role;

ALTER TABLE public.kyc_vault_retention ENABLE ROW LEVEL SECURITY;

CREATE POLICY "super_admin read vault retention" ON public.kyc_vault_retention
  FOR SELECT TO authenticated
  USING (private.has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "super_admin update vault retention" ON public.kyc_vault_retention
  FOR UPDATE TO authenticated
  USING (private.has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(), 'super_admin'::app_role));

INSERT INTO public.kyc_vault_retention (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.kyc_vault_retention_touch()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_kyc_vault_retention_touch
BEFORE UPDATE ON public.kyc_vault_retention
FOR EACH ROW EXECUTE FUNCTION public.kyc_vault_retention_touch();

-- New vault snapshots inherit the configured retention window.
CREATE OR REPLACE FUNCTION public.recycle_bin_apply_vault_retention()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_years integer;
  v_hold integer;
BEGIN
  IF NEW.entity_table = 'kyc_review' THEN
    SELECT retention_years, legal_hold_days INTO v_years, v_hold
    FROM public.kyc_vault_retention WHERE id = 1;
    IF v_years IS NOT NULL THEN
      NEW.purge_after := COALESCE(NEW.deleted_at, now())
        + make_interval(years => v_years)
        + make_interval(days => COALESCE(v_hold, 0));
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_recycle_bin_apply_vault_retention
BEFORE INSERT ON public.recycle_bin
FOR EACH ROW EXECUTE FUNCTION public.recycle_bin_apply_vault_retention();

-- Recompute scheduled removal for existing vault snapshots after a policy change.
CREATE OR REPLACE FUNCTION public.reapply_kyc_vault_retention()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_years integer;
  v_hold integer;
  v_count integer;
BEGIN
  IF NOT (private.has_role(auth.uid(), 'super_admin'::app_role)
          OR auth.role() = 'service_role') THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT retention_years, legal_hold_days INTO v_years, v_hold
  FROM public.kyc_vault_retention WHERE id = 1;

  UPDATE public.recycle_bin
  SET purge_after = deleted_at
    + make_interval(years => v_years)
    + make_interval(days => COALESCE(v_hold, 0))
  WHERE entity_table = 'kyc_review';

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.reapply_kyc_vault_retention() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reapply_kyc_vault_retention() TO authenticated, service_role;

-- Snapshots whose retention window has fully elapsed.
CREATE OR REPLACE FUNCTION public.kyc_vault_purge_candidates(_limit integer DEFAULT 200)
RETURNS TABLE (
  id uuid,
  entity_id text,
  deleted_at timestamptz,
  purge_after timestamptz,
  payload jsonb
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT rb.id, rb.entity_id, rb.deleted_at, rb.purge_after, rb.payload
  FROM public.recycle_bin rb
  WHERE rb.entity_table = 'kyc_review'
    AND rb.purge_after <= now()
  ORDER BY rb.purge_after ASC
  LIMIT GREATEST(1, LEAST(COALESCE(_limit, 200), 500));
$$;

REVOKE ALL ON FUNCTION public.kyc_vault_purge_candidates(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.kyc_vault_purge_candidates(integer) TO service_role;