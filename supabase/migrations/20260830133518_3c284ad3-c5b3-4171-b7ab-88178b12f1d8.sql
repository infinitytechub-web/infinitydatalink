CREATE TYPE public.support_status AS ENUM ('open','in_progress','awaiting_member','resolved','closed');
CREATE TYPE public.support_priority AS ENUM ('low','normal','high','urgent');
CREATE TYPE public.support_category AS ENUM ('savings','loans','payments','kyc','account','other');

CREATE SEQUENCE public.support_ticket_seq;

CREATE OR REPLACE FUNCTION public.gen_support_ref()
RETURNS text
LANGUAGE sql
VOLATILE
SET search_path = public
AS $$
  SELECT 'TKT-' || lpad(nextval('public.support_ticket_seq')::text, 6, '0')
$$;

CREATE TABLE public.support_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ref text NOT NULL UNIQUE DEFAULT public.gen_support_ref(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subject text NOT NULL,
  category public.support_category NOT NULL DEFAULT 'other',
  priority public.support_priority NOT NULL DEFAULT 'normal',
  status public.support_status NOT NULL DEFAULT 'open',
  assignee_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  attachment_path text,
  first_response_at timestamptz,
  resolved_at timestamptz,
  closed_at timestamptz,
  reopened_at timestamptz,
  resolution_note text,
  last_member_activity_at timestamptz NOT NULL DEFAULT now(),
  last_staff_activity_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX support_tickets_user_idx ON public.support_tickets (user_id, created_at DESC);
CREATE INDEX support_tickets_status_idx ON public.support_tickets (status, created_at DESC);
CREATE INDEX support_tickets_assignee_idx ON public.support_tickets (assignee_id);

GRANT SELECT, INSERT, UPDATE ON public.support_tickets TO authenticated;
GRANT ALL ON public.support_tickets TO service_role;
GRANT USAGE ON SEQUENCE public.support_ticket_seq TO authenticated, service_role;

ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members read own tickets"
  ON public.support_tickets FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Support staff read all tickets"
  ON public.support_tickets FOR SELECT TO authenticated
  USING (
    private.has_role(auth.uid(), 'super_admin'::public.app_role)
    OR private.has_role(auth.uid(), 'admin'::public.app_role)
    OR private.has_role(auth.uid(), 'manager'::public.app_role)
    OR private.has_role(auth.uid(), 'support_officer'::public.app_role)
    OR private.has_role(auth.uid(), 'auditor'::public.app_role)
  );

CREATE POLICY "Members open own tickets"
  ON public.support_tickets FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Support staff update tickets"
  ON public.support_tickets FOR UPDATE TO authenticated
  USING (
    private.has_role(auth.uid(), 'super_admin'::public.app_role)
    OR private.has_role(auth.uid(), 'admin'::public.app_role)
    OR private.has_role(auth.uid(), 'manager'::public.app_role)
    OR private.has_role(auth.uid(), 'support_officer'::public.app_role)
  )
  WITH CHECK (
    private.has_role(auth.uid(), 'super_admin'::public.app_role)
    OR private.has_role(auth.uid(), 'admin'::public.app_role)
    OR private.has_role(auth.uid(), 'manager'::public.app_role)
    OR private.has_role(auth.uid(), 'support_officer'::public.app_role)
  );

CREATE TABLE public.support_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  author_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  author_role text,
  is_internal boolean NOT NULL DEFAULT false,
  is_staff boolean NOT NULL DEFAULT false,
  body text NOT NULL,
  attachment_path text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX support_messages_ticket_idx ON public.support_messages (ticket_id, created_at);

GRANT SELECT, INSERT ON public.support_messages TO authenticated;
GRANT ALL ON public.support_messages TO service_role;

ALTER TABLE public.support_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members read own ticket messages"
  ON public.support_messages FOR SELECT TO authenticated
  USING (
    is_internal = false
    AND EXISTS (
      SELECT 1 FROM public.support_tickets t
      WHERE t.id = support_messages.ticket_id AND t.user_id = auth.uid()
    )
  );

CREATE POLICY "Support staff read all ticket messages"
  ON public.support_messages FOR SELECT TO authenticated
  USING (
    private.has_role(auth.uid(), 'super_admin'::public.app_role)
    OR private.has_role(auth.uid(), 'admin'::public.app_role)
    OR private.has_role(auth.uid(), 'manager'::public.app_role)
    OR private.has_role(auth.uid(), 'support_officer'::public.app_role)
    OR private.has_role(auth.uid(), 'auditor'::public.app_role)
  );

CREATE POLICY "Members reply to own tickets"
  ON public.support_messages FOR INSERT TO authenticated
  WITH CHECK (
    author_id = auth.uid()
    AND is_internal = false
    AND is_staff = false
    AND EXISTS (
      SELECT 1 FROM public.support_tickets t
      WHERE t.id = support_messages.ticket_id AND t.user_id = auth.uid()
    )
  );

CREATE POLICY "Support staff reply to tickets"
  ON public.support_messages FOR INSERT TO authenticated
  WITH CHECK (
    author_id = auth.uid()
    AND (
      private.has_role(auth.uid(), 'super_admin'::public.app_role)
      OR private.has_role(auth.uid(), 'admin'::public.app_role)
      OR private.has_role(auth.uid(), 'manager'::public.app_role)
      OR private.has_role(auth.uid(), 'support_officer'::public.app_role)
    )
  );

CREATE TRIGGER support_tickets_updated_at
  BEFORE UPDATE ON public.support_tickets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
