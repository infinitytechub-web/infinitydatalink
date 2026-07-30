CREATE OR REPLACE FUNCTION private.is_entity_owner(_uid uuid, _entity_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'private', 'pg_temp'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.entity_memberships
    WHERE entity_id = _entity_id AND profile_id = _uid AND role = 'owner'
  );
$$;

REVOKE ALL ON FUNCTION private.is_entity_owner(uuid, uuid) FROM PUBLIC, anon, authenticated;

DROP POLICY IF EXISTS "em_manager_write" ON public.entity_memberships;
CREATE POLICY "em_manager_write" ON public.entity_memberships
FOR INSERT TO authenticated
WITH CHECK (
  private.is_entity_manager(auth.uid(), entity_id)
  AND (role <> 'owner' OR private.is_entity_owner(auth.uid(), entity_id))
);

DROP POLICY IF EXISTS "em_manager_update" ON public.entity_memberships;
CREATE POLICY "em_manager_update" ON public.entity_memberships
FOR UPDATE TO authenticated
USING (private.is_entity_manager(auth.uid(), entity_id))
WITH CHECK (
  private.is_entity_manager(auth.uid(), entity_id)
  AND (role <> 'owner' OR private.is_entity_owner(auth.uid(), entity_id))
);
