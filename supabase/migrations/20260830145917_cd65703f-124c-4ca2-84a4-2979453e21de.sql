CREATE OR REPLACE FUNCTION public.clear_my_read_notifications()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  _uid uuid := auth.uid();
  _n integer := 0;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  WITH removed AS (
    DELETE FROM public.notifications
    WHERE user_id = _uid
      AND read_at IS NOT NULL
    RETURNING 1
  )
  SELECT count(*) INTO _n FROM removed;

  RETURN _n;
END;
$$;

REVOKE ALL ON FUNCTION public.clear_my_read_notifications() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.clear_my_read_notifications() TO authenticated;