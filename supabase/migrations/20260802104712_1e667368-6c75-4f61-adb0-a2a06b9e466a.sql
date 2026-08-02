-- Recycle-bin-backed notification purge for super admins.
CREATE OR REPLACE FUNCTION public.recycle_notifications(
  _scope text DEFAULT 'read',
  _before timestamp with time zone DEFAULT NULL,
  _retention_days integer DEFAULT 30
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
DECLARE
  _caller uuid := auth.uid();
  _count int;
  _actor_email text;
  _keep interval;
BEGIN
  IF _caller IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT private.has_role(_caller, 'super_admin'::public.app_role) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF _scope NOT IN ('read', 'unread', 'all', 'system') THEN
    RAISE EXCEPTION 'invalid_scope';
  END IF;

  _keep := make_interval(days => GREATEST(1, LEAST(COALESCE(_retention_days, 30), 365)));

  WITH doomed AS (
    SELECT n.*
      FROM public.notifications n
     WHERE (_before IS NULL OR n.created_at < _before)
       AND (
         _scope = 'all'
         OR (_scope = 'read' AND n.read_at IS NOT NULL)
         OR (_scope = 'unread' AND n.read_at IS NULL)
         OR (_scope = 'system' AND (
              n.category LIKE 'system.%'
              OR n.category LIKE 'audit.%'
              OR n.category LIKE 'internal.%'
              OR n.category LIKE '%auto_flagged'
            ))
       )
  ), moved AS (
    INSERT INTO public.recycle_bin (entity_table, entity_id, payload, deleted_by, purge_after)
    SELECT 'notifications', d.id::text, to_jsonb(d), _caller, now() + _keep
      FROM doomed d
    RETURNING entity_id
  ), gone AS (
    DELETE FROM public.notifications
     WHERE id::text IN (SELECT entity_id FROM moved)
    RETURNING id
  )
  SELECT count(*)::int INTO _count FROM gone;

  SELECT email INTO _actor_email FROM auth.users WHERE id = _caller;
  INSERT INTO public.audit_log(actor_id, actor_email, actor_role, action, target, meta)
  VALUES (_caller, _actor_email, 'super_admin', 'system.purge', 'notifications',
          jsonb_build_object('scope', _scope, 'before', _before, 'deleted', _count,
                             'destination', 'recycle_bin', 'retention_days', _retention_days));

  RETURN _count;
END;
$function$;

REVOKE ALL ON FUNCTION public.recycle_notifications(text, timestamp with time zone, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.recycle_notifications(text, timestamp with time zone, integer) TO authenticated;

-- Restore a recycled notification back into the live table.
CREATE OR REPLACE FUNCTION public.restore_recycled_notification(_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
DECLARE
  _caller uuid := auth.uid();
  _row public.recycle_bin;
  _actor_email text;
BEGIN
  IF _caller IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT private.has_role(_caller, 'super_admin'::public.app_role) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO _row FROM public.recycle_bin WHERE id = _id AND entity_table = 'notifications';
  IF NOT FOUND THEN RETURN false; END IF;

  INSERT INTO public.notifications (id, user_id, category, title, body, link, read_at, created_at)
  SELECT (_row.payload->>'id')::uuid,
         NULLIF(_row.payload->>'user_id','')::uuid,
         _row.payload->>'category',
         _row.payload->>'title',
         _row.payload->>'body',
         _row.payload->>'link',
         NULLIF(_row.payload->>'read_at','')::timestamptz,
         COALESCE(NULLIF(_row.payload->>'created_at','')::timestamptz, now())
  ON CONFLICT (id) DO NOTHING;

  DELETE FROM public.recycle_bin WHERE id = _id;

  SELECT email INTO _actor_email FROM auth.users WHERE id = _caller;
  INSERT INTO public.audit_log(actor_id, actor_email, actor_role, action, target, meta)
  VALUES (_caller, _actor_email, 'super_admin', 'system.restore', 'notifications',
          jsonb_build_object('recycle_id', _id, 'notification_id', _row.payload->>'id'));

  RETURN true;
END;
$function$;

REVOKE ALL ON FUNCTION public.restore_recycled_notification(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.restore_recycled_notification(uuid) TO authenticated;