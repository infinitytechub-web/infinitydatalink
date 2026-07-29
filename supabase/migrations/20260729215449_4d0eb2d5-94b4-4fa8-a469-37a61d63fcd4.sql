REVOKE ALL ON FUNCTION public.open_fixed_deposit(uuid, uuid, numeric, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.open_fixed_deposit(uuid, uuid, numeric, text, uuid) TO service_role;

REVOKE ALL ON FUNCTION public.break_fixed_deposit(uuid, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.break_fixed_deposit(uuid, text, uuid) TO service_role;

REVOKE ALL ON FUNCTION public.contribute_to_pot(uuid, uuid, numeric, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.contribute_to_pot(uuid, uuid, numeric, text, uuid) TO service_role;

REVOKE ALL ON FUNCTION private.is_pot_member(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.is_savings_staff(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.is_pot_member(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.is_savings_staff(uuid) TO authenticated, service_role;