
-- 1) Private schema for SECURITY DEFINER helpers (not exposed via PostgREST)
CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA private TO postgres, service_role;

-- 2) Recreate helper functions in the private schema
CREATE OR REPLACE FUNCTION private.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

CREATE OR REPLACE FUNCTION private.is_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('super_admin','compliance_officer','loan_officer','finance_officer','auditor')
  )
$$;

CREATE OR REPLACE FUNCTION private.can_read_all(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT private.is_admin(_user_id)
$$;

-- Lock down execution: RLS policy evaluation runs as function owner (postgres)
-- for SECURITY DEFINER, so we only need to grant to roles that call these
-- helpers directly. RLS-only usage does not require anon/authenticated EXECUTE
-- because policies are evaluated by the DB with definer rights on the fn.
REVOKE ALL ON FUNCTION private.has_role(uuid, public.app_role) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.is_admin(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.can_read_all(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.has_role(uuid, public.app_role) TO postgres, service_role;
GRANT EXECUTE ON FUNCTION private.is_admin(uuid) TO postgres, service_role;
GRANT EXECUTE ON FUNCTION private.can_read_all(uuid) TO postgres, service_role;

-- We still need authenticated to execute these when referenced from RLS,
-- because Postgres checks EXECUTE on the invoker for policy expressions.
GRANT EXECUTE ON FUNCTION private.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION private.is_admin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION private.can_read_all(uuid) TO authenticated;
-- authenticated cannot resolve them via PostgREST because `private` is not in
-- the exposed schemas list, and cannot resolve them via SQL because they
-- lack USAGE on the `private` schema.

-- 3) Recreate every policy that referenced the public helpers
-- user_roles
DROP POLICY IF EXISTS "admins read all roles" ON public.user_roles;
CREATE POLICY "admins read all roles" ON public.user_roles
  FOR SELECT TO authenticated USING (private.is_admin(auth.uid()));

-- profiles
DROP POLICY IF EXISTS "admins read all profiles" ON public.profiles;
CREATE POLICY "admins read all profiles" ON public.profiles
  FOR SELECT TO authenticated USING (private.can_read_all(auth.uid()));

DROP POLICY IF EXISTS "compliance updates profiles" ON public.profiles;
CREATE POLICY "compliance updates profiles" ON public.profiles
  FOR UPDATE TO authenticated
  USING (private.has_role(auth.uid(),'super_admin') OR private.has_role(auth.uid(),'compliance_officer'))
  WITH CHECK (private.has_role(auth.uid(),'super_admin') OR private.has_role(auth.uid(),'compliance_officer'));

-- savings_plans
DROP POLICY IF EXISTS "finance manages plans" ON public.savings_plans;
CREATE POLICY "finance manages plans" ON public.savings_plans
  FOR ALL TO authenticated
  USING (private.has_role(auth.uid(),'super_admin') OR private.has_role(auth.uid(),'finance_officer'))
  WITH CHECK (private.has_role(auth.uid(),'super_admin') OR private.has_role(auth.uid(),'finance_officer'));

-- savings_accounts
DROP POLICY IF EXISTS "admins read all savings" ON public.savings_accounts;
CREATE POLICY "admins read all savings" ON public.savings_accounts
  FOR SELECT TO authenticated USING (private.can_read_all(auth.uid()));

DROP POLICY IF EXISTS "finance updates savings" ON public.savings_accounts;
CREATE POLICY "finance updates savings" ON public.savings_accounts
  FOR UPDATE TO authenticated
  USING (private.has_role(auth.uid(),'super_admin') OR private.has_role(auth.uid(),'finance_officer'))
  WITH CHECK (private.has_role(auth.uid(),'super_admin') OR private.has_role(auth.uid(),'finance_officer'));

-- loans
DROP POLICY IF EXISTS "admins read all loans" ON public.loans;
CREATE POLICY "admins read all loans" ON public.loans
  FOR SELECT TO authenticated USING (private.can_read_all(auth.uid()));

DROP POLICY IF EXISTS "loan officers decide" ON public.loans;
CREATE POLICY "loan officers decide" ON public.loans
  FOR UPDATE TO authenticated
  USING (private.has_role(auth.uid(),'super_admin') OR private.has_role(auth.uid(),'loan_officer'))
  WITH CHECK (private.has_role(auth.uid(),'super_admin') OR private.has_role(auth.uid(),'loan_officer'));

-- transactions
DROP POLICY IF EXISTS "admins read all txns" ON public.transactions;
CREATE POLICY "admins read all txns" ON public.transactions
  FOR SELECT TO authenticated USING (private.can_read_all(auth.uid()));

DROP POLICY IF EXISTS "finance inserts txns" ON public.transactions;
CREATE POLICY "finance inserts txns" ON public.transactions
  FOR INSERT TO authenticated
  WITH CHECK (private.has_role(auth.uid(),'super_admin') OR private.has_role(auth.uid(),'finance_officer'));

-- audit_log SELECT: admins only, via private helper
DROP POLICY IF EXISTS "admins read audit" ON public.audit_log;
CREATE POLICY "admins read audit" ON public.audit_log
  FOR SELECT TO authenticated USING (private.is_admin(auth.uid()));

-- 4) Drop the now-unused public helper functions (were exposed via PostgREST)
DROP FUNCTION IF EXISTS public.has_role(uuid, public.app_role);
DROP FUNCTION IF EXISTS public.is_admin(uuid);
DROP FUNCTION IF EXISTS public.can_read_all(uuid);

-- 5) Lock down the new-user trigger helper — only the trigger (superuser) runs it
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

-- 6) Harden audit_log INSERT: prevent forging actor_email / actor_role
DROP POLICY IF EXISTS "authenticated can append audit" ON public.audit_log;
CREATE POLICY "authenticated can append audit" ON public.audit_log
  FOR INSERT TO authenticated
  WITH CHECK (
    actor_id = auth.uid()
    AND (
      actor_email IS NULL
      OR lower(actor_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    )
    AND (
      actor_role IS NULL
      OR EXISTS (
        SELECT 1 FROM public.user_roles ur
        WHERE ur.user_id = auth.uid()
          AND ur.role::text = actor_role
      )
    )
  );
