
DO $$ BEGIN
  CREATE TYPE public.recurring_frequency AS ENUM ('daily','weekly','monthly');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.recurring_status AS ENUM ('active','paused');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.savings_recurring_contributions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES public.savings_accounts(id) ON DELETE CASCADE,
  amount NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  channel TEXT NOT NULL DEFAULT 'mobile_money',
  note TEXT,
  frequency public.recurring_frequency NOT NULL,
  day_of_week SMALLINT CHECK (day_of_week BETWEEN 0 AND 6),
  day_of_month SMALLINT CHECK (day_of_month BETWEEN 1 AND 28),
  status public.recurring_status NOT NULL DEFAULT 'active',
  next_run_at TIMESTAMPTZ NOT NULL,
  last_run_at TIMESTAMPTZ,
  last_run_status TEXT,
  last_run_error TEXT,
  runs_completed INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_recurring_user ON public.savings_recurring_contributions(user_id);
CREATE INDEX IF NOT EXISTS idx_recurring_due
  ON public.savings_recurring_contributions(next_run_at) WHERE status = 'active';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.savings_recurring_contributions TO authenticated;
GRANT ALL ON public.savings_recurring_contributions TO service_role;

ALTER TABLE public.savings_recurring_contributions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "members manage own recurring" ON public.savings_recurring_contributions;
CREATE POLICY "members manage own recurring"
  ON public.savings_recurring_contributions
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "staff view recurring" ON public.savings_recurring_contributions;
CREATE POLICY "staff view recurring"
  ON public.savings_recurring_contributions
  FOR SELECT
  USING (
    private.has_role(auth.uid(), 'super_admin'::public.app_role)
    OR private.has_role(auth.uid(), 'finance_officer'::public.app_role)
  );

DROP TRIGGER IF EXISTS trg_recurring_updated_at ON public.savings_recurring_contributions;
CREATE TRIGGER trg_recurring_updated_at
  BEFORE UPDATE ON public.savings_recurring_contributions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.advance_recurring_next_run(
  _from TIMESTAMPTZ,
  _frequency public.recurring_frequency,
  _dow SMALLINT,
  _dom SMALLINT
) RETURNS TIMESTAMPTZ
LANGUAGE plpgsql IMMUTABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  _next TIMESTAMPTZ;
  _base DATE;
  _target_day SMALLINT;
  _delta INT;
BEGIN
  IF _frequency = 'daily' THEN
    RETURN _from + INTERVAL '1 day';
  ELSIF _frequency = 'weekly' THEN
    _target_day := COALESCE(_dow, EXTRACT(DOW FROM _from)::SMALLINT);
    _base := (_from + INTERVAL '1 day')::DATE;
    _delta := (_target_day - EXTRACT(DOW FROM _base)::INT + 7) % 7;
    RETURN (_base + _delta * INTERVAL '1 day')::TIMESTAMPTZ + (_from::TIME);
  ELSIF _frequency = 'monthly' THEN
    _target_day := COALESCE(_dom, LEAST(EXTRACT(DAY FROM _from)::SMALLINT, 28));
    _next := date_trunc('month', _from) + INTERVAL '1 month'
           + ((_target_day - 1) || ' days')::INTERVAL
           + (_from::TIME);
    RETURN _next;
  END IF;
  RETURN _from + INTERVAL '1 day';
END $$;

REVOKE ALL ON FUNCTION public.advance_recurring_next_run(TIMESTAMPTZ, public.recurring_frequency, SMALLINT, SMALLINT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.advance_recurring_next_run(TIMESTAMPTZ, public.recurring_frequency, SMALLINT, SMALLINT) TO service_role, authenticated;

CREATE OR REPLACE FUNCTION public.run_recurring_savings_contributions()
RETURNS TABLE(schedule_id UUID, outcome TEXT, error TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  _r RECORD;
  _txn_id UUID;
  _err TEXT;
BEGIN
  FOR _r IN
    SELECT * FROM public.savings_recurring_contributions
    WHERE status = 'active' AND next_run_at <= now()
    ORDER BY next_run_at
    LIMIT 500
    FOR UPDATE SKIP LOCKED
  LOOP
    BEGIN
      _txn_id := public.post_savings_contribution(
        _r.account_id, _r.amount, _r.channel,
        COALESCE(_r.note, 'Automatic recurring contribution'),
        _r.user_id
      );

      UPDATE public.savings_recurring_contributions
         SET last_run_at = now(),
             last_run_status = 'ok',
             last_run_error = NULL,
             runs_completed = runs_completed + 1,
             next_run_at = public.advance_recurring_next_run(
               GREATEST(next_run_at, now()), frequency, day_of_week, day_of_month
             )
       WHERE id = _r.id;

      schedule_id := _r.id; outcome := 'ok'; error := NULL; RETURN NEXT;

    EXCEPTION WHEN OTHERS THEN
      _err := SQLERRM;
      UPDATE public.savings_recurring_contributions
         SET last_run_at = now(),
             last_run_status = 'error',
             last_run_error = _err,
             next_run_at = public.advance_recurring_next_run(
               GREATEST(next_run_at, now()), frequency, day_of_week, day_of_month
             )
       WHERE id = _r.id;
      schedule_id := _r.id; outcome := 'error'; error := _err; RETURN NEXT;
    END;
  END LOOP;
  RETURN;
END $$;

REVOKE ALL ON FUNCTION public.run_recurring_savings_contributions() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.run_recurring_savings_contributions() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.run_recurring_savings_contributions() TO service_role;

DO $$ BEGIN CREATE EXTENSION IF NOT EXISTS pg_cron; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN PERFORM cron.unschedule('run-recurring-savings'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
SELECT cron.schedule(
  'run-recurring-savings',
  '5 * * * *',
  $cron$ SELECT public.run_recurring_savings_contributions(); $cron$
);
