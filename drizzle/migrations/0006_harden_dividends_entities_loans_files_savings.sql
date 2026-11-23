DO $$
DECLARE fn text; def text;
BEGIN
  FOREACH fn IN ARRAY ARRAY['public.approve_dividend_run(uuid,uuid,text)','public.reject_dividend_run(uuid,uuid,text)','public.execute_dividend_run(uuid,uuid)'] LOOP
    def := pg_get_functiondef(fn::regprocedure);
    IF position('actor_must_be_caller' in def) = 0 THEN
      def := regexp_replace(def, E'\nBEGIN\n',
        E'\nBEGIN\n  IF COALESCE(auth.role(), '''') <> ''service_role'' AND (auth.uid() IS NULL OR _actor_id IS DISTINCT FROM auth.uid()) THEN\n    RAISE EXCEPTION ''actor_must_be_caller'' USING ERRCODE = ''42501'';\n  END IF;\n');
      EXECUTE def;
    END IF;
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', fn);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.savings_held_amount(_account_id uuid)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
  SELECT CASE WHEN auth.uid() IS NULL
      OR EXISTS (SELECT 1 FROM public.savings_accounts a WHERE a.id = _account_id AND a.user_id = auth.uid())
      OR private.has_role(auth.uid(),'super_admin') OR private.has_role(auth.uid(),'admin')
      OR private.has_role(auth.uid(),'finance_officer') OR private.has_role(auth.uid(),'manager')
      OR private.has_role(auth.uid(),'auditor') OR private.has_role(auth.uid(),'teller')
    THEN
      COALESCE((SELECT SUM(amount) FROM public.savings_withdrawal_requests
                WHERE account_id = _account_id AND status IN ('pending','approved')), 0)
      + COALESCE((SELECT SUM(amount) FROM public.savings_holds
                WHERE account_id = _account_id AND status = 'active'), 0)
    ELSE NULL END;
$function$;
REVOKE ALL ON FUNCTION public.savings_held_amount(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.savings_held_amount(uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS "own savings insertable" ON public.savings_accounts;
CREATE POLICY "own savings insertable" ON public.savings_accounts FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND COALESCE(balance, 0) = 0);

DO $$
DECLARE def text;
BEGIN
  def := pg_get_functiondef('public.register_entity(entity_type,text,text,text,uuid,text,text,text,text,text)'::regprocedure);
  IF position('parent_not_managed' in def) = 0 THEN
    def := replace(def,
      E'IF _type = ''department'' AND _parent_entity_id IS NULL THEN RAISE EXCEPTION ''parent_required''; END IF;',
      E'IF _type = ''department'' AND _parent_entity_id IS NULL THEN RAISE EXCEPTION ''parent_required''; END IF;\n  IF _parent_entity_id IS NOT NULL AND NOT (private.is_entity_manager(_uid, _parent_entity_id)\n     OR private.has_role(_uid, ''super_admin'') OR private.has_role(_uid, ''compliance_officer'')) THEN\n    RAISE EXCEPTION ''parent_not_managed'' USING ERRCODE = ''42501'';\n  END IF;');
    EXECUTE def;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.entities_guard_privileged_columns()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;
  IF (NEW.status IS DISTINCT FROM OLD.status OR NEW.parent_entity_id IS DISTINCT FROM OLD.parent_entity_id
      OR NEW.created_by IS DISTINCT FROM OLD.created_by)
     AND NOT (private.has_role(auth.uid(),'super_admin') OR private.has_role(auth.uid(),'compliance_officer')) THEN
    RAISE EXCEPTION 'Only compliance staff can change an organisation''s status or parent' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.entities_guard_privileged_columns() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS entities_guard_privileged_columns_trg ON public.entities;
CREATE TRIGGER entities_guard_privileged_columns_trg BEFORE UPDATE ON public.entities
  FOR EACH ROW EXECUTE FUNCTION public.entities_guard_privileged_columns();

CREATE OR REPLACE FUNCTION public.loans_guard_self_decision()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NEW.user_id = auth.uid()
     AND (NEW.status IS DISTINCT FROM OLD.status OR NEW.amount IS DISTINCT FROM OLD.amount) THEN
    RAISE EXCEPTION 'You cannot decide or change your own loan' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.loans_guard_self_decision() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS loans_guard_self_decision_trg ON public.loans;
CREATE TRIGGER loans_guard_self_decision_trg BEFORE UPDATE ON public.loans
  FOR EACH ROW EXECUTE FUNCTION public.loans_guard_self_decision();

CREATE OR REPLACE FUNCTION public.member_files_guard_review_update()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public', 'pg_temp' AS $function$
BEGIN
  IF auth.uid() IS NOT NULL AND (
       NEW.storage_path IS DISTINCT FROM OLD.storage_path
    OR NEW.owner_id IS DISTINCT FROM OLD.owner_id
    OR NEW.uploaded_by IS DISTINCT FROM OLD.uploaded_by) THEN
    RAISE EXCEPTION 'File location and ownership cannot be changed';
  END IF;
  IF NEW.filename IS DISTINCT FROM OLD.filename
     OR NEW.mime_type IS DISTINCT FROM OLD.mime_type
     OR NEW.size_bytes IS DISTINCT FROM OLD.size_bytes
     OR NEW.checksum IS DISTINCT FROM OLD.checksum THEN
    IF OLD.owner_id <> auth.uid() THEN
      RAISE EXCEPTION 'Reviewers may only update review fields on member documents';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;