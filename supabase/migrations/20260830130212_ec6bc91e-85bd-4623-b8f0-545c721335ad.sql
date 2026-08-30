ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'teller';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'support_officer';

INSERT INTO public.role_permissions (role, module, action)
SELECT r.role, p.module, p.action
FROM (VALUES
  -- Admin: full control over the new modules
  ('admin','teller','view'),('admin','teller','create'),('admin','teller','edit'),('admin','teller','approve'),('admin','teller','export'),('admin','teller','print'),('admin','teller','manage'),
  ('admin','support','view'),('admin','support','create'),('admin','support','edit'),('admin','support','delete'),('admin','support','export'),('admin','support','manage'),
  ('admin','files','view'),('admin','files','create'),('admin','files','edit'),('admin','files','delete'),('admin','files','download'),('admin','files','export'),('admin','files','manage'),
  ('admin','reports','view'),('admin','reports','export'),('admin','reports','print'),('admin','reports','download'),
  -- Manager
  ('manager','teller','view'),('manager','teller','approve'),('manager','teller','export'),('manager','teller','print'),
  ('manager','support','view'),('manager','support','create'),('manager','support','edit'),('manager','support','manage'),
  ('manager','files','view'),('manager','files','create'),('manager','files','download'),('manager','files','export'),
  ('manager','reports','view'),('manager','reports','export'),('manager','reports','print'),('manager','reports','download'),
  -- Teller
  ('teller','teller','view'),('teller','teller','create'),('teller','teller','print'),
  ('teller','members','view'),
  ('teller','savings','view'),('teller','savings','create'),
  ('teller','loans','view'),
  ('teller','payments','view'),('teller','payments','create'),
  ('teller','files','view'),
  ('teller','reports','view'),('teller','reports','print'),
  -- Support officer
  ('support_officer','support','view'),('support_officer','support','create'),('support_officer','support','edit'),('support_officer','support','manage'),
  ('support_officer','members','view'),
  ('support_officer','files','view'),('support_officer','files','create'),('support_officer','files','download'),
  ('support_officer','reports','view'),
  ('support_officer','notifications','view'),
  -- Finance officer
  ('finance_officer','teller','view'),('finance_officer','teller','approve'),('finance_officer','teller','export'),('finance_officer','teller','print'),
  ('finance_officer','reports','view'),('finance_officer','reports','export'),('finance_officer','reports','print'),('finance_officer','reports','download'),
  ('finance_officer','files','view'),('finance_officer','files','create'),('finance_officer','files','download'),
  ('finance_officer','support','view'),
  -- Loan officer
  ('loan_officer','reports','view'),('loan_officer','reports','export'),('loan_officer','reports','print'),('loan_officer','reports','download'),
  ('loan_officer','files','view'),('loan_officer','files','download'),
  ('loan_officer','support','view'),
  -- Compliance officer
  ('compliance_officer','reports','view'),('compliance_officer','reports','export'),('compliance_officer','reports','print'),('compliance_officer','reports','download'),
  ('compliance_officer','files','view'),('compliance_officer','files','create'),('compliance_officer','files','download'),
  ('compliance_officer','support','view'),
  -- Auditor (read-only)
  ('auditor','teller','view'),('auditor','teller','export'),('auditor','teller','print'),
  ('auditor','reports','view'),('auditor','reports','export'),('auditor','reports','print'),('auditor','reports','download'),
  ('auditor','files','view'),('auditor','files','download'),
  ('auditor','support','view')
) AS p(role, module, action)
JOIN (SELECT DISTINCT role FROM (VALUES ('admin'),('manager'),('teller'),('support_officer'),('finance_officer'),('loan_officer'),('compliance_officer'),('auditor')) v(role)) r
  ON r.role = p.role
ON CONFLICT DO NOTHING;