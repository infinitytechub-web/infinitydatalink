
-- ============ ENUMS ============
CREATE TYPE public.app_role AS ENUM (
  'super_admin',
  'compliance_officer',
  'loan_officer',
  'finance_officer',
  'auditor',
  'member'
);

CREATE TYPE public.kyc_status AS ENUM ('pending', 'active', 'rejected');
CREATE TYPE public.member_tier AS ENUM ('standard', 'premium');
CREATE TYPE public.loan_status AS ENUM ('pending', 'approved', 'rejected', 'active', 'closed');
CREATE TYPE public.txn_kind AS ENUM ('deposit', 'withdrawal', 'loan_disbursement', 'loan_repayment', 'fee', 'interest');
CREATE TYPE public.txn_status AS ENUM ('cleared', 'pending', 'failed');

-- ============ PROFILES ============
CREATE TABLE public.profiles (
  id UUID NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  member_no TEXT UNIQUE,
  full_name TEXT,
  phone TEXT,
  region TEXT,
  national_id TEXT,
  tier public.member_tier NOT NULL DEFAULT 'standard',
  kyc public.kyc_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- ============ USER_ROLES ============
CREATE TABLE public.user_roles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Security-definer role check (no recursion)
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

CREATE OR REPLACE FUNCTION public.is_admin(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('super_admin','compliance_officer','loan_officer','finance_officer','auditor')
  )
$$;

CREATE OR REPLACE FUNCTION public.can_read_all(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.is_admin(_user_id)
$$;

-- ============ SAVINGS PLANS + ACCOUNTS ============
CREATE TABLE public.savings_plans (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  schedule TEXT NOT NULL,
  interest_rate NUMERIC(5,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.savings_plans TO authenticated;
GRANT ALL ON public.savings_plans TO service_role;
ALTER TABLE public.savings_plans ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.savings_accounts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES public.savings_plans(id) ON DELETE RESTRICT,
  balance NUMERIC(14,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, plan_id)
);
GRANT SELECT, INSERT, UPDATE ON public.savings_accounts TO authenticated;
GRANT ALL ON public.savings_accounts TO service_role;
ALTER TABLE public.savings_accounts ENABLE ROW LEVEL SECURITY;

-- ============ LOANS ============
CREATE TABLE public.loans (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ref TEXT NOT NULL UNIQUE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product TEXT NOT NULL,
  amount NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  term_months INT NOT NULL CHECK (term_months > 0),
  interest_rate NUMERIC(5,2) NOT NULL DEFAULT 0,
  status public.loan_status NOT NULL DEFAULT 'pending',
  purpose TEXT,
  decided_by UUID REFERENCES auth.users(id),
  decided_at TIMESTAMPTZ,
  decision_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.loans TO authenticated;
GRANT ALL ON public.loans TO service_role;
ALTER TABLE public.loans ENABLE ROW LEVEL SECURITY;

-- ============ TRANSACTIONS ============
CREATE TABLE public.transactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ref TEXT NOT NULL UNIQUE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind public.txn_kind NOT NULL,
  amount NUMERIC(14,2) NOT NULL,
  status public.txn_status NOT NULL DEFAULT 'cleared',
  channel TEXT,
  savings_account_id UUID REFERENCES public.savings_accounts(id) ON DELETE SET NULL,
  loan_id UUID REFERENCES public.loans(id) ON DELETE SET NULL,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.transactions TO authenticated;
GRANT ALL ON public.transactions TO service_role;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

-- ============ AUDIT LOG ============
CREATE TABLE public.audit_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  actor_id UUID REFERENCES auth.users(id),
  actor_email TEXT,
  actor_role TEXT,
  action TEXT NOT NULL,
  target TEXT,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.audit_log TO authenticated;
GRANT ALL ON public.audit_log TO service_role;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- ============ RLS POLICIES ============
-- user_roles: user reads own; admins read all
CREATE POLICY "own roles readable" ON public.user_roles
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "admins read all roles" ON public.user_roles
  FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));

-- profiles
CREATE POLICY "own profile readable" ON public.profiles
  FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "own profile writable" ON public.profiles
  FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE POLICY "own profile insertable" ON public.profiles
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "admins read all profiles" ON public.profiles
  FOR SELECT TO authenticated USING (public.can_read_all(auth.uid()));
CREATE POLICY "compliance updates profiles" ON public.profiles
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'compliance_officer'))
  WITH CHECK (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'compliance_officer'));

-- savings_plans (read for all authenticated; admin manage)
CREATE POLICY "plans readable" ON public.savings_plans
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "finance manages plans" ON public.savings_plans
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'finance_officer'))
  WITH CHECK (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'finance_officer'));

-- savings_accounts
CREATE POLICY "own savings readable" ON public.savings_accounts
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "admins read all savings" ON public.savings_accounts
  FOR SELECT TO authenticated USING (public.can_read_all(auth.uid()));
CREATE POLICY "own savings insertable" ON public.savings_accounts
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "finance updates savings" ON public.savings_accounts
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'finance_officer'))
  WITH CHECK (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'finance_officer'));

-- loans
CREATE POLICY "own loans readable" ON public.loans
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "admins read all loans" ON public.loans
  FOR SELECT TO authenticated USING (public.can_read_all(auth.uid()));
CREATE POLICY "members apply for loans" ON public.loans
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id AND status = 'pending');
CREATE POLICY "loan officers decide" ON public.loans
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'loan_officer'))
  WITH CHECK (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'loan_officer'));

-- transactions
CREATE POLICY "own txns readable" ON public.transactions
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "admins read all txns" ON public.transactions
  FOR SELECT TO authenticated USING (public.can_read_all(auth.uid()));
CREATE POLICY "own txns insertable" ON public.transactions
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "finance inserts txns" ON public.transactions
  FOR INSERT TO authenticated WITH CHECK (
    public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'finance_officer')
  );

-- audit_log
CREATE POLICY "admins read audit" ON public.audit_log
  FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));
CREATE POLICY "authenticated can append audit" ON public.audit_log
  FOR INSERT TO authenticated WITH CHECK (actor_id = auth.uid());

-- ============ TRIGGERS ============
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER trg_profiles_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_savings_updated_at BEFORE UPDATE ON public.savings_accounts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_loans_updated_at BEFORE UPDATE ON public.loans
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-create profile + default member role on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  next_no INT;
BEGIN
  SELECT COALESCE(MAX(NULLIF(regexp_replace(member_no, '\D', '', 'g'), '')::INT), 0) + 1
    INTO next_no FROM public.profiles;

  INSERT INTO public.profiles (id, full_name, member_no)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email,'@',1)),
    'MB-' || lpad(next_no::text, 5, '0')
  )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'member')
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Seed default savings plans
INSERT INTO public.savings_plans (name, schedule, interest_rate) VALUES
  ('Cooperative Shares', 'Monthly', 6.5),
  ('Susu Daily', 'Daily', 4.0),
  ('Real Estate Fund', 'Weekly', 8.0),
  ('Education Fund', 'Quarterly', 7.0)
ON CONFLICT (name) DO NOTHING;
