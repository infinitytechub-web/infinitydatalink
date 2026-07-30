DROP POLICY IF EXISTS "own txns insertable" ON public.transactions;
REVOKE INSERT ON public.transactions FROM authenticated;
GRANT INSERT ON public.transactions TO authenticated; -- finance-officer policy still gates rows
