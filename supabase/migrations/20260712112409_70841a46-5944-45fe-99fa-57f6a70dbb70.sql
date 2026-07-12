
DO $$ BEGIN CREATE TYPE public.entity_type AS ENUM ('group','department','institution'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.entity_status AS ENUM ('pending','active','suspended','closed'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.entity_role AS ENUM ('owner','admin','member'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.entities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type public.entity_type NOT NULL,
  name TEXT NOT NULL,
  registration_no TEXT,
  tax_id TEXT,
  parent_entity_id UUID REFERENCES public.entities(id) ON DELETE SET NULL,
  contact_email TEXT,
  contact_phone TEXT,
  region TEXT,
  address_line TEXT,
  digital_address TEXT,
  status public.entity_status NOT NULL DEFAULT 'pending',
  kyc_notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  reviewed_by UUID REFERENCES auth.users(id),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_entities_type ON public.entities(type);
CREATE INDEX IF NOT EXISTS idx_entities_status ON public.entities(status);
CREATE INDEX IF NOT EXISTS idx_entities_parent ON public.entities(parent_entity_id);
GRANT SELECT, INSERT, UPDATE ON public.entities TO authenticated;
GRANT ALL ON public.entities TO service_role;
ALTER TABLE public.entities ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_entities_updated BEFORE UPDATE ON public.entities
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.entity_memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id UUID NOT NULL REFERENCES public.entities(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role public.entity_role NOT NULL DEFAULT 'member',
  status TEXT NOT NULL DEFAULT 'active',
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(entity_id, profile_id)
);
CREATE INDEX IF NOT EXISTS idx_em_entity ON public.entity_memberships(entity_id);
CREATE INDEX IF NOT EXISTS idx_em_profile ON public.entity_memberships(profile_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.entity_memberships TO authenticated;
GRANT ALL ON public.entity_memberships TO service_role;
ALTER TABLE public.entity_memberships ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.entity_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id UUID NOT NULL REFERENCES public.entities(id) ON DELETE CASCADE,
  doc_type TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  original_name TEXT,
  mime_type TEXT,
  size_bytes BIGINT,
  uploaded_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ed_entity ON public.entity_documents(entity_id);
GRANT SELECT, INSERT, DELETE ON public.entity_documents TO authenticated;
GRANT ALL ON public.entity_documents TO service_role;
ALTER TABLE public.entity_documents ENABLE ROW LEVEL SECURITY;

-- Helper: is caller a manager of the given entity?
CREATE OR REPLACE FUNCTION private.is_entity_manager(_uid uuid, _entity_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, private, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.entity_memberships
    WHERE entity_id = _entity_id AND profile_id = _uid AND role IN ('owner','admin')
  );
$$;
REVOKE EXECUTE ON FUNCTION private.is_entity_manager(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.is_entity_manager(uuid,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION private.is_entity_member(_uid uuid, _entity_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, private, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.entity_memberships
    WHERE entity_id = _entity_id AND profile_id = _uid
  );
$$;
REVOKE EXECUTE ON FUNCTION private.is_entity_member(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.is_entity_member(uuid,uuid) TO authenticated;

-- Policies: entities
CREATE POLICY "entities_staff_all" ON public.entities FOR ALL TO authenticated
  USING (private.has_role(auth.uid(),'super_admin'::public.app_role) OR private.has_role(auth.uid(),'compliance_officer'::public.app_role) OR private.has_role(auth.uid(),'auditor'::public.app_role))
  WITH CHECK (private.has_role(auth.uid(),'super_admin'::public.app_role) OR private.has_role(auth.uid(),'compliance_officer'::public.app_role));
CREATE POLICY "entities_manager_read" ON public.entities FOR SELECT TO authenticated
  USING (private.is_entity_member(auth.uid(), id));
CREATE POLICY "entities_manager_update" ON public.entities FOR UPDATE TO authenticated
  USING (private.is_entity_manager(auth.uid(), id))
  WITH CHECK (private.is_entity_manager(auth.uid(), id));
CREATE POLICY "entities_self_insert" ON public.entities FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());

-- Policies: memberships
CREATE POLICY "em_staff_all" ON public.entity_memberships FOR ALL TO authenticated
  USING (private.has_role(auth.uid(),'super_admin'::public.app_role) OR private.has_role(auth.uid(),'compliance_officer'::public.app_role) OR private.has_role(auth.uid(),'auditor'::public.app_role))
  WITH CHECK (private.has_role(auth.uid(),'super_admin'::public.app_role) OR private.has_role(auth.uid(),'compliance_officer'::public.app_role));
CREATE POLICY "em_self_read" ON public.entity_memberships FOR SELECT TO authenticated
  USING (profile_id = auth.uid() OR private.is_entity_manager(auth.uid(), entity_id));
CREATE POLICY "em_manager_write" ON public.entity_memberships FOR INSERT TO authenticated
  WITH CHECK (private.is_entity_manager(auth.uid(), entity_id));
CREATE POLICY "em_manager_update" ON public.entity_memberships FOR UPDATE TO authenticated
  USING (private.is_entity_manager(auth.uid(), entity_id))
  WITH CHECK (private.is_entity_manager(auth.uid(), entity_id));
CREATE POLICY "em_manager_delete" ON public.entity_memberships FOR DELETE TO authenticated
  USING (private.is_entity_manager(auth.uid(), entity_id));

-- Policies: documents
CREATE POLICY "ed_staff_all" ON public.entity_documents FOR ALL TO authenticated
  USING (private.has_role(auth.uid(),'super_admin'::public.app_role) OR private.has_role(auth.uid(),'compliance_officer'::public.app_role) OR private.has_role(auth.uid(),'auditor'::public.app_role))
  WITH CHECK (private.has_role(auth.uid(),'super_admin'::public.app_role) OR private.has_role(auth.uid(),'compliance_officer'::public.app_role));
CREATE POLICY "ed_manager_read" ON public.entity_documents FOR SELECT TO authenticated
  USING (private.is_entity_manager(auth.uid(), entity_id));
CREATE POLICY "ed_manager_insert" ON public.entity_documents FOR INSERT TO authenticated
  WITH CHECK (private.is_entity_manager(auth.uid(), entity_id) AND uploaded_by = auth.uid());
CREATE POLICY "ed_manager_delete" ON public.entity_documents FOR DELETE TO authenticated
  USING (private.is_entity_manager(auth.uid(), entity_id));

-- Self-service registration RPC: create entity + assign creator as owner atomically
CREATE OR REPLACE FUNCTION public.register_entity(
  _type public.entity_type,
  _name text,
  _registration_no text,
  _tax_id text,
  _parent_entity_id uuid,
  _contact_email text,
  _contact_phone text,
  _region text,
  _address_line text,
  _digital_address text
) RETURNS public.entities
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, private, pg_temp AS $$
DECLARE _uid uuid := auth.uid(); _row public.entities%ROWTYPE;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF _name IS NULL OR length(trim(_name)) < 2 THEN RAISE EXCEPTION 'name_required'; END IF;
  IF _type = 'department' AND _parent_entity_id IS NULL THEN RAISE EXCEPTION 'parent_required'; END IF;

  INSERT INTO public.entities (type, name, registration_no, tax_id, parent_entity_id,
    contact_email, contact_phone, region, address_line, digital_address, created_by, status)
  VALUES (_type, _name, _registration_no, _tax_id, _parent_entity_id,
    _contact_email, _contact_phone, _region, _address_line, _digital_address, _uid, 'pending')
  RETURNING * INTO _row;

  INSERT INTO public.entity_memberships (entity_id, profile_id, role)
  VALUES (_row.id, _uid, 'owner');

  INSERT INTO public.audit_log (actor_id, actor_email, actor_role, action, target, meta)
  SELECT _uid, u.email, 'member', 'entity.registered', _row.id::text,
    jsonb_build_object('type',_type,'name',_name)
  FROM auth.users u WHERE u.id = _uid;

  RETURN _row;
END $$;
REVOKE EXECUTE ON FUNCTION public.register_entity(public.entity_type,text,text,text,uuid,text,text,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.register_entity(public.entity_type,text,text,text,uuid,text,text,text,text,text) TO authenticated;

-- Approve / suspend RPCs
CREATE OR REPLACE FUNCTION public.approve_entity(_entity_id uuid, _note text)
RETURNS public.entities LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, private, pg_temp AS $$
DECLARE _uid uuid := auth.uid(); _row public.entities%ROWTYPE;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT (private.has_role(_uid,'super_admin'::public.app_role) OR private.has_role(_uid,'compliance_officer'::public.app_role)) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
  END IF;
  UPDATE public.entities SET status='active', reviewed_by=_uid, reviewed_at=now(),
    kyc_notes = COALESCE(_note, kyc_notes) WHERE id=_entity_id RETURNING * INTO _row;
  IF NOT FOUND THEN RAISE EXCEPTION 'entity_not_found'; END IF;
  PERFORM private.write_audit(_uid,'entity.approved',_row.id::text, jsonb_build_object('type',_row.type,'name',_row.name,'note',_note));
  RETURN _row;
END $$;
REVOKE EXECUTE ON FUNCTION public.approve_entity(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.approve_entity(uuid,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.suspend_entity(_entity_id uuid, _reason text)
RETURNS public.entities LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, private, pg_temp AS $$
DECLARE _uid uuid := auth.uid(); _row public.entities%ROWTYPE;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT (private.has_role(_uid,'super_admin'::public.app_role) OR private.has_role(_uid,'compliance_officer'::public.app_role)) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
  END IF;
  UPDATE public.entities SET status='suspended', reviewed_by=_uid, reviewed_at=now(),
    kyc_notes = COALESCE(_reason, kyc_notes) WHERE id=_entity_id RETURNING * INTO _row;
  IF NOT FOUND THEN RAISE EXCEPTION 'entity_not_found'; END IF;
  PERFORM private.write_audit(_uid,'entity.suspended',_row.id::text, jsonb_build_object('type',_row.type,'name',_row.name,'reason',_reason));
  RETURN _row;
END $$;
REVOKE EXECUTE ON FUNCTION public.suspend_entity(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.suspend_entity(uuid,text) TO authenticated;
