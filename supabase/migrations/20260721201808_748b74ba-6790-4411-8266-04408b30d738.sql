
CREATE TABLE IF NOT EXISTS public.runtime_log_retention (
  id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  auto_purge_enabled BOOLEAN NOT NULL DEFAULT true,
  retention_error_days INT NOT NULL DEFAULT 90 CHECK (retention_error_days BETWEEN 1 AND 3650),
  retention_warning_days INT NOT NULL DEFAULT 30 CHECK (retention_warning_days BETWEEN 1 AND 3650),
  retention_info_days INT NOT NULL DEFAULT 14 CHECK (retention_info_days BETWEEN 1 AND 3650),
  last_purge_at TIMESTAMPTZ,
  last_purge_deleted INT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID
);

GRANT SELECT, INSERT, UPDATE ON public.runtime_log_retention TO authenticated;
GRANT ALL ON public.runtime_log_retention TO service_role;

ALTER TABLE public.runtime_log_retention ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "super_admin read retention" ON public.runtime_log_retention;
CREATE POLICY "super_admin read retention" ON public.runtime_log_retention
  FOR SELECT TO authenticated
  USING (private.has_role(auth.uid(), 'super_admin'::public.app_role));

DROP POLICY IF EXISTS "super_admin update retention" ON public.runtime_log_retention;
CREATE POLICY "super_admin update retention" ON public.runtime_log_retention
  FOR UPDATE TO authenticated
  USING (private.has_role(auth.uid(), 'super_admin'::public.app_role))
  WITH CHECK (private.has_role(auth.uid(), 'super_admin'::public.app_role));

INSERT INTO public.runtime_log_retention (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- Preview: how much would be deleted under current or proposed policy
CREATE OR REPLACE FUNCTION public.preview_runtime_log_retention(
  _error_days INT DEFAULT NULL,
  _warning_days INT DEFAULT NULL,
  _info_days INT DEFAULT NULL
) RETURNS TABLE(
  severity TEXT,
  retention_days INT,
  cutoff TIMESTAMPTZ,
  rows_total BIGINT,
  rows_to_delete BIGINT,
  rows_to_keep BIGINT,
  bytes_to_delete BIGINT,
  bytes_to_keep BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
DECLARE
  _caller UUID := auth.uid();
  _cfg public.runtime_log_retention%ROWTYPE;
  _e INT; _w INT; _i INT;
BEGIN
  IF _caller IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT private.has_role(_caller, 'super_admin'::public.app_role) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO _cfg FROM public.runtime_log_retention WHERE id = 1;
  _e := COALESCE(_error_days, _cfg.retention_error_days);
  _w := COALESCE(_warning_days, _cfg.retention_warning_days);
  _i := COALESCE(_info_days, _cfg.retention_info_days);

  RETURN QUERY
  WITH cfg AS (
    SELECT 'error'::text AS sev, _e AS days UNION ALL
    SELECT 'warning', _w UNION ALL
    SELECT 'info', _i
  ), stats AS (
    SELECT
      c.sev,
      c.days,
      (now() - make_interval(days => c.days)) AS cutoff,
      COUNT(l.*) FILTER (WHERE l.severity = c.sev) AS total,
      COUNT(l.*) FILTER (WHERE l.severity = c.sev AND l.occurred_at < (now() - make_interval(days => c.days))) AS del,
      COALESCE(SUM(pg_column_size(l.*)) FILTER (WHERE l.severity = c.sev AND l.occurred_at < (now() - make_interval(days => c.days))), 0)::BIGINT AS del_bytes,
      COALESCE(SUM(pg_column_size(l.*)) FILTER (WHERE l.severity = c.sev AND l.occurred_at >= (now() - make_interval(days => c.days))), 0)::BIGINT AS keep_bytes
    FROM cfg c
    LEFT JOIN public.runtime_error_logs l ON true
    GROUP BY c.sev, c.days
  )
  SELECT sev, days, cutoff, total, del, (total - del), del_bytes, keep_bytes FROM stats
  ORDER BY CASE sev WHEN 'error' THEN 1 WHEN 'warning' THEN 2 ELSE 3 END;
END;
$$;

REVOKE ALL ON FUNCTION public.preview_runtime_log_retention(INT, INT, INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.preview_runtime_log_retention(INT, INT, INT) TO authenticated;

-- Purge according to policy. Callable by super admin manually and by cron via service_role.
CREATE OR REPLACE FUNCTION public.purge_runtime_error_logs(_manual BOOLEAN DEFAULT false)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
DECLARE
  _caller UUID := auth.uid();
  _cfg public.runtime_log_retention%ROWTYPE;
  _deleted INT := 0;
  _actor_email TEXT;
BEGIN
  IF _manual THEN
    IF _caller IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
    IF NOT private.has_role(_caller, 'super_admin'::public.app_role) THEN
      RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
    END IF;
  END IF;

  SELECT * INTO _cfg FROM public.runtime_log_retention WHERE id = 1;
  IF NOT _manual AND NOT _cfg.auto_purge_enabled THEN
    RETURN 0;
  END IF;

  WITH del AS (
    DELETE FROM public.runtime_error_logs
     WHERE (severity = 'error'   AND occurred_at < now() - make_interval(days => _cfg.retention_error_days))
        OR (severity = 'warning' AND occurred_at < now() - make_interval(days => _cfg.retention_warning_days))
        OR (severity = 'info'    AND occurred_at < now() - make_interval(days => _cfg.retention_info_days))
     RETURNING 1
  )
  SELECT COUNT(*) INTO _deleted FROM del;

  UPDATE public.runtime_log_retention
     SET last_purge_at = now(), last_purge_deleted = _deleted
   WHERE id = 1;

  IF _manual AND _caller IS NOT NULL THEN
    SELECT email INTO _actor_email FROM auth.users WHERE id = _caller;
    INSERT INTO public.audit_log(actor_id, actor_email, actor_role, action, target, meta)
    VALUES (_caller, _actor_email, 'super_admin', 'system.purge', 'runtime_error_logs',
      jsonb_build_object('manual', true, 'deleted', _deleted,
        'retention', jsonb_build_object(
          'error', _cfg.retention_error_days,
          'warning', _cfg.retention_warning_days,
          'info', _cfg.retention_info_days)));
  END IF;

  RETURN _deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.purge_runtime_error_logs(BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.purge_runtime_error_logs(BOOLEAN) TO authenticated, service_role;

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION public.runtime_log_retention_touch()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); NEW.updated_by = COALESCE(auth.uid(), NEW.updated_by); RETURN NEW; END;
$$;
DROP TRIGGER IF EXISTS trg_runtime_log_retention_touch ON public.runtime_log_retention;
CREATE TRIGGER trg_runtime_log_retention_touch BEFORE UPDATE ON public.runtime_log_retention
FOR EACH ROW EXECUTE FUNCTION public.runtime_log_retention_touch();

-- Schedule daily automatic purge (03:15 UTC)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('purge-runtime-error-logs');
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'purge-runtime-error-logs',
  '15 3 * * *',
  $$ SELECT public.purge_runtime_error_logs(false); $$
);
